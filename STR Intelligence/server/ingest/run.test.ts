import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FixtureTransport } from "./fixture-transport.js";
import { runListingIngestion } from "./run.js";

class StubRepository {
  async getMarket(location: string) {
    assert.equal(location, "Oakhurst, CA");
    return {
      id: "market-1",
      name: "Oakhurst",
      state: "CA",
      zip_code: "93644",
      county: "Madera County",
      default_lookback_days: 7,
      max_lookback_days: 30,
    };
  }

  async ensureSource() {
    return { id: "source-1" };
  }

  async createSourceRun() {
    return { id: "run-1", sourceRun: { source: "zillow_existing_home" as const, externalRunId: "run-1", status: "running" as const } };
  }

  async finishSourceRun() {}

  async upsertCanonicalProperty() {
    return { id: "canonical-1" };
  }

  async upsertPropertySourceId() {}

  async insertListingSnapshot() {
    return { id: "snapshot-1" };
  }
}

test("fixture ingestion normalizes, deduplicates, and retains provider errors", async () => {
  const result = await runListingIngestion({
    query: {
      source: "zillow_existing_home",
      location: "Oakhurst, CA",
      lookbackDays: 7,
      recordLimit: 30,
      listingCategory: "for_sale",
      homeType: "house",
    },
    transport: new FixtureTransport(fileURLToPath(new URL("../fixtures/zillow-oakhurst-fixture.json", import.meta.url))),
    repository: new StubRepository(),
    pollUntilReady: false,
  });

  assert.equal(result.totalRecords, 3);
  assert.equal(result.listingRecords, 1);
  assert.equal(result.providerErrorRecords, 1);
  assert.equal(result.deduplicatedRecords, 2);
  assert.equal(result.runStatus, "partial");
  assert.equal(result.rawProviderRecords.length, 3);
  assert.equal(result.normalizedListings.length, 1);
  assert.equal(result.duplicateListings.length, 1);
  assert.equal(result.providerErrors.length, 1);
  assert.deepEqual(result.snapshotIds, ["snapshot-1"]);
});
