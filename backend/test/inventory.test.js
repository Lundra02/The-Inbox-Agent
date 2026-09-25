import test from "node:test";
import assert from "node:assert/strict";
import { stockStatus, validateStockUpdate } from "../src/services/inventoryService.js";

test("inventory distinguishes available, missing and incoming stock", () => {
  assert.equal(stockStatus({ quantity: 4, incomingQuantity: 5 }), "in_stock");
  assert.equal(stockStatus({ quantity: 0, incomingQuantity: 5 }), "coming_soon");
  assert.equal(stockStatus({ quantity: 0, incomingQuantity: 0 }), "out_of_stock");
});
test("stock edits reject invalid quantities, dates and unexpected fields", () => {
  for (const value of [{ quantity: -1 }, { quantity: 1.5 }, { quantity: "2" }, { expectedArrival: "2026-02-30" }, { name: "overwrite" }, {}]) assert.equal(validateStockUpdate(value), false);
  assert.equal(validateStockUpdate({ quantity: 3, incomingQuantity: 10, expectedArrival: "2026-10-01" }), true);
});
