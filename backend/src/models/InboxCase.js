import mongoose from "mongoose";

const schema = new mongoose.Schema({
  sourceEventId: { type: String, unique: true, sparse: true },
  channel: { type: String, enum: ["demo", "messenger", "instagram"], required: true },
  conversationKey: { type: String, index: true },
  assignedTo: String,
  replySuppressed: { type: Boolean, default: false },
  message: { type: String, required: true },
  language: { type: String, enum: ["sq", "en"], required: true },
  intent: { type: String, required: true },
  decision: { type: String, enum: ["autonomous", "escalate"], required: true },
  customerReply: { type: String, default: "" },
  internalNote: String,
  status: { type: String, enum: ["answered", "needs_human", "resolved"], required: true },
  engine: String,
  replyEngine: String,
  replyFallbackReason: String,
  fallbackReason: String,
  elapsedMs: Number,
  stockCheck: mongoose.Schema.Types.Mixed,
  resolvedAt: Date,
  readAt: Date,
}, { timestamps: true });
export default mongoose.model("InboxCase", schema);
