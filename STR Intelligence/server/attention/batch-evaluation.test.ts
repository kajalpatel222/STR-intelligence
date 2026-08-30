import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";
import { evaluateStoredHomesBatch } from "./batch-evaluation.js";
import { SupabaseStoredHomeSnapshotSource, StoredHomeRepository, type StoredHomeSnapshot } from "./stored-home-repository.js";

const snapshot = (overrides: Partial<StoredHomeSnapshot>): StoredHomeSnapshot => ({
  snapshotId: "snapshot-default",
  canonicalPropertyId: "home-default",
  observedAt: "2026-08-01T00:00:00.000Z",
  price: 390_000,
  statusText: "For sale",
  beds: 3,
  baths: 2,
  livingAreaSqft: 1_700,
  lotAreaSqft: 21_780,
  description: "Cabin with mountain view and deck",
  amenities: ["fireplace"],
  propertyType: "SINGLE_FAMILY",
  address: "123 Pine St",
  city: "Oakhurst",
  county: "Madera",
  state: "CA",
  postalCode: "93644",
  ...overrides,
});

test("groups stored snapshots and evaluates only each home's latest snapshot", async () => {
  const homes = new StoredHomeRepository({
    async readExistingHomeSnapshots() {
      return [
        snapshot({ snapshotId: "old-a", canonicalPropertyId: "home-a", observedAt: "2026-08-01T00:00:00.000Z", price: 410_000 }),
        snapshot({ snapshotId: "latest-a", canonicalPropertyId: "home-a", observedAt: "2026-08-08T00:00:00.000Z", price: 390_000 }),
        snapshot({ snapshotId: "only-b", canonicalPropertyId: "home-b", price: undefined }),
      ];
    },
  });
  const result = await evaluateStoredHomesBatch({
    homes,
    criteria: { async getDefaults() { return DEFAULT_INVESTMENT_CRITERIA; } },
  });

  assert.equal(result.totalHomes, 2);
  assert.deepEqual(result.criteria, DEFAULT_INVESTMENT_CRITERIA);
  assert.equal(result.evaluatedCount, 1);
  assert.equal(result.unscorableCount, 1);
  assert.equal(result.failedCount, 0);
  const first = result.evaluations.find((item) => item.canonicalPropertyId === "home-a");
  assert.equal(first?.latestSnapshotId, "latest-a");
  assert.equal(first?.evaluation.result.categories.deal_signals.score, 7);
});

test("contains one malformed stored home without failing the batch", async () => {
  const valid = snapshot({ canonicalPropertyId: "home-valid" });
  const malformed = snapshot({ canonicalPropertyId: "home-bad", amenities: null as unknown as string[] });
  const result = await evaluateStoredHomesBatch({
    homes: { async listStoredHomes() { return [
      { canonicalPropertyId: "home-valid", latest: valid, history: [valid] },
      { canonicalPropertyId: "home-bad", latest: malformed, history: [malformed] },
    ]; } },
    criteria: { async getDefaults() { return DEFAULT_INVESTMENT_CRITERIA; } },
  });

  assert.equal(result.evaluatedCount, 1);
  assert.equal(result.failedCount, 1);
  assert.deepEqual(result.failures, [{ canonicalPropertyId: "home-bad", latestSnapshotId: "snapshot-default", message: "This stored home could not be evaluated." }]);
});

test("Supabase source filters parcels before returning stored snapshots", async () => {
  const filters: Array<[string, string]> = [];
  const chain = {
    select() { return chain; },
    eq(column: string, value: string) { filters.push([column, value]); return chain; },
    not() { return chain; },
    async order() { return { data: [], error: null }; },
  };
  const source = new SupabaseStoredHomeSnapshotSource({
    from() { return chain; },
  } as never);

  assert.deepEqual(await source.readExistingHomeSnapshots(), []);
  assert.deepEqual(filters, [["canonical_properties.property_kind", "existing_home"]]);
});
