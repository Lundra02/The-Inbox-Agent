import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
  name: String,
  phone: {
    type: String,
    unique: true,
    sparse: true,
  },
  email: String,
  vehicleIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Customer", customerSchema);
