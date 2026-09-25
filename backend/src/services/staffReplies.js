import InboxCase from "../models/InboxCase.js";
import InboxConversation from "../models/InboxConversation.js";
import StaffReply from "../models/StaffReply.js";
import MessengerEvent from "../models/MessengerEvent.js";
import { messengerConfig, isConfigured, sendReply } from "./messengerService.js";
import { withConversationLock } from "./conversationLock.js";
import InstagramEvent from "../models/InstagramEvent.js";
import { instagramConfig, isInstagramConfigured, sendInstagramReply } from "./instagramService.js";

export function replyTarget(conversationKey, event, config = messengerConfig(), now = Date.now(), channel = "messenger") {
  const match = new RegExp(`^${channel}:(\\d+):(\\d+)$`).exec(conversationKey || "");
  const configured = channel === "instagram" ? isInstagramConfigured : isConfigured;
  if (!match || !configured(config) || match[1] !== config.pageId || event?.pageId !== match[1] || event?.psid !== match[2]) throw new Error(`${channel} recipient is not verified for this conversation.`);
  if (!Number.isFinite(event.timestamp) || event.timestamp > now || now - event.timestamp > 23 * 60 * 60 * 1000) throw new Error(`The local ${channel} reply window has expired. Wait for a new customer message.`);
  return match[2];
}
export async function createStaffReply({ caseId, text, requestId, staffName }, { cases = InboxCase, conversations = InboxConversation, replies = StaffReply, events, send, config } = {}) {
  const item = await cases.findById(caseId);
  if (!item?.conversationKey) throw new Error("Conversation not found.");
  const instagram = item.channel === "instagram";
  events ??= instagram ? InstagramEvent : MessengerEvent;
  send ??= instagram ? sendInstagramReply : sendReply;
  config ??= instagram ? instagramConfig() : messengerConfig();
  return withConversationLock(item.conversationKey, async () => {
    const existing = await replies.findOne({ requestId });
    if (existing) {
      if (String(existing.caseId) !== String(caseId) || existing.text !== text) throw new Error("Reply request ID was already used.");
      return existing;
    }
    const conversation = await conversations.findOne({ key: item.conversationKey });
    if (!conversation?.paused) throw new Error("Take over the conversation before replying.");
    if (await replies.exists({ conversationKey: item.conversationKey, status: { $in: ["sending", "review"] } })) throw new Error("A prior reply has uncertain delivery. Check the original channel before taking further action; automatic resending is blocked.");
    let recipient;
    if (["messenger", "instagram"].includes(item.channel)) {
      const match = /^(?:messenger|instagram):(\d+):(\d+)$/.exec(item.conversationKey);
      const event = match && await events.findOne({ pageId: match[1], psid: match[2] }).sort({ timestamp: -1 });
      recipient = replyTarget(item.conversationKey, event, config, Date.now(), item.channel);
    }
    const reply = await replies.create({ requestId, caseId, text, staffName, conversationKey: item.conversationKey, channel: item.channel, status: item.channel === "demo" ? "demo" : "sending" });
    if (recipient) {
      try { await send(recipient, text, config); reply.status = "sent"; }
      catch { reply.status = "review"; }
      await reply.save();
    }
    return reply;
  });
}
