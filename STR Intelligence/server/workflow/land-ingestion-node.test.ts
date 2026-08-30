import { strict as assert } from "node:assert";
import test from "node:test";
import type { SourceAdapterTransport } from "../ingest/types.js";
import { createListingRoutingGraph } from "./graph.js";
import { initializeListingWorkflowState } from "./state.js";

class LandFixtureTransport implements SourceAdapterTransport {
  readonly sourceIdentity = { key: "test_apify_land", name: "Test Apify Land", kind: "land_parcel" };
  async submit() { return { source: "zillow_land" as const, externalRunId: "land-fixture-run", status: "running" as const }; }
  async status() { return { source: "zillow_land" as const, externalRunId: "land-fixture-run", status: "succeeded" as const }; }
  async results() {
    return [{
      kind: "listing" as const,
      source: "zillow_land" as const,
      externalId: "parcel-1",
      url: "https://example.com/parcel-1",
      discoveredAt: "2026-08-29T12:00:00.000Z",
      address: "Road 426, Oakhurst, CA 93644",
      city: "Oakhurst",
      state: "CA",
      postalCode: "93644",
      price: 129000,
      lotSqft: 98010,
      propertyType: "LOT",
      raw: { fixture: true },
    }, {
      kind: "provider_error" as const,
      source: "zillow_land" as const,
      externalId: "mixed-home-1",
      message: "Provider returned a non-land listing",
      raw: { homeType: "SINGLE_FAMILY" },
    }];
  }
}

class LandTestRepository {
  async getMarket() { return { id: "market-1", name: "Oakhurst", state: "CA", zip_code: "93644", county: "Madera County", default_lookback_days: 7, max_lookback_days: 30 }; }
  async ensureSource(key: string, _name: string, kind: string) { assert.equal(key, "test_apify_land"); assert.equal(kind, "land_parcel"); return { id: "land-source-1" }; }
  async createSourceRun() { return { id: "land-run-1", sourceRun: { source: "zillow_land" as const, externalRunId: "land-run-1", status: "running" as const } }; }
  async finishSourceRun() {}
  async upsertCanonicalProperty(record: { source: string }) { assert.equal(record.source, "zillow_land"); return { id: "parcel-canonical-1" }; }
  async upsertPropertySourceId() {}
  async insertListingSnapshot() { return { id: "land-snapshot-1" }; }
}

function landWorkflowState() {
  return initializeListingWorkflowState({
    workflowId: "land-fixture",
    searchRequest: { source: "zillow_land", location: "Oakhurst, CA", lookbackDays: 7, recordLimit: 5, filters: {} },
    now: "2026-08-29T12:00:00.000Z",
  });
}

test("land graph node maps fixture ingestion into workflow state", async () => {
  const graph = createListingRoutingGraph({}, {
    transport: new LandFixtureTransport(),
    repository: new LandTestRepository(),
    pollUntilReady: false,
    now: () => "2026-08-29T12:05:00.000Z",
  });
  const result = await graph.invoke({ workflowState: landWorkflowState() });
  assert.equal(result.selectedPath, "land_ingestion");
  assert.equal(result.workflowState.status, "completed");
  assert.equal(result.workflowState.normalizedListings[0]?.source, "zillow_land");
  assert.equal(result.workflowState.normalizedListings[0]?.lotSqft, 98010);
  assert.equal(result.workflowState.normalizedListings.length, 1);
  assert.equal(result.workflowState.providerErrors.length, 1);
  assert.equal(result.workflowState.sourceRunStatus, "partial");
  assert.deepEqual(result.workflowState.supabase, {
    sourceRunId: "land-run-1",
    canonicalPropertyIds: ["parcel-canonical-1"],
    listingSnapshotIds: ["land-snapshot-1"],
  });
});

test("land graph node contains ingestion failures", async () => {
  const graph = createListingRoutingGraph({}, {
    runIngestion: async () => { throw new Error("land fixture unavailable"); },
    now: () => "2026-08-29T12:06:00.000Z",
  });
  const result = await graph.invoke({ workflowState: landWorkflowState() });
  assert.equal(result.selectedPath, "land_ingestion");
  assert.equal(result.workflowState.status, "failed");
  assert.equal(result.workflowState.latestFailure?.message, "land fixture unavailable");
});
