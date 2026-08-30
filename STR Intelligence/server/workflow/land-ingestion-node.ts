import { runListingIngestion } from "../ingest/run.js";
import type { IngestionRepositoryPort, SourceAdapterTransport } from "../ingest/types.js";
import { ApifyTransport } from "../sources/apify/transport.js";
import { WORKFLOW_ROUTES } from "./route.js";
import type { ListingWorkflowState } from "./state.js";

export type LandIngestionNodeDependencies = Readonly<{
  transport?: SourceAdapterTransport;
  repository?: IngestionRepositoryPort;
  pollUntilReady?: boolean;
  pollTimeoutMs?: number;
  now?: () => string;
  runIngestion?: typeof runListingIngestion;
  onTiming?: Parameters<typeof runListingIngestion>[0]["onTiming"];
}>;

export function createLandIngestionNode(dependencies: LandIngestionNodeDependencies = {}) {
  // A source-specific default keeps production land runs isolated while the
  // injected ports exercise identical orchestration without live side effects.
  const transport = dependencies.transport ?? new ApifyTransport({ source: "zillow_land" });
  const runIngestion = dependencies.runIngestion ?? runListingIngestion;
  const now = dependencies.now ?? (() => new Date().toISOString());

  return async (state: Readonly<{ workflowState: ListingWorkflowState }>) => {
    const startedAt = now();
    const inProgressState: ListingWorkflowState = {
      ...state.workflowState,
      status: "collecting",
      sourceRunStatus: "running",
      updatedAt: startedAt,
      latestFailure: undefined,
    };

    if (inProgressState.searchRequest.source !== "zillow_land") {
      return failedUpdate(inProgressState, "Land ingestion requires zillow_land", now());
    }

    try {
      const result = await runIngestion({
        query: inProgressState.searchRequest,
        transport,
        repository: dependencies.repository,
        pollUntilReady: dependencies.pollUntilReady,
        pollTimeoutMs: dependencies.pollTimeoutMs,
        onTiming: dependencies.onTiming,
      });
      const completedAt = now();
      return {
        selectedPath: WORKFLOW_ROUTES.LAND_INGESTION,
        workflowState: {
          ...inProgressState,
          status: result.runStatus === "failed" ? "failed" : "completed",
          sourceRunStatus: result.runStatus,
          brightData: { externalJobId: result.sourceRun.externalRunId },
          rawProviderRecords: result.rawProviderRecords,
          normalizedListings: result.normalizedListings,
          providerErrors: result.providerErrors,
          deduplication: {
            inputCount: result.totalRecords,
            uniqueCount: result.normalizedListings.length,
            duplicateCount: result.duplicateListings.length,
            uniqueRecords: result.normalizedListings,
            duplicateRecords: result.duplicateListings,
          },
          supabase: {
            sourceRunId: result.sourceRunId,
            canonicalPropertyIds: result.canonicalPropertyIds,
            listingSnapshotIds: result.snapshotIds,
          },
          updatedAt: completedAt,
          completedAt,
        } satisfies ListingWorkflowState,
      };
    } catch (error) {
      return failedUpdate(inProgressState, error instanceof Error ? error.message : String(error), now());
    }
  };
}

function failedUpdate(state: ListingWorkflowState, message: string, occurredAt: string) {
  return {
    selectedPath: WORKFLOW_ROUTES.LAND_INGESTION,
    workflowState: {
      ...state,
      status: "failed" as const,
      sourceRunStatus: "failed" as const,
      latestFailure: { stage: "collecting" as const, message, occurredAt },
      updatedAt: occurredAt,
      completedAt: occurredAt,
    },
  };
}
