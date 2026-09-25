import mongoose from "mongoose";

const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  pageId: { type: String, required: true },
  psid: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: Number,
  kind: String,
  status: { type: String, enum: ["pending", "processing", "sent", "review"], default: "pending", index: true },
  reply: String,
  intakeContext: mongoose.Schema.Types.Mixed,
  failureStage: String,
}, { timestamps: true });
schema.index({ pageId: 1, psid: 1, createdAt: 1 });
export default mongoose.model("MessengerEvent", schema);
