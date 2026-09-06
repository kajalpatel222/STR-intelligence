import { strict as assert } from "node:assert";
import test from "node:test";
import { RevenueEstimateRepository, type RevenueEstimateStore } from "./repository.js";

test("repository saves an immutable estimate with a 30-day freshness window", async () => {
  let inserted: Record<string, unknown> | undefined;
  const target = { canonicalPropertyId: "property-1", listingSnapshotId: "snapshot-1", input: { latitude: 37, longitude: -119, bedrooms: 3, bathrooms: 2, accommodates: 6 } };
  const store: RevenueEstimateStore = {
    resolveProperty: async () => target,
    latest: async () => undefined,
    insert: async (row) => { inserted = row; return row; },
    latestJob: async () => undefined,
    insertJob: async (row) => row,
    updateJob: async () => undefined,
  };
  const repository = new RevenueEstimateRepository(store);
  const estimate = await repository.save(target, { providerReference: "private-report", rawPayload: { private: true }, estimate: { estimatedAdrUsd: 285, estimatedOccupancyPercent: 61, estimatedAnnualRevenueUsd: 63_400, comparableCount: 12 } });
  assert.equal(estimate.freshness, "fresh");
  assert.equal(estimate.comparableCount, 12);
  assert.equal((Date.parse(estimate.expiresAt) - Date.parse(estimate.collectedAt)) / 86_400_000, 30);
  assert.equal(inserted?.provider, "airbtics");
  assert.deepEqual(inserted?.raw_payload, { private: true });
});
