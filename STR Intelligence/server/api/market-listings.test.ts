import assert from "node:assert/strict";
import test from "node:test";
import { createMarketListingsHandler } from "./market-listings.js";

test("returns an honest empty state when no collection exists", async () => {
  const result = await createMarketListingsHandler({ async loadLatest() { return undefined; } })();
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { status: "empty", message: "No market listings have been collected yet." });
});

test("returns the saved safe collection", async () => {
  const collection = { label: "Pilot", gateway: "arch_rock" as const, status: "complete" as const, page: 1, providerTotalCount: 149, savedCount: 1, collectedAt: "2026-09-06T12:00:00Z", listings: [] };
  const result = await createMarketListingsHandler({ async loadLatest() { return collection; } })();
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { status: "available", collection });
});
