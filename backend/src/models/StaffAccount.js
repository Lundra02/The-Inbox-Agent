import mongoose from "mongoose";
export default mongoose.model("StaffAccount", new mongoose.Schema({
  _id: { type: String, default: "primary" },
  username: { type: String, required: true },
  displayName: { type: String, required: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true }));
