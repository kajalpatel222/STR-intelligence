import type { ListingSourceKind } from "../sources/listing-source.js";
import type { ListingWorkflowState } from "./state.js";

export const WORKFLOW_ROUTES = {
  HOME_INGESTION: "home_ingestion",
  LAND_INGESTION: "land_ingestion",
  INVALID_REQUEST: "invalid_request",
} as const;

export type WorkflowRouteName = (typeof WORKFLOW_ROUTES)[keyof typeof WORKFLOW_ROUTES];

const HOME_SOURCES = new Set<ListingSourceKind>(["zillow_existing_home"]);
const LAND_SOURCES = new Set<ListingSourceKind>(["zillow_land", "land_parcel"]);

type RoutableWorkflowState = Pick<ListingWorkflowState, "searchRequest">;

export function selectIngestionRoute(
  state: RoutableWorkflowState | null | undefined,
): WorkflowRouteName {
  const request = state?.searchRequest;
  if (!isValidRequestShape(request)) return WORKFLOW_ROUTES.INVALID_REQUEST;

  if (HOME_SOURCES.has(request.source)) {
    return WORKFLOW_ROUTES.HOME_INGESTION;
  }

  if (LAND_SOURCES.has(request.source)) {
    return request.homeType === undefined
      ? WORKFLOW_ROUTES.LAND_INGESTION
      : WORKFLOW_ROUTES.INVALID_REQUEST;
  }

  return WORKFLOW_ROUTES.INVALID_REQUEST;
}

function isValidRequestShape(request: unknown): request is ListingWorkflowState["searchRequest"] {
  if (!request || typeof request !== "object") return false;

  const candidate = request as Record<string, unknown>;
  return (
    typeof candidate.source === "string" &&
    typeof candidate.location === "string" &&
    candidate.location.trim().length > 0 &&
    typeof candidate.lookbackDays === "number" &&
    Number.isInteger(candidate.lookbackDays) &&
    candidate.lookbackDays > 0 &&
    candidate.lookbackDays <= 30 &&
    typeof candidate.recordLimit === "number" &&
    Number.isInteger(candidate.recordLimit) &&
    candidate.recordLimit > 0 &&
    candidate.filters !== null &&
    typeof candidate.filters === "object" &&
    !Array.isArray(candidate.filters)
  );
}
