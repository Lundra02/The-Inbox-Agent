import mongoose from "mongoose";

const partSchema = new mongoose.Schema({
  name: String,
  price: Number,
  compatibleModels: [String],
  stockQty: {
    type: Number,
    default: 0,
  },
});

export default mongoose.model("Part", partSchema);
