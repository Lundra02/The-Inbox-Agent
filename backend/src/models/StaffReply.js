import mongoose from "mongoose";
export default mongoose.model("StaffReply", new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  caseId: { type: mongoose.Schema.Types.ObjectId, required: true },
  conversationKey: { type: String, required: true, index: true },
  text: { type: String, required: true },
  staffName: { type: String, required: true },
  channel: { type: String, enum: ["demo", "messenger", "instagram"], required: true },
  status: { type: String, enum: ["sending", "sent", "demo", "review"], required: true },
}, { timestamps: true }));
