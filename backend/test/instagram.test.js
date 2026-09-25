import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import { createInstagramRouter } from "../src/routes/instagramWebhook.js";
import { instagramConfig, isInstagramConfigured, extractInstagramEvents, sendInstagramReply } from "../src/services/instagramService.js";
import { processEvent } from "../src/services/messengerWorker.js";
import { replyTarget, createStaffReply } from "../src/services/staffReplies.js";
import { processInboxMessage } from "../src/services/inboxService.js";

const config = { pageId: "123", token: "ig-token", verifyToken: "ig-verify", secret: "ig-secret", version: "v25.0" };
const incoming = { sender: { id: "456" }, recipient: { id: "123" }, timestamp: Date.now(), message: { mid: "m1", text: "Hello" } };
const payload = (event = incoming) => ({ object: "instagram", entry: [{ id: "123", messaging: [event] }] });

test("Instagram configuration never falls back to Messenger credentials", () => {
  assert.equal(isInstagramConfigured(instagramConfig({ MESSENGER_PAGE_ACCESS_TOKEN: "fb", META_APP_SECRET: "fb-secret" })), false);
  assert.equal(isInstagramConfigured(config), true);
});

test("Instagram verifies signatures, durably deduplicates, rejects wrong objects and retries storage failures", async t => {
  const stored = new Map(); let fail = false;
  const app = express();
  app.use("/ig", createInstagramRouter({ config, events: { async create(event) {
    if (fail) throw new Error("storage");
    if (stored.has(event.eventId)) throw Object.assign(new Error(), { code: 11000 });
    stored.set(event.eventId, event);
  } } }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/ig`;
  const verified = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=ig-verify&hub.challenge=0001`);
  assert.equal(await verified.text(), "0001");
  assert.equal((await fetch(`${url}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`)).status, 403);
  const post = (body = JSON.stringify(payload()), secret = config.secret) => fetch(url, { method: "POST", body, headers: {
    "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
  } });
  assert.equal((await post(undefined, "messenger-secret")).status, 403);
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 200);
  assert.equal(stored.size, 1); assert.ok(stored.has("instagram:123:m1"));
  assert.equal((await post("{")).status, 400);
  assert.equal((await post(JSON.stringify({ ...payload(), object: "page" }))).status, 400);
  fail = true; assert.equal((await post()).status, 503);
});

test("Instagram filters echoes, foreign accounts, receipts and attachments; normalizes postbacks", () => {
  assert.equal(extractInstagramEvents(payload(), "123").length, 1);
  assert.deepEqual(extractInstagramEvents(payload(), "999"), []);
  for (const message of [{ mid: "x", text: "echo", is_echo: true }, { mid: "x", attachments: [{}] }, undefined]) {
    assert.deepEqual(extractInstagramEvents(payload({ ...incoming, message }), "123"), []);
  }
  assert.deepEqual(extractInstagramEvents(payload({ ...incoming, recipient: { id: "999" } }), "123"), []);
  assert.equal(extractInstagramEvents(payload({ ...incoming, message: undefined, postback: { mid: "p1", payload: "HELP" } }), "123")[0].kind, "postback");
});

test("Instagram sends Unicode text using its own host and token, and requires delivery confirmation", async () => {
  const calls = []; const text = "😀".repeat(1001);
  await sendInstagramReply("456", text, config, { post: async (...args) => { calls.push(args); return { data: { message_id: "sent" } }; } });
  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], "https://graph.instagram.com/v25.0/123/messages");
  assert.equal(calls[0][2].headers.Authorization, "Bearer ig-token");
  assert.deepEqual(calls[0][1].recipient, { id: "456" });
  assert.equal(calls.map(call => call[1].message.text).join(""), text);
  assert.ok(calls.every(call => call[1].message.text.length <= 1000));
  await assert.rejects(sendInstagramReply("456", "Hi", config, { post: async () => ({ data: {} }) }));
});

test("Instagram shares the worker, hides internal notes, suppresses held replies and holds send failures", async () => {
  for (const mode of ["normal", "paused", "failure"]) {
    const event = { ...extractInstagramEvents(payload(), "123")[0], save: async () => {} }; let calls = 0;
    await processEvent(event, { channel: "instagram", process: async request => {
      assert.equal(request.channel, "instagram"); assert.equal(request.conversationId, "123:456");
      return { customerReply: "Hello", internalNote: "PRIVATE", replySuppressed: mode === "paused" };
    }, send: async (id, reply) => { calls++; assert.equal(reply, "Hello"); if (mode === "failure") throw new Error(); } });
    assert.equal(calls, mode === "paused" ? 0 : 1);
    assert.equal(event.status, mode === "failure" ? "review" : "sent");
  }
});

test("identical user IDs on Instagram and Messenger have separate conversation memory", async () => {
  const keys = [];
  for (const channel of ["messenger", "instagram"]) await processInboxMessage({ message: "Hello", channel, conversationId: "123:456" }, {
    conversations: { findOneAndUpdate: async query => { keys.push(query.key); return { paused: true }; } },
    cases: { create: async item => item },
  });
  assert.deepEqual(keys, ["messenger:123:456", "instagram:123:456"]);
});

test("staff Instagram replies verify channel, account, recipient and time window", () => {
  const event = { pageId: "123", psid: "456", timestamp: Date.now() };
  assert.equal(replyTarget("instagram:123:456", event, config, Date.now(), "instagram"), "456");
  for (const key of ["messenger:123:456", "instagram:999:456", "instagram:123:999"]) assert.throws(() => replyTarget(key, event, config, Date.now(), "instagram"));
  assert.throws(() => replyTarget("instagram:123:456", { ...event, timestamp: 1 }, config, Date.now(), "instagram"));
});

test("staff Instagram reply uses the shared handoff flow and is idempotent", async () => {
  let saved; let sends = 0;
  const request = { caseId: "case1", text: "Staff response", requestId: "request1", staffName: "Staff" };
  const deps = {
    cases: { findById: async () => ({ channel: "instagram", conversationKey: "instagram:123:456" }) },
    conversations: { findOne: async () => ({ paused: true }) },
    replies: { findOne: async () => saved, exists: async () => false, create: async item => (saved = { ...item, save: async () => {} }) },
    events: { findOne: () => ({ sort: async () => ({ pageId: "123", psid: "456", timestamp: Date.now() }) }) },
    config, send: async (recipient, text) => { sends++; assert.equal(recipient, "456"); assert.equal(text, request.text); },
  };
  assert.equal((await createStaffReply(request, deps)).status, "sent");
  await createStaffReply(request, deps); assert.equal(sends, 1);
});
