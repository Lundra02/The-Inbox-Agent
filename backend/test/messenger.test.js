import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import { createMessengerRouter } from "../src/routes/messengerWebhook.js";
import { extractEvents, validSignature, sendReply, askAgent, splitReply } from "../src/services/messengerService.js";
import { processEvent } from "../src/services/messengerWorker.js";

const config = { pageId: "123", token: "test-token", verifyToken: "verify", secret: "secret", version: "v25.0", agentUrl: "http://agent" };
const incoming = { sender: { id: "456" }, recipient: { id: "123" }, timestamp: Date.now(), message: { mid: "m1", text: "Hello" } };
const payload = (event = incoming) => ({ object: "page", entry: [{ id: "123", messaging: [event] }] });
const sign = body => `sha256=${createHmac("sha256", config.secret).update(body).digest("hex")}`;

test("verification, signed intake, durable deduplication, malformed input and storage errors", async t => {
  const stored = new Map();
  let fail = false;
  const events = { async create(event) {
    if (fail) throw new Error("DB down");
    if (stored.has(event.eventId)) throw Object.assign(new Error(), { code: 11000 });
    stored.set(event.eventId, event);
  } };
  const app = express();
  app.use("/webhook", createMessengerRouter({ config, events }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  const verified = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=00123`);
  assert.equal(verified.status, 200); assert.equal(await verified.text(), "00123");
  assert.equal((await fetch(`${url}?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1`)).status, 403);
  const body = JSON.stringify(payload());
  const post = (text = body, signature = sign(text)) => fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body: text });
  assert.equal((await post(body, "bad")).status, 403);
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 200); assert.equal(stored.size, 1);
  assert.equal((await post("{")).status, 400);
  fail = true; assert.equal((await post()).status, 503);
});

test("signature and event filtering include postbacks, exclude echoes and other pages", () => {
  const body = Buffer.from("{}");
  assert.equal(validSignature(body, sign(body), config.secret), true);
  assert.equal(validSignature(Buffer.from("[]"), sign(body), config.secret), false);
  assert.equal(extractEvents(payload(), "123").length, 1);
  assert.equal(extractEvents(payload(), "999").length, 0);
  assert.equal(extractEvents(payload({ ...incoming, message: { ...incoming.message, is_echo: true } }), "123").length, 0);
  assert.equal(extractEvents(payload({ ...incoming, message: undefined, delivery: {} }), "123").length, 0);
  const postback = { ...incoming, message: undefined, postback: { payload: "BOOK_APPOINTMENT" } };
  assert.equal(extractEvents(payload(postback), "123")[0].kind, "postback");
  assert.deepEqual(extractEvents(payload(postback), "123"), extractEvents(payload(postback), "123"));
  assert.deepEqual(extractEvents({ entry: null }, "123"), []);
});

test("Send API chunks Unicode safely and uses authorization header", async () => {
  const text = "😀".repeat(2001);
  assert.equal(splitReply(text).join(""), text);
  const calls = [];
  await sendReply("456", text, config, { post: async (...args) => calls.push(args) });
  assert.equal(calls.length, 3);
  assert.equal(calls[0][2].headers.Authorization, "Bearer test-token");
  assert.equal(calls[0][1].recipient.id, "456");
  assert.ok(calls.every(call => call[1].message.text.length <= 2000));
});

test("agent request timeout and reply validation", async () => {
  assert.equal(await askAgent({ message: "Hi" }, config, { post: async (url, body, options) => {
    assert.equal(url, "http://agent/chat"); assert.equal(options.timeout, 180000);
    return { data: { reply: "Hello" } };
  } }), "Hello");
  await assert.rejects(askAgent({}, config, { post: async () => ({ data: {} }) }));
});


test("Messenger sends only the customer reply and persists escalation via inbox service", async () => {
  let sent;
  const event = { eventId: "123:m1", text: "Angry customer", psid: "456", save: async () => {} };
  await processEvent(event, {
    process: async request => {
      assert.equal(request.channel, "messenger");
      assert.equal(request.sourceEventId, "123:m1");
      return { customerReply: "Sorry, our team will review this.", internalNote: "STAFF ONLY", decision: "escalate" };
    },
    send: async (psid, reply) => { sent = [psid, reply]; },
  });
  assert.equal(event.status, "sent");
  assert.deepEqual(sent, ["456", "Sorry, our team will review this."]);
});

test("Messenger transport failure is held for review without an automatic resend", async () => {
  const event = { eventId: "123:m2", text: "Hello", psid: "456", save: async () => {} };
  let attempts = 0;
  await processEvent(event, { process: async () => ({ customerReply: "Hello" }), send: async () => { attempts++; throw new Error(); } });
  assert.equal(attempts, 1);
  assert.equal(event.status, "review");
  assert.equal(event.failureStage, "send");
});

test("paused Messenger conversations do not send an automated reply", async () => {
  const event = { eventId: "123:m3", text: "Any update?", pageId: "123", psid: "456", save: async () => {} };
  await processEvent(event, { process: async request => {
    assert.equal(request.conversationId, "123:456");
    return { customerReply: "", replySuppressed: true };
  }, send: async () => { throw new Error("Must not send"); } });
  assert.equal(event.status, "sent");
});
