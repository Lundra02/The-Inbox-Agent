import MessengerEvent from "../models/MessengerEvent.js";
import InboxCase from "../models/InboxCase.js";
import { processInboxMessage } from "./inboxService.js";
import { sendReply } from "./messengerService.js";

export async function processEvent(event, { process = processInboxMessage, send = sendReply, channel = "messenger" } = {}) {
  let stage = "agent";
  try {
    const item = await process({ message: event.text, channel, sourceEventId: event.eventId, conversationId: `${event.pageId}:${event.psid}` });
    event.reply = item.customerReply;
    await event.save();
    stage = "send";
    // Internal escalation notes stay in the staff inbox, never in Messenger.
    if (!item.replySuppressed) await send(event.psid, item.customerReply);
    event.status = "sent";
    event.failureStage = undefined;
    await event.save();
    console.log(`Inbox ${channel} event processed`);
  } catch {
    event.status = "review";
    event.failureStage = stage;
    await event.save();
    console.error(`Inbox ${channel} event requires review (${stage})`);
  }
}

export async function startMessengerWorker() {
  return startMessagingWorker();
}

export async function startMessagingWorker({ events = MessengerEvent, channel = "messenger", send = sendReply } = {}) {
  await Promise.all([events.init(), InboxCase.init()]);
  await events.updateMany({ status: "processing" }, { $set: { status: "review", failureStage: "interrupted" } });
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const event = await events.findOneAndUpdate({ status: "pending" }, { $set: { status: "processing" } }, { sort: { createdAt: 1, _id: 1 }, new: true });
      if (event) {
        if (!Number.isFinite(event.timestamp) || event.timestamp > Date.now() || Date.now() - event.timestamp > 23 * 60 * 60 * 1000) {
          event.status = "review"; event.failureStage = "expired"; await event.save();
        } else await processEvent(event, { channel, send });
      }
    } catch { console.error(`Inbox ${channel} worker storage failure`); }
    finally { busy = false; }
  }, 1000);
  timer.unref();
  return timer;
}
