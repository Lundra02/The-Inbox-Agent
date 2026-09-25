import test from "node:test";
import assert from "node:assert/strict";
import { processInboxMessage as processRealMessage, challengeMessages } from "../src/services/inboxService.js";
import { withConversationLock } from "../src/services/conversationLock.js";
const processInboxMessage = (input, dependencies) => processRealMessage(input, {
  conversations: { findOneAndUpdate: async () => ({ memory: {}, paused: false, save: async () => {} }) }, ...dependencies,
});

test("five exact challenge messages are available", () => {
  assert.equal(challengeMessages.length, 5);
  assert.equal(challengeMessages[0], "Porosia #1048 ende s'ka ardhur. Kanë kaluar 6 ditë.");
  assert.equal(challengeMessages[4], "A mund ta blej laptopin me këste?");
});

test("escalation is stored for staff with a separate customer acknowledgment", async () => {
  const result = await processInboxMessage({ message: "Complaint", channel: "demo" }, {
    http: { post: async () => ({ data: { result: { language: "en", intent: "complaint_escalation", decision: "escalate", customerReply: "Sorry about this.", internalNote: "Urgent staff review" }, engine: "rules", elapsedMs: 1 } }) },
    cases: { create: async value => value },
  });
  assert.equal(result.status, "needs_human");
  assert.equal(result.internalNote, "Urgent staff review");
  assert.equal(result.customerReply, "Sorry about this.");
});

test("same source event reuses persisted case without another AI call", async () => {
  const existing = { customerReply: "Already processed" };
  const result = await processInboxMessage({ message: "Hello", sourceEventId: "event1" }, {
    cases: { findOne: async () => existing },
    http: { post: async () => { throw new Error("Must not call AI again"); } },
  });
  assert.equal(result, existing);
});

test("malformed escalation result is rejected instead of silently auto-answering", async () => {
  await assert.rejects(processInboxMessage({ message: "Complaint" }, {
    http: { post: async () => ({ data: { result: { language: "en", decision: "escalate", customerReply: "Hello" } } }) },
    cases: { create: async () => { throw new Error("Must not save"); } },
  }), /Invalid agent result/);
});

test("human handoff suppresses replies and bypasses the AI", async () => {
  const result = await processInboxMessage({ message: "Any update?", conversationId: "test" }, {
    conversations: { findOneAndUpdate: async () => ({ paused: true, assignedTo: "Arta", memory: { language: "sq" } }) },
    cases: { create: async value => value },
    http: { post: async () => { throw new Error("Must not call model during human handoff"); } },
  });
  assert.equal(result.replySuppressed, true);
  assert.equal(result.customerReply, "");
  assert.equal(result.assignedTo, "Arta");
  assert.equal(result.status, "needs_human");
});

test("conversation facts are passed only for the selected conversation", async () => {
  const result = await processInboxMessage({ message: "1048", conversationId: "alice" }, {
    conversations: { findOneAndUpdate: async query => {
      assert.equal(query.key, "demo:alice");
      return { paused: false, memory: { intent: "order_status" }, save: async () => {} };
    } },
    http: { post: async (url, body) => {
      assert.deepEqual(body.memory, { intent: "order_status" });
      return { data: { result: { language: "en", intent: "order_status", decision: "autonomous", customerReply: "Order 1048" }, memory: { orderId: "1048" } } };
    } }, cases: { create: async value => value },
  });
  assert.equal(result.conversationKey, "demo:alice");
});

test("same conversation requests serialize and lock releases after errors", async () => {
  const order = [];
  await Promise.all([withConversationLock("lock-test", async () => { order.push(1); await new Promise(r => setTimeout(r, 15)); order.push(2); }), withConversationLock("lock-test", async () => { order.push(3); })]);
  assert.deepEqual(order, [1, 2, 3]);
  await assert.rejects(withConversationLock("lock-test", async () => { throw new Error("expected"); }));
  assert.equal(await withConversationLock("lock-test", async () => 42), 42);
});

