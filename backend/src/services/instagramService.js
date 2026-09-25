import axios from "axios";
import { extractEvents, splitReply } from "./messengerService.js";

export function instagramConfig(env = process.env) {
  return {
    pageId: env.INSTAGRAM_ACCOUNT_ID,
    token: env.INSTAGRAM_ACCESS_TOKEN,
    verifyToken: env.INSTAGRAM_VERIFY_TOKEN,
    secret: env.INSTAGRAM_APP_SECRET,
    version: env.INSTAGRAM_GRAPH_API_VERSION || "v25.0",
  };
}

export function isInstagramConfigured(config = instagramConfig()) {
  return Boolean(/^\d+$/.test(config.pageId || "") && config.token && config.verifyToken && config.secret && /^v\d+\.0$/.test(config.version));
}

export function extractInstagramEvents(body, accountId) {
  if (body?.object !== "instagram" || !Array.isArray(body.entry)) return [];
  // Meta uses the same messaging envelope. Prefix IDs because InboxCase's
  // sourceEventId index spans both channels, even though queues are separate.
  return extractEvents({ ...body, object: "page" }, accountId)
    .map(event => ({ ...event, eventId: `instagram:${event.eventId}` }));
}

export async function sendInstagramReply(recipientId, text, config = instagramConfig(), http = axios) {
  if (!isInstagramConfigured(config)) throw new Error("Instagram is not configured");
  for (const chunk of splitReply(text, 1000)) {
    const { data } = await http.post(`https://graph.instagram.com/${config.version}/${config.pageId}/messages`, {
      recipient: { id: recipientId }, message: { text: chunk },
    }, { headers: { Authorization: `Bearer ${config.token}` }, timeout: 15000 });
    if (!data?.message_id) throw new Error("Instagram delivery was not confirmed");
  }
}
