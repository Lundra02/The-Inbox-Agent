import mongoose from "mongoose";

const schema = new mongoose.Schema({
  pageId: { type: String, required: true },
  psid: { type: String, required: true },
  channel: { type: String, default: "messenger" },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
}, { timestamps: true });
schema.index({ pageId: 1, psid: 1 }, { unique: true });
export default mongoose.model("MessengerConversation", schema);
