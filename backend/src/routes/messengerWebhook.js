import express from "express";
import MessengerEvent from "../models/MessengerEvent.js";
import { messengerConfig, isConfigured, validSignature, extractEvents } from "../services/messengerService.js";

export function createMessengerRouter({ config = messengerConfig(), events = MessengerEvent } = {}) {
  return createMessagingRouter({ config, events, object: "page", extract: extractEvents, configured: isConfigured });
}

export function createMessagingRouter({ config, events, object, extract, configured }) {
  const router = express.Router();
  router.get("/", (req, res) => {
    if (!config.verifyToken) return res.sendStatus(503);
    if (req.query["hub.mode"] !== "subscribe" || req.query["hub.verify_token"] !== config.verifyToken || typeof req.query["hub.challenge"] !== "string") return res.sendStatus(403);
    res.type("text/plain").send(req.query["hub.challenge"]);
  });
  router.post("/", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
    if (!configured(config)) return res.sendStatus(503);
    if (!validSignature(req.body, req.get("X-Hub-Signature-256"), config.secret)) return res.sendStatus(403);
    let payload;
    try { payload = JSON.parse(req.body.toString("utf8")); } catch { return res.sendStatus(400); }
    if (payload?.object !== object || !Array.isArray(payload.entry)) return res.sendStatus(400);
    try {
      for (const event of extract(payload, config.pageId)) {
        try { await events.create(event); }
        catch (error) { if (error.code !== 11000) throw error; }
      }
      // Acknowledge only after durable insertion. A failed DB write asks Meta to retry.
      return res.status(200).send("EVENT_RECEIVED");
    } catch {
      console.error(`${object} inbox storage failed`);
      return res.sendStatus(503);
    }
  });
  return router;
}
