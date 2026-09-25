import axios from "axios";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export function messengerConfig(env = process.env) {
  return {
    pageId: env.MESSENGER_PAGE_ID,
    token: env.MESSENGER_PAGE_ACCESS_TOKEN,
    verifyToken: env.MESSENGER_VERIFY_TOKEN,
    secret: env.META_APP_SECRET,
    version: env.META_GRAPH_API_VERSION || "v25.0",
    agentUrl: env.AGENT_SERVICE_URL || "http://localhost:8000",
  };
}

export function isConfigured(config = messengerConfig()) {
  return Boolean(config.pageId && config.token && config.verifyToken && config.secret && /^v\d+\.0$/.test(config.version));
}

export function validSignature(body, signature, secret) {
  if (!Buffer.isBuffer(body) || !secret || !/^sha256=[a-f0-9]{64}$/.test(signature || "")) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

export function extractEvents(body, pageId) {
  if (body?.object !== "page" || !Array.isArray(body.entry)) return [];
  const events = [];
  for (const entry of body.entry) {
    if (entry?.id !== pageId || !Array.isArray(entry.messaging)) continue;
    for (const event of entry.messaging) {
      const psid = event?.sender?.id;
      if (typeof psid !== "string" || !/^\d+$/.test(psid) || psid === pageId || event?.recipient?.id !== pageId || event.message?.is_echo) continue;
      const postback = event.postback;
      const text = postback?.payload || postback?.title || event.message?.text;
      if (typeof text !== "string" || !text.trim() || text.length > 20000) continue;
      const mid = event.message?.mid || postback?.mid;
      if (!mid && !(postback && Number.isFinite(event.timestamp))) continue;
      const eventId = typeof mid === "string" ? mid : createHash("sha256").update(JSON.stringify([psid, event.timestamp, text])).digest("hex");
      events.push({ eventId: `${pageId}:${eventId}`, pageId, psid, text: text.trim(), timestamp: event.timestamp, kind: postback ? "postback" : "text" });
    }
  }
  return events;
}

export function splitReply(text, limit = 2000) {
  // Count UTF-16 units conservatively and never split a surrogate pair.
  const chunks = [];
  let chunk = "";
  for (const char of text) {
    if (chunk.length + char.length > limit) { chunks.push(chunk); chunk = ""; }
    chunk += char;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export async function sendReply(psid, text, config = messengerConfig(), http = axios) {
  for (const chunk of splitReply(text)) {
    await http.post(`https://graph.facebook.com/${config.version}/${config.pageId}/messages`, {
      recipient: { id: psid }, messaging_type: "RESPONSE", message: { text: chunk },
    }, { headers: { Authorization: `Bearer ${config.token}` }, timeout: 15000 });
  }
}

export async function askAgent(payload, config = messengerConfig(), http = axios) {
  return (await askAgentDetailed(payload, config, http)).reply;
}

export async function askAgentDetailed(payload, config = messengerConfig(), http = axios) {
  const response = await http.post(`${config.agentUrl.replace(/\/$/, "")}/chat`, payload, { timeout: 180000 });
  if (typeof response.data?.reply !== "string" || !response.data.reply.trim()) throw new Error("Empty agent reply");
  return response.data;
}
