import mongoose from "mongoose";

const mechanicSlotSchema = new mongoose.Schema({
  date: Date,
  startTime: String,
  endTime: String,
  isAvailable: {
    type: Boolean,
    default: true,
  },
  mechanicName: String,
});

export default mongoose.model("MechanicSlot", mechanicSlotSchema);
