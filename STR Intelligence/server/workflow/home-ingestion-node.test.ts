import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FixtureTransport } from "../ingest/fixture-transport.js";
import { createListingRoutingGraph } from "./graph.js";
import { initializeListingWorkflowState } from "./state.js";

class TestRepository {
  async getMarket() {
    return { id: "market-1", name: "Oakhurst", state: "CA", zip_code: "93644", county: "Madera County", default_lookback_days: 7, max_lookback_days: 30 };
  }
  async ensureSource() { return { id: "source-1" }; }
  async createSourceRun() { return { id: "run-1", sourceRun: { source: "zillow_existing_home" as const, externalRunId: "run-1", status: "running" as const } }; }
  async finishSourceRun() {}
  async upsertCanonicalProperty() { return { id: "canonical-1" }; }
  async upsertPropertySourceId() {}
  async insertListingSnapshot() { return { id: "snapshot-1" }; }
}

function homeWorkflowState() {
  return initializeListingWorkflowState({
    workflowId: "home-fixture",
    searchRequest: {
      source: "zillow_existing_home",
      location: "Oakhurst, CA",
      lookbackDays: 7,
      recordLimit: 10,
      homeType: "house",
      filters: {},
    },
    now: "2026-08-29T12:00:00.000Z",
  });
}

test("home graph node maps successful fixture ingestion into workflow state", async () => {
  const graph = createListingRoutingGraph({
    transport: new FixtureTransport(fileURLToPath(new URL("../fixtures/zillow-oakhurst-fixture.json", import.meta.url))),
    repository: new TestRepository(),
    pollUntilReady: false,
    now: () => "2026-08-29T12:05:00.000Z",
  });

  const result = await graph.invoke({ workflowState: homeWorkflowState() });

  assert.equal(result.selectedPath, "home_ingestion");
  assert.equal(result.workflowState.status, "completed");
  assert.equal(result.workflowState.sourceRunStatus, "partial");
  assert.equal(result.workflowState.brightData.externalJobId, "fixture_zillow_existing_home");
  assert.equal(result.workflowState.normalizedListings.length, 1);
  assert.equal(result.workflowState.providerErrors.length, 1);
  assert.equal(result.workflowState.deduplication.duplicateRecords.length, 1);
  assert.deepEqual(result.workflowState.deduplication, {
    inputCount: 3,
    uniqueCount: 1,
    duplicateCount: 1,
    uniqueRecords: result.workflowState.normalizedListings,
    duplicateRecords: result.workflowState.deduplication.duplicateRecords,
  });
  assert.deepEqual(result.workflowState.supabase, {
    sourceRunId: "run-1",
    canonicalPropertyIds: ["canonical-1"],
    listingSnapshotIds: ["snapshot-1"],
  });
  assert.equal(result.workflowState.completedAt, "2026-08-29T12:05:00.000Z");
  assert.equal(result.workflowState.latestFailure, undefined);
});

test("home graph node maps ingestion exceptions into failure state", async () => {
  const graph = createListingRoutingGraph({
    runIngestion: async () => { throw new Error("fixture transport unavailable"); },
    now: () => "2026-08-29T12:06:00.000Z",
  });

  const result = await graph.invoke({ workflowState: homeWorkflowState() });

  assert.equal(result.selectedPath, "home_ingestion");
  assert.equal(result.workflowState.status, "failed");
  assert.equal(result.workflowState.sourceRunStatus, "failed");
  assert.deepEqual(result.workflowState.latestFailure, {
    stage: "collecting",
    message: "fixture transport unavailable",
    occurredAt: "2026-08-29T12:06:00.000Z",
  });
  assert.equal(result.workflowState.completedAt, "2026-08-29T12:06:00.000Z");
});
