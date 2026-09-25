import mongoose from "mongoose";
const schema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  aliases: [String],
  priceEUR: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 0 },
  incomingQuantity: { type: Number, default: 0, min: 0 },
  expectedArrival: { type: String, default: "" },
  installmentsEligible: { type: Boolean, default: false },
  lowStockThreshold: { type: Number, default: 3, min: 0 },
}, { timestamps: true });
export default mongoose.model("InventoryItem", schema);
