import { strict as assert } from "node:assert";
import test from "node:test";
import { createStrRevenueEstimateHandler } from "./str-revenue-estimate.js";

const target = { canonicalPropertyId: "property-1", listingSnapshotId: "snapshot-1", input: { latitude: 37, longitude: -119, bedrooms: 3, bathrooms: 2, accommodates: 6 } };
const estimate = { estimatedAdrUsd: 285, estimatedOccupancyPercent: 61, estimatedAnnualRevenueUsd: 63_400, collectedAt: "2026-09-06T00:00:00Z", expiresAt: "2026-10-06T00:00:00Z", freshness: "fresh" as const };

test("lookup reuses a saved estimate without invoking the paid provider", async () => {
  let calls = 0;
  const handler = createStrRevenueEstimateHandler({ resolve: async () => target, latest: async () => estimate, latestJob: async () => undefined } as never, { async startSummary() { calls++; throw new Error("must not run"); } } as never);
  const result = await handler({ listingUrl: "https://www.zillow.com/homedetails/1", action: "lookup" });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, "available");
  assert.equal(calls, 0);
});

test("purchase requires exact cost confirmation before invoking the provider", async () => {
  let calls = 0;
  const repository = { resolve: async () => target, latest: async () => undefined, latestJob: async () => undefined, startJob: async () => ({}) } as never;
  const provider = { async startSummary() { calls++; return "private-report"; } } as never;
  const handler = createStrRevenueEstimateHandler(repository, provider);
  assert.equal((await handler({ listingUrl: "https://www.zillow.com/homedetails/1", action: "purchase" })).statusCode, 400);
  assert.equal(calls, 0);
  const result = await handler({ listingUrl: "https://www.zillow.com/homedetails/1", action: "purchase", confirmedCostUsd: .10 });
  assert.equal(result.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(result.body.status, "preparing");
});

test("status completes and persists a finished report", async () => {
  const repository = { resolve: async () => target, latest: async () => undefined, latestJob: async () => ({ id: "job-1", providerReference: "private-report", status: "pending", startedAt: "2026-09-06T00:00:00Z" }), save: async () => estimate, completeJob: async () => undefined } as never;
  const provider = { async readSummary() { return { status: "complete", estimate, rawPayload: {} }; } } as never;
  const result = await createStrRevenueEstimateHandler(repository, provider)({ listingUrl: "https://www.zillow.com/homedetails/1", action: "status" });
  assert.equal(result.body.status, "available");
});
