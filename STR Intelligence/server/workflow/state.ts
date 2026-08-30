import type {
  ListingQuery,
  ProviderErrorRecord,
  SourceRunStatus,
} from "../sources/listing-source.js";
import type { NormalizedListingRecord } from "../ingest/types.js";

export type WorkflowSearchFilters = Readonly<Record<string, unknown>>;

export type WorkflowSearchRequest = ListingQuery &
  Readonly<{
    filters: WorkflowSearchFilters;
  }>;

export type WorkflowStatus =
  | "initialized"
  | "collecting"
  | "normalizing"
  | "validating"
  | "deduplicating"
  | "saving"
  | "awaiting_review"
  | "completed"
  | "failed";

export type ValidationError = Readonly<{
  recordIndex: number;
  field?: string;
  code: string;
  message: string;
}>;

export type DeduplicationResult = Readonly<{
  inputCount: number;
  uniqueCount: number;
  duplicateCount: number;
  uniqueRecords: NormalizedListingRecord[];
  duplicateRecords: NormalizedListingRecord[];
}>;

export type SupabaseWorkflowReferences = Readonly<{
  sourceRunId?: string;
  canonicalPropertyIds: string[];
  listingSnapshotIds: string[];
}>;

export type WorkflowFailure = Readonly<{
  stage: WorkflowStatus;
  message: string;
  code?: string;
  occurredAt: string;
}>;

export type HumanReviewStatus =
  | "not_requested"
  | "pending"
  | "in_review"
  | "approved"
  | "rejected";

export type ListingWorkflowState = {
  workflowId: string;
  status: WorkflowStatus;
  searchRequest: WorkflowSearchRequest;
  sourceRunStatus: SourceRunStatus;
  brightData: {
    externalJobId?: string;
    snapshotId?: string;
  };
  rawProviderRecords: unknown[];
  normalizedListings: NormalizedListingRecord[];
  validationErrors: ValidationError[];
  providerErrors: ProviderErrorRecord[];
  deduplication: DeduplicationResult;
  supabase: SupabaseWorkflowReferences;
  retryCount: number;
  latestFailure?: WorkflowFailure;
  humanReviewStatus: HumanReviewStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export function initializeListingWorkflowState(params: {
  workflowId: string;
  searchRequest: WorkflowSearchRequest;
  now?: string;
}): ListingWorkflowState {
  const now = params.now ?? new Date().toISOString();

  return {
    workflowId: params.workflowId,
    status: "initialized",
    searchRequest: {
      ...params.searchRequest,
      filters: { ...params.searchRequest.filters },
    },
    sourceRunStatus: "pending",
    brightData: {},
    rawProviderRecords: [],
    normalizedListings: [],
    validationErrors: [],
    providerErrors: [],
    deduplication: {
      inputCount: 0,
      uniqueCount: 0,
      duplicateCount: 0,
      uniqueRecords: [],
      duplicateRecords: [],
    },
    supabase: {
      canonicalPropertyIds: [],
      listingSnapshotIds: [],
    },
    retryCount: 0,
    humanReviewStatus: "not_requested",
    createdAt: now,
    updatedAt: now,
  };
}
