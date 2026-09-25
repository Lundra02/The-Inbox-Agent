import mongoose from "mongoose";

const repairHistorySchema = new mongoose.Schema({
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
  },
  date: Date,
  description: String,
  resolvedIssue: String,
  cost: Number,
});

export default mongoose.model("RepairHistory", repairHistorySchema);
