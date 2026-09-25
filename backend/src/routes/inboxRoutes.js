import { Router } from "express";
import axios from "axios";
import mongoose from "mongoose";
import InboxCase from "../models/InboxCase.js";
import InboxConversation from "../models/InboxConversation.js";
import InboxTestRun from "../models/InboxTestRun.js";
import { withConversationLock } from "../services/conversationLock.js";
import { processInboxMessage, challengeMessages } from "../services/inboxService.js";
import StaffReply from "../models/StaffReply.js";
import { createStaffReply } from "../services/staffReplies.js";

const router = Router();
router.get("/conversations", async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : "";
    const filter = req.query.filter;
    const pipeline = [
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: { $ifNull: ["$conversationKey", { $toString: "$_id" }] }, latest: { $first: "$$ROOT" }, messages: { $push: "$message" }, count: { $sum: 1 }, unread: { $sum: { $cond: [{ $ifNull: ["$readAt", false] }, 0, 1] } }, waiting: { $max: { $cond: [{ $eq: ["$status", "needs_human"] }, 1, 0] } } } },
      { $addFields: { state: { $cond: [{ $eq: ["$waiting", 1] }, "needs_human", { $cond: [{ $eq: ["$latest.status", "resolved"] }, "resolved", "new"] }] } } },
    ];
    if (["new", "needs_human", "resolved"].includes(filter)) pipeline.push({ $match: { state: filter } });
    if (search) pipeline.push({ $match: { $or: [{ messages: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, { _id: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }] } });
    pipeline.push({ $sort: { "latest.createdAt": -1 } }, { $limit: 100 }, { $project: { messages: 0 } });
    res.json(await InboxCase.aggregate(pipeline));
  } catch { res.status(503).json({ error: "Conversations unavailable" }); }
});
router.get("/cases/:id/thread", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(400);
  try {
    const item = await InboxCase.findById(req.params.id);
    if (!item) return res.sendStatus(404);
    const query = item.conversationKey ? { conversationKey: item.conversationKey } : { _id: item._id };
    const messages = await InboxCase.find(query).sort({ createdAt: -1 }).limit(200).lean();
    const replies = item.conversationKey ? await StaffReply.find({ conversationKey: item.conversationKey }).sort({ createdAt: -1 }).limit(200).lean() : [];
    const conversation = item.conversationKey ? await InboxConversation.findOne({ key: item.conversationKey }).lean() : null;
    res.json({ messages: messages.reverse(), replies: replies.reverse(), paused: conversation?.paused || false });
  } catch { res.status(503).json({ error: "Thread unavailable" }); }
});
router.post("/cases/:id/read", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(400);
  try {
    const item = await InboxCase.findById(req.params.id);
    if (!item) return res.sendStatus(404);
    await InboxCase.updateMany({ ...(item.conversationKey ? { conversationKey: item.conversationKey } : { _id: item._id }), createdAt: { $lte: item.createdAt }, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ read: true });
  } catch { res.status(503).json({ error: "Could not mark conversation read" }); }
});
router.post("/cases/:id/replies", async (req, res) => {
  const { text, requestId } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id) || typeof text !== "string" || !text.trim() || text.length > 2000 || typeof requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestId)) return res.status(400).json({ error: "Enter a reply of 1–2000 characters and a unique request ID." });
  try { res.status(201).json(await createStaffReply({ caseId: req.params.id, text: text.trim(), requestId, staffName: req.staff.displayName })); }
  catch (error) { res.status(409).json({ error: error instanceof mongoose.Error || error.name === "MongoServerError" ? "Reply storage unavailable. Refresh before retrying." : error.message }); }
});
router.get("/cases", async (req, res) => {
  try { res.json(await InboxCase.find().sort({ createdAt: -1 }).limit(100).lean()); }
  catch { res.status(503).json({ error: "Inbox storage unavailable" }); }
});
router.post("/messages", async (req, res) => {
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim() || message.length > 10000) return res.status(400).json({ error: "Enter a message of 1–10000 characters" });
  const conversationId = req.body?.conversationId;
  if (conversationId !== undefined && (typeof conversationId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(conversationId))) return res.status(400).json({ error: "Invalid conversation ID" });
  try { res.status(201).json(await processInboxMessage({ message: message.trim(), conversationId })); }
  catch { res.status(503).json({ error: "Unable to process the message. Check that the agent and database are running." }); }
});
router.patch("/cases/:id/resolve", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(400);
  try {
    const item = await InboxCase.findOne({ _id: req.params.id, status: "needs_human" });
    if (!item) return res.status(404).json({ error: "Open escalation not found" });
    await withConversationLock(item.conversationKey || String(item._id), async () => {
      await InboxCase.updateMany(item.conversationKey ? { conversationKey: item.conversationKey, status: "needs_human" } : { _id: item._id }, { status: "resolved", resolvedAt: new Date() });
      if (item.conversationKey) await InboxConversation.updateOne({ key: item.conversationKey }, { paused: false, memory: {}, assignedTo: "" });
    });
    res.json(await InboxCase.findById(item._id));
  } catch { res.status(503).json({ error: "Could not update escalation" }); }
});
router.patch("/cases/:id/assign", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(400);
  const assignedTo = req.body?.assignedTo;
  if (typeof assignedTo !== "string" || !assignedTo.trim() || assignedTo.length > 80) return res.status(400).json({ error: "Enter a staff name (1–80 characters)" });
  try {
    const item = await InboxCase.findById(req.params.id);
    if (!item?.conversationKey) return res.status(400).json({ error: "This legacy case has no conversation" });
    await withConversationLock(item.conversationKey, async () => {
      await InboxConversation.updateOne({ key: item.conversationKey }, { paused: true, assignedTo: assignedTo.trim() });
      await InboxCase.updateMany({ conversationKey: item.conversationKey }, { assignedTo: assignedTo.trim() });
    });
    res.json(await InboxCase.findById(item._id));
  } catch { res.status(503).json({ error: "Could not assign conversation" }); }
});
router.get("/analytics", async (req, res) => {
  try {
    const [stats] = await InboxCase.aggregate([{ $group: { _id: null, total: { $sum: 1 },
      automated: { $sum: { $cond: [{ $eq: ["$decision", "autonomous"] }, 1, 0] } },
      escalated: { $sum: { $cond: [{ $eq: ["$decision", "escalate"] }, 1, 0] } },
      waiting: { $sum: { $cond: [{ $eq: ["$status", "needs_human"] }, 1, 0] } },
      averageProcessingMs: { $avg: { $cond: [{ $ne: ["$replySuppressed", true] }, "$elapsedMs", null] } },
    } }]);
    const result = stats || { total: 0, automated: 0, escalated: 0, waiting: 0, averageProcessingMs: 0 };
    delete result._id;
    res.json({ ...result, estimatedMinutesSaved: result.automated * 2.5, assumptionMinutesPerAutomaticReply: 2.5 });
  } catch { res.status(503).json({ error: "Analytics unavailable" }); }
});
router.get("/scorecard", async (req, res) => {
  try { res.json(await InboxTestRun.findOne().sort({ createdAt: -1 }).lean()); }
  catch { res.status(503).json({ error: "Scorecard unavailable" }); }
});
router.post("/scorecard", async (req, res) => {
  const mode = req.body?.mode || "rules";
  if (!["rules", "hybrid"].includes(mode)) return res.sendStatus(400);
  try {
    const { data } = await axios.post(`${process.env.AGENT_SERVICE_URL || "http://127.0.0.1:8000"}/scorecard?mode=${mode}`, {}, { timeout: 240000 });
    res.json(await InboxTestRun.create({ report: data }));
  } catch { res.status(503).json({ error: "Scorecard run failed; check the agent service" }); }
});
router.get("/challenge", (req, res) => res.json(challengeMessages));
router.get("/catalog", async (req, res) => {
  try { res.json((await axios.get(`${process.env.AGENT_SERVICE_URL || "http://127.0.0.1:8000"}/catalog`, { timeout: 5000 })).data); }
  catch { res.status(503).json({ error: "Mock catalog unavailable" }); }
});
export default router;
