import mongoose from "mongoose";

const workOrderSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment",
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
  },
  issueCategories: [String],
  estimateLow: Number,
  estimateHigh: Number,
  partsNeeded: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Part",
    },
  ],
  status: {
    type: String,
    enum: ["draft", "approved", "in_progress", "done"],
    default: "draft",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("WorkOrder", workOrderSchema);
