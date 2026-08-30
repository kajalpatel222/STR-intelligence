import { runListingIngestion } from "../ingest/run.js";
import type {
  IngestionRepositoryPort,
  SourceAdapterTransport,
} from "../ingest/types.js";
import { ApifyTransport } from "../sources/apify/transport.js";
import { WORKFLOW_ROUTES } from "./route.js";
import type { ListingWorkflowState } from "./state.js";

export type HomeIngestionNodeState = Readonly<{
  workflowState: ListingWorkflowState;
}>;

export type HomeIngestionNodeDependencies = Readonly<{
  transport?: SourceAdapterTransport;
  repository?: IngestionRepositoryPort;
  pollUntilReady?: boolean;
  pollTimeoutMs?: number;
  now?: () => string;
  runIngestion?: typeof runListingIngestion;
  onTiming?: Parameters<typeof runListingIngestion>[0]["onTiming"];
}>;

export function createHomeIngestionNode(dependencies: HomeIngestionNodeDependencies = {}) {
  // Production defaults stay lazy at graph invocation time, while injected
  // fixture dependencies make the same node safe to exercise without writes.
  const transport = dependencies.transport ?? new ApifyTransport();
  const runIngestion = dependencies.runIngestion ?? runListingIngestion;
  const now = dependencies.now ?? (() => new Date().toISOString());

  return async (state: HomeIngestionNodeState) => {
    const startedAt = now();
    const inProgressState: ListingWorkflowState = {
      ...state.workflowState,
      status: "collecting",
      sourceRunStatus: "running",
      updatedAt: startedAt,
      latestFailure: undefined,
    };

    if (inProgressState.searchRequest.source !== "zillow_existing_home") {
      return failedUpdate(inProgressState, "Home ingestion requires zillow_existing_home", now());
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

      // Pipeline output is mapped without recomputing normalization or dedupe;
      // this node coordinates stages while the ingestion pipeline owns them.
      return {
        selectedPath: WORKFLOW_ROUTES.HOME_INGESTION,
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
      return failedUpdate(
        inProgressState,
        error instanceof Error ? error.message : String(error),
        now(),
      );
    }
  };
}

function failedUpdate(state: ListingWorkflowState, message: string, occurredAt: string) {
  return {
    selectedPath: WORKFLOW_ROUTES.HOME_INGESTION,
    workflowState: {
      ...state,
      status: "failed" as const,
      sourceRunStatus: "failed" as const,
      latestFailure: {
        stage: "collecting" as const,
        message,
        occurredAt,
      },
      updatedAt: occurredAt,
      completedAt: occurredAt,
    },
  };
}
