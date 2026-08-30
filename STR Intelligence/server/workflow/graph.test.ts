import { strict as assert } from "node:assert";
import test from "node:test";
import { createListingRoutingGraph } from "./graph.js";
import { WORKFLOW_ROUTES, type WorkflowRouteName } from "./route.js";
import {
  initializeListingWorkflowState,
  type WorkflowSearchRequest,
} from "./state.js";

const baseRequest = {
  location: "Oakhurst, CA",
  lookbackDays: 7,
  recordLimit: 10,
  filters: {},
} as const;

async function assertGraphRoute(
  searchRequest: WorkflowSearchRequest,
  expectedPath: WorkflowRouteName,
) {
  const workflowState = initializeListingWorkflowState({
    workflowId: `graph-${expectedPath}`,
    searchRequest,
    now: "2026-08-29T12:00:00.000Z",
  });

  // Routing-only tests inject the former proof behavior; fixture-backed home
  // ingestion is covered separately without allowing live dependencies here.
  const proofDependency = { runIngestion: async () => ({
    sourceRunId: "proof-run",
    sourceRun: { source: searchRequest.source, externalRunId: "proof", status: "succeeded" as const },
    totalRecords: 0, listingRecords: 0, providerErrorRecords: 0, deduplicatedRecords: 0,
    runStatus: "succeeded" as const, rawProviderRecords: [], normalizedListings: [], duplicateListings: [],
    providerErrors: [], snapshotIds: [], canonicalPropertyIds: [],
    timings: { triggerMs: 0, collectionMs: 0, downloadAndProcessingMs: 0, supabasePersistenceMs: 0, totalMs: 0 },
  }) };
  const graph = createListingRoutingGraph(proofDependency, proofDependency);
  const result = await graph.invoke({ workflowState });
  assert.equal(result.selectedPath, expectedPath);
  if (expectedPath === WORKFLOW_ROUTES.INVALID_REQUEST) {
    assert.strictEqual(result.workflowState, workflowState);
  }
}

test("LangGraph selects the land ingestion branch", async () => {
  await assertGraphRoute(
    { ...baseRequest, source: "zillow_land" },
    WORKFLOW_ROUTES.LAND_INGESTION,
  );
});

test("LangGraph selects the invalid request branch", async () => {
  await assertGraphRoute(
    { ...baseRequest, source: "zillow_land", homeType: "house" },
    WORKFLOW_ROUTES.INVALID_REQUEST,
  );
});
