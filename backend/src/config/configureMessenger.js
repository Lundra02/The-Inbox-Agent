import "dotenv/config";
import axios from "axios";
import { messengerConfig } from "../services/messengerService.js";

const config = messengerConfig();
const callback = process.argv[2];
const appId = process.env.META_APP_ID || "2273254266783610";
if (!callback || !callback.startsWith("https://") || !callback.endsWith("/api/webhooks/messenger")) {
  console.error("Supply the public HTTPS Messenger callback URL."); process.exit(1);
}
const base = `https://graph.facebook.com/${config.version}`;
async function request(method, path, token, data) {
  return (await axios({ method, url: `${base}/${path}`, headers: { Authorization: `Bearer ${token}` }, data, timeout: 30000 })).data;
}
let stage = "validate Page token";
try {
  const page = await request("GET", "me?fields=id", config.token);
  if (page.id !== config.pageId) throw new Error("PAGE_MISMATCH");
  console.log("Page Access Token matches configured Page");
  stage = "verify public callback";
  const check = await axios.get(callback, { params: { "hub.mode": "subscribe", "hub.verify_token": config.verifyToken, "hub.challenge": "messenger-setup-check" }, timeout: 30000 });
  if (check.data !== "messenger-setup-check") throw new Error("CHALLENGE_MISMATCH");
  console.log("Public callback verification passed");
  stage = "register app callback";
  await request("POST", `${appId}/subscriptions`, `${appId}|${config.secret}`, {
    object: "page", callback_url: callback, verify_token: config.verifyToken, fields: "messages,messaging_postbacks",
  });
  console.log("App callback registered");
  stage = "subscribe Page";
  await request("POST", `${config.pageId}/subscribed_apps`, config.token, { subscribed_fields: "messages,messaging_postbacks" });
  console.log("Page subscribed to messages and messaging_postbacks");
  stage = "confirm subscriptions";
  const subscriptions = await request("GET", `${appId}/subscriptions`, `${appId}|${config.secret}`);
  const active = subscriptions.data?.find(item => item.object === "page");
  console.log(JSON.stringify({ callbackMatches: active?.callback_url === callback, active: active?.active, fields: active?.fields?.map(item => item.name) }));
} catch (error) {
  const meta = error.response?.data?.error;
  console.error(JSON.stringify({ failedStage: stage, httpStatus: error.response?.status, code: meta?.code || error.code, subcode: meta?.error_subcode, type: meta?.type }));
  process.exitCode = 1;
}
