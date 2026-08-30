import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  selectIngestionRoute,
  WORKFLOW_ROUTES,
  type WorkflowRouteName,
} from "./route.js";
import type { ListingWorkflowState } from "./state.js";
import {
  createHomeIngestionNode,
  type HomeIngestionNodeDependencies,
} from "./home-ingestion-node.js";
import { createLandIngestionNode, type LandIngestionNodeDependencies } from "./land-ingestion-node.js";

// Keeping the Phase 3.1 object in one channel makes it the shared contract and
// avoids maintaining a second LangGraph-specific copy of every workflow field.
const WorkflowGraphState = Annotation.Root({
  workflowState: Annotation<ListingWorkflowState>(),
  selectedPath: Annotation<WorkflowRouteName | undefined>(),
});

function selectedPathNode(selectedPath: WorkflowRouteName) {
  return () => ({ selectedPath });
}

export function createListingRoutingGraph(
  homeDependencies: HomeIngestionNodeDependencies = {},
  landDependencies: LandIngestionNodeDependencies = {},
) {
  const graphBuilder = new StateGraph(WorkflowGraphState)
  .addNode(
    WORKFLOW_ROUTES.HOME_INGESTION,
    createHomeIngestionNode(homeDependencies),
  )
  .addNode(
    WORKFLOW_ROUTES.LAND_INGESTION,
    createLandIngestionNode(landDependencies),
  )
  .addNode(
    WORKFLOW_ROUTES.INVALID_REQUEST,
    selectedPathNode(WORKFLOW_ROUTES.INVALID_REQUEST),
  )
  // The conditional edge delegates to the plain-TypeScript selector so graph
  // execution cannot drift from the authoritative Phase 3.2 routing rules.
  .addConditionalEdges(
    START,
    (state) => selectIngestionRoute(state.workflowState),
    {
      [WORKFLOW_ROUTES.HOME_INGESTION]: WORKFLOW_ROUTES.HOME_INGESTION,
      [WORKFLOW_ROUTES.LAND_INGESTION]: WORKFLOW_ROUTES.LAND_INGESTION,
      [WORKFLOW_ROUTES.INVALID_REQUEST]: WORKFLOW_ROUTES.INVALID_REQUEST,
    },
  )
  .addEdge(WORKFLOW_ROUTES.HOME_INGESTION, END)
  .addEdge(WORKFLOW_ROUTES.LAND_INGESTION, END)
  .addEdge(WORKFLOW_ROUTES.INVALID_REQUEST, END);

  return graphBuilder.compile();
}

export const listingRoutingGraph = createListingRoutingGraph();

export type ListingRoutingGraphState = typeof WorkflowGraphState.State;
