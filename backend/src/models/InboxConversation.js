import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  paused: { type: Boolean, default: false },
  assignedTo: { type: String, default: "" },
  memory: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
export default mongoose.model("InboxConversation", schema);
