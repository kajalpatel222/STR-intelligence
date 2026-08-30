import { strict as assert } from "node:assert";
import test from "node:test";
import type { ListingWorkflowState, WorkflowSearchRequest } from "./state.js";
import { initializeListingWorkflowState } from "./state.js";
import { selectIngestionRoute, WORKFLOW_ROUTES } from "./route.js";

function stateFor(searchRequest: WorkflowSearchRequest) {
  return initializeListingWorkflowState({
    workflowId: "routing-test",
    searchRequest,
    now: "2026-08-29T12:00:00.000Z",
  });
}

const baseRequest = {
  location: "Oakhurst, CA",
  lookbackDays: 7,
  recordLimit: 10,
  filters: {},
} as const;

test("routes an existing-home request to home ingestion", () => {
  const state = stateFor({
    ...baseRequest,
    source: "zillow_existing_home",
    homeType: "house",
  });

  assert.equal(selectIngestionRoute(state), WORKFLOW_ROUTES.HOME_INGESTION);
});

test("routes supported land requests to land ingestion", () => {
  assert.equal(
    selectIngestionRoute(stateFor({ ...baseRequest, source: "zillow_land" })),
    WORKFLOW_ROUTES.LAND_INGESTION,
  );
  assert.equal(
    selectIngestionRoute(stateFor({ ...baseRequest, source: "land_parcel" })),
    WORKFLOW_ROUTES.LAND_INGESTION,
  );
});

test("routes missing, unsupported, and inconsistent requests to invalid", () => {
  const malformedStates: Array<ListingWorkflowState | null | undefined> = [
    undefined,
    null,
    { searchRequest: { ...baseRequest } } as unknown as ListingWorkflowState,
    {
      searchRequest: { ...baseRequest, source: "unsupported_provider" },
    } as unknown as ListingWorkflowState,
    stateFor({ ...baseRequest, source: "zillow_land", homeType: "house" }),
    stateFor({ ...baseRequest, source: "zillow_existing_home", location: " " }),
  ];

  for (const state of malformedStates) {
    assert.equal(selectIngestionRoute(state), WORKFLOW_ROUTES.INVALID_REQUEST);
  }
});
