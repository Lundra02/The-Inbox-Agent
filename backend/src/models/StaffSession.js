import mongoose from "mongoose";
export default mongoose.model("StaffSession", new mongoose.Schema({
  tokenHash: { type: String, unique: true, required: true },
  staffId: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}));
