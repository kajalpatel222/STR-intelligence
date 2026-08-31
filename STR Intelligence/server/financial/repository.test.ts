import { strict as assert } from "node:assert";
import test from "node:test";
import type { SaveFinancialAnalysisRequest } from "../../shared/financial-analysis.js";
import { createFinancialAssumptions } from "../../shared/financial-assumptions.js";
import { calculateBaseCaseFinancials } from "../../shared/financial-calculator.js";
import {
  FinancialAnalysisRepository,
  type FinancialAnalysisStore,
  rowToSavedAnalysis,
} from "./repository.js";

const request: SaveFinancialAnalysisRequest = Object.freeze({
  property: Object.freeze({
    listingUrl: "https://www.zillow.com/homedetails/123",
    title: "Pine Ridge Cabin",
    address: "123 Pine Road",
    location: "Oakhurst, CA",
    priceUsd: 327_000,
  }),
  assumptions: createFinancialAssumptions({ purchasePriceUsd: 327_000 }),
});

test("persists an immutable server-calculated analysis version", async () => {
  let inserted: Record<string, unknown> | undefined;
  const store: FinancialAnalysisStore = {
    async resolveProperty() { return { canonicalPropertyId: "property-1", listingSnapshotId: "snapshot-1" }; },
    async nextVersion() { return 3; },
    async insert(row) { inserted = row; return row; },
    async list() { return []; },
  };
  const saved = await new FinancialAnalysisRepository(store).save(request);

  assert.equal(inserted?.canonical_property_id, "property-1");
  assert.equal(inserted?.listing_snapshot_id, "snapshot-1");
  assert.equal(inserted?.analysis_version, 3);
  assert.equal(inserted?.cash_on_cash_return, saved.result.returns.cashOnCashReturnRatio);
  assert.deepEqual(inserted?.assumptions_snapshot, request.assumptions);
  assert.equal(saved.result.methodologyVersion, "base-case-365-v4");
  assert.equal(Object.isFrozen(saved), true);
  assert.equal(Object.isFrozen(saved.result), true);
});

test("does not save a URL that cannot be resolved to a stored property", async () => {
  let inserts = 0;
  const store: FinancialAnalysisStore = {
    async resolveProperty() { return undefined; },
    async nextVersion() { return 1; },
    async insert(row) { inserts += 1; return row; },
    async list() { return []; },
  };
  await assert.rejects(() => new FinancialAnalysisRepository(store).save(request), /not available/);
  assert.equal(inserts, 0);
});

test("returns only the latest valid analysis for each property", async () => {
  const result = calculateBaseCaseFinancials(request.assumptions);
  const row = (propertyId: string, savedAt: string) => ({
    canonical_property_id: propertyId,
    property_snapshot: request.property,
    assumptions_snapshot: request.assumptions,
    result_snapshot: result,
    created_at: savedAt,
  });
  const store: FinancialAnalysisStore = {
    async resolveProperty() { return undefined; },
    async nextVersion() { return 1; },
    async insert(value) { return value; },
    async list() { return [row("property-1", "2026-08-30T22:00:00Z"), row("property-1", "2026-08-30T21:00:00Z"), row("property-2", "2026-08-30T20:00:00Z"), { canonical_property_id: "broken" }]; },
  };
  const analyses = await new FinancialAnalysisRepository(store).listLatest();
  assert.equal(analyses.length, 2);
  assert.equal(analyses[0]!.savedAt, "2026-08-30T22:00:00Z");
});

test("contains malformed stored snapshots instead of exposing partial data", () => {
  assert.equal(rowToSavedAnalysis({ property_snapshot: {}, assumptions_snapshot: {}, result_snapshot: {} }), undefined);
});
