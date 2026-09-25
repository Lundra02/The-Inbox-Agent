import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
  },
  make: String,
  model: String,
  year: Number,
  engine: String,
  mileage: Number,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Vehicle", vehicleSchema);
