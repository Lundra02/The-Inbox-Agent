import mongoose from "mongoose";

const laborRateSchema = new mongoose.Schema({
  taskType: String,
  hourlyRate: Number,
  estHours: Number,
});

export default mongoose.model("LaborRate", laborRateSchema);
