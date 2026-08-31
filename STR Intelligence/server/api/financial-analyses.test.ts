import { strict as assert } from "node:assert";
import test from "node:test";
import { createFinancialAssumptions } from "../../shared/financial-assumptions.js";
import { calculateBaseCaseFinancials } from "../../shared/financial-calculator.js";
import type { SavedFinancialAnalysis } from "../../shared/financial-analysis.js";
import { createFinancialAnalysesHandler } from "./financial-analyses.js";

const property = Object.freeze({
  listingUrl: "https://www.zillow.com/homedetails/123",
  title: "Pine Ridge Cabin",
  address: "123 Pine Road",
  location: "Oakhurst, CA",
  priceUsd: 327_000,
});
const assumptions = createFinancialAssumptions({ purchasePriceUsd: 327_000 });
const saved: SavedFinancialAnalysis = Object.freeze({
  property,
  assumptions,
  result: calculateBaseCaseFinancials(assumptions),
  savedAt: "2026-08-30T20:00:00.000Z",
});

test("saves a validated Zillow analysis through the narrow API", async () => {
  let received: unknown;
  const handler = createFinancialAnalysesHandler({
    async save(request) { received = request; return saved; },
    async listLatest() { return []; },
  });
  const result = await handler.post({ property, assumptions });
  assert.equal(result.statusCode, 201);
  assert.deepEqual(received, { property, assumptions });
  assert.deepEqual(result.body.analysis, saved);
});

test("rejects unsafe property references and invalid assumptions before persistence", async () => {
  let saves = 0;
  const handler = createFinancialAnalysesHandler({
    async save() { saves += 1; return saved; },
    async listLatest() { return []; },
  });
  const badUrl = await handler.post({ property: { ...property, listingUrl: "https://example.com/home" }, assumptions });
  const badAssumptions = await handler.post({ property, assumptions: { ...assumptions, expectedAdrUsd: 0 } });
  assert.equal(badUrl.statusCode, 400);
  assert.equal(badAssumptions.statusCode, 400);
  assert.match(String(badAssumptions.body.message), /Expected ADR/);
  assert.equal(saves, 0);
});

test("lists safe saved analyses without internal identifiers", async () => {
  const handler = createFinancialAnalysesHandler({
    async save() { return saved; },
    async listLatest() { return [saved]; },
  });
  const result = await handler.get();
  const serialized = JSON.stringify(result.body);
  assert.equal(result.statusCode, 200);
  assert.match(serialized, /Pine Ridge Cabin/);
  assert.doesNotMatch(serialized, /canonical_property_id|listing_snapshot_id|raw_payload/);
});
