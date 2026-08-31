import { strict as assert } from "node:assert";
import test from "node:test";
import {
  initializeListingWorkflowState,
  type WorkflowSearchRequest,
} from "./state.js";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";

const searchRequest: WorkflowSearchRequest = {
  source: "zillow_existing_home",
  location: "Oakhurst, CA",
  lookbackDays: 7,
  recordLimit: 10,
  listingCategory: "for_sale",
  homeType: "house",
  filters: { minimumBedrooms: 2 },
};

test("initializes workflow state with safe defaults and independent collections", () => {
  const first = initializeListingWorkflowState({
    workflowId: "workflow-1",
    searchRequest,
    now: "2026-08-29T12:00:00.000Z",
  });
  const second = initializeListingWorkflowState({
    workflowId: "workflow-2",
    searchRequest,
    now: "2026-08-29T12:01:00.000Z",
  });
  const firstRawRecords: unknown[] = first.rawProviderRecords;
  const firstCanonicalPropertyIds: string[] = first.supabase.canonicalPropertyIds;

  assert.equal(first.status, "initialized");
  assert.equal(first.sourceRunStatus, "pending");
  assert.equal(first.retryCount, 0);
  assert.equal(first.humanReviewStatus, "not_requested");
  assert.equal(first.createdAt, "2026-08-29T12:00:00.000Z");
  assert.equal(first.updatedAt, first.createdAt);
  assert.equal(first.completedAt, undefined);
  assert.equal(first.latestFailure, undefined);
  assert.deepEqual(first.brightData, {});
  assert.deepEqual(first.rawProviderRecords, []);
  assert.deepEqual(first.normalizedListings, []);
  assert.deepEqual(first.validationErrors, []);
  assert.deepEqual(first.providerErrors, []);
  assert.deepEqual(first.deduplication, {
    inputCount: 0,
    uniqueCount: 0,
    duplicateCount: 0,
    uniqueRecords: [],
    duplicateRecords: [],
  });
  assert.deepEqual(first.supabase, {
    canonicalPropertyIds: [],
    listingSnapshotIds: [],
  });

  assert.notStrictEqual(first.rawProviderRecords, second.rawProviderRecords);
  assert.notStrictEqual(first.normalizedListings, second.normalizedListings);
  assert.notStrictEqual(first.validationErrors, second.validationErrors);
  assert.notStrictEqual(first.providerErrors, second.providerErrors);
  assert.notStrictEqual(first.deduplication, second.deduplication);
  assert.notStrictEqual(first.deduplication.uniqueRecords, second.deduplication.uniqueRecords);
  assert.notStrictEqual(first.supabase, second.supabase);
  assert.notStrictEqual(first.supabase.canonicalPropertyIds, second.supabase.canonicalPropertyIds);
  assert.notStrictEqual(first.searchRequest.filters, second.searchRequest.filters);

  firstRawRecords.push({ changed: true });
  firstCanonicalPropertyIds.push("property-1");
  assert.deepEqual(second.rawProviderRecords, []);
  assert.deepEqual(second.supabase.canonicalPropertyIds, []);
});

test("copies criteria into an immutable workflow snapshot", () => {
  const input = { ...DEFAULT_INVESTMENT_CRITERIA };
  const first = initializeListingWorkflowState({ workflowId: "criteria-1", searchRequest, investmentCriteria: input });
  const second = initializeListingWorkflowState({ workflowId: "criteria-2", searchRequest, investmentCriteria: input });

  input.maximumImprovementReserveUsd = 99_000;
  assert.equal(first.investmentCriteria?.maximumImprovementReserveUsd, 40_000);
  assert.equal(Object.isFrozen(first.investmentCriteria), true);
  assert.notStrictEqual(first.investmentCriteria, input);
  assert.notStrictEqual(first.investmentCriteria, second.investmentCriteria);
});
