import { Router } from "express";
import InventoryItem from "../models/InventoryItem.js";
import { stockStatus, validateStockUpdate } from "../services/inventoryService.js";
import { requireStaff } from "../services/staffAuth.js";
const router = Router();
router.get("/", async (req, res) => {
  try {
    const items = await InventoryItem.find().sort({ name: 1 }).lean();
    res.set("Cache-Control", "no-store").json({ source: "shop_inventory", demoData: true, checkedAt: new Date().toISOString(), items: items.map(item => ({ ...item, status: stockStatus(item) })) });
  } catch { res.status(503).json({ error: "Inventory unavailable" }); }
});
router.use(requireStaff);
router.post("/", async (req, res) => {
  const { sku, name, aliases = [], ...stock } = req.body || {};
  if (typeof sku !== "string" || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(sku) || typeof name !== "string" || !name.trim() || name.length > 100 || !Array.isArray(aliases) || aliases.length > 20 || aliases.some(v => typeof v !== "string" || !v.trim() || v.length > 60) || !validateStockUpdate(stock) || !["quantity", "priceEUR"].every(key => key in stock)) return res.status(400).json({ error: "Enter a unique SKU, product name, price and valid stock values." });
  try { res.status(201).json(await InventoryItem.create({ sku, name: name.trim(), aliases: aliases.map(v => v.trim()), ...stock })); }
  catch (error) { res.status(error.code === 11000 ? 409 : 503).json({ error: error.code === 11000 ? "SKU already exists" : "Could not create product" }); }
});
router.delete("/:sku", async (req, res) => {
  try {
    const item = await InventoryItem.findOneAndDelete({ sku: req.params.sku }).lean();
    if (!item) return res.status(404).json({ error: "Product not found" });
    res.json({ deleted: true, sku: item.sku });
  } catch (error) { res.status(503).json({ error: "Could not delete product" }); }
});
router.post("/:sku/receive", async (req, res) => {
  const { quantity, version } = req.body || {};
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000 || !Number.isSafeInteger(version) || version < 0) return res.status(400).json({ error: "Enter units received and the current stock version." });
  try {
    const item = await InventoryItem.findOneAndUpdate({ sku: req.params.sku, __v: version, incomingQuantity: { $gte: quantity }, quantity: { $lte: 1000000 - quantity } }, [
      { $set: { quantity: { $add: ["$quantity", quantity] }, incomingQuantity: { $subtract: ["$incomingQuantity", quantity] }, __v: { $add: ["$__v", 1] }, updatedAt: "$$NOW" } },
      { $set: { expectedArrival: { $cond: [{ $eq: ["$incomingQuantity", 0] }, "", "$expectedArrival"] } } },
    ], { new: true }).lean();
    if (!item) return res.status(409).json({ error: "Stock changed or received quantity exceeds incoming units. Refresh and retry." });
    res.json({ ...item, status: stockStatus(item) });
  } catch { res.status(503).json({ error: "Could not receive delivery" }); }
});
router.patch("/:sku", async (req, res) => {
  const { version, name, ...changes } = req.body || {};
  const validName = name === undefined || (typeof name === "string" && Boolean(name.trim()) && name.length <= 100);
  if (!Number.isSafeInteger(version) || version < 0 || !validName || !validateStockUpdate(changes)) return res.status(400).json({ error: "Use a valid product name, non-negative stock quantities, price, arrival date and stock version." });
  try {
    const item = await InventoryItem.findOneAndUpdate({ sku: req.params.sku, __v: version }, { $set: { ...changes, ...(name === undefined ? {} : { name: name.trim() }) }, $inc: { __v: 1 } }, { new: true, runValidators: true }).lean();
    if (!item) return res.status(409).json({ error: "Stock changed. Refresh before saving again." });
    res.json({ ...item, status: stockStatus(item) });
  } catch { res.status(503).json({ error: "Could not save inventory" }); }
});
export default router;
