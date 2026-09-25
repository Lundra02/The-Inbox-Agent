import InventoryItem from "../models/InventoryItem.js";

export function stockStatus(item) {
  return item.quantity > 0 ? "in_stock" : item.incomingQuantity > 0 ? "coming_soon" : "out_of_stock";
}

export function validateStockUpdate(body) {
  if (!body || typeof body !== "object") return false;
  const keys = ["quantity", "incomingQuantity", "expectedArrival", "priceEUR", "installmentsEligible", "lowStockThreshold"];
  if (!Object.keys(body).length || Object.keys(body).some(key => !keys.includes(key))) return false;
  for (const key of ["quantity", "incomingQuantity", "lowStockThreshold"]) if (key in body && (!Number.isSafeInteger(body[key]) || body[key] < 0 || body[key] > 1000000)) return false;
  if ("priceEUR" in body && (typeof body.priceEUR !== "number" || !Number.isFinite(body.priceEUR) || body.priceEUR < 0 || body.priceEUR > 1000000)) return false;
  if ("installmentsEligible" in body && typeof body.installmentsEligible !== "boolean") return false;
  if ("expectedArrival" in body && body.expectedArrival !== "") {
    const value = body.expectedArrival;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return false;
  }
  return true;
}

export async function initializeInventory() {
  await InventoryItem.init();
  const items = [
    { sku: "laptop-14", name: "NovaBook 14 laptop", aliases: ["laptop", "laptopin", "novabook"], priceEUR: 720, quantity: 8, incomingQuantity: 0, installmentsEligible: true },
    { sku: "headphones", name: "Wireless headphones", aliases: ["headphones", "headphone", "kufje", "kufjet"], priceEUR: 60, quantity: 0, incomingQuantity: 0 },
    { sku: "charger", name: "USB-C charger", aliases: ["charger", "karikues", "karikuesi", "usb-c"], priceEUR: 25, quantity: 0, incomingQuantity: 20 },
  ];
  for (const item of items) await InventoryItem.updateOne({ sku: item.sku }, { $setOnInsert: item }, { upsert: true });
}
