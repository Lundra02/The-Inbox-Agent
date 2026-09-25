import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortItems, statusLabel } from "../src/pages/inventoryLogic.js";

const items = [
  { sku: "laptop", name: "NovaBook laptop", quantity: 8, incomingQuantity: 0 },
  { sku: "charger", name: "USB charger", quantity: 0, incomingQuantity: 20 },
  { sku: "headphones", name: "Wireless headphones", quantity: 0, incomingQuantity: 0 },
];

test("stock status and filters match the live stock UI", () => {
  assert.equal(statusLabel(items[0]), "In stock");
  assert.equal(statusLabel(items[1]), "Coming soon");
  assert.equal(statusLabel(items[2]), "Out of stock");
  assert.deepEqual(filterAndSortItems(items, "charger", "all", "name").map(item => item.sku), ["charger"]);
  assert.deepEqual(filterAndSortItems(items, "", "incoming", "name").map(item => item.sku), ["charger"]);
  assert.deepEqual(filterAndSortItems(items, "", "all", "quantity").map(item => item.sku), ["laptop", "charger", "headphones"]);
});