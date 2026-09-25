import test from "node:test";
import assert from "node:assert/strict";
import { isFutureSlot, slotDay, validDateRange } from "../src/services/scheduling.js";

test("shop-local midnight dates and same-day past times are handled correctly", () => {
  const now = new Date("2026-09-24T17:00:00Z");
  const slot = { date: "2026-09-23T22:00:00Z", startTime: "13:00" };
  assert.equal(slotDay(slot), "2026-09-24");
  assert.equal(isFutureSlot(slot, now), false);
  assert.equal(isFutureSlot({ ...slot, startTime: "19:00" }, now), false);
  assert.equal(isFutureSlot({ ...slot, startTime: "19:01" }, now), true);
  assert.equal(isFutureSlot({ date: "2026-09-24T22:00:00Z", startTime: "08:00" }, now), true);
});

test("winter timezone and malformed dates/times fail safely", () => {
  assert.equal(isFutureSlot({ date: "2026-01-01T23:00:00Z", startTime: "10:00" }, new Date("2026-01-02T09:00:00Z")), false);
  assert.equal(isFutureSlot({ date: "bad", startTime: "10:00" }), false);
  assert.equal(isFutureSlot({ date: new Date(), startTime: "25:00" }), false);
  assert.equal(validDateRange("2026-02-30", "2026-03-02"), false);
  assert.equal(validDateRange("2026-09-25", "2026-09-24"), false);
  assert.equal(validDateRange("2026-09-24", "2026-09-30"), true);
});
