import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { calculateImprovementBudget, type SavedStrPotentialEvaluation, type StrPotentialEvaluation, type StrPotentialEvidence } from "../../shared/str-potential.js";
import type { StrPotentialModelOutput, StrPotentialProvider } from "../str-potential/provider.js";
import { createStrPotentialTools } from "../str-potential/tools.js";
import type { ResolvedStrPotentialSource, StrPotentialRepository } from "../str-potential/repository.js";

export type StrPotentialWorkflowState = Readonly<{
  workflowId: string;
  listingUrl: string;
  forceRefresh: boolean;
  status: "initialized" | "checking_cache" | "assembling_evidence" | "evaluating" | "persisting" | "completed" | "insufficient_evidence" | "failed";
  dataOrigin?: "cache" | "model" | "deterministic";
  saved?: SavedStrPotentialEvaluation;
  failureCode?: "unsupported_property" | "provider_unavailable" | "invalid_result" | "persistence_failed";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}>;

const GraphState = Annotation.Root({
  workflowState: Annotation<StrPotentialWorkflowState>(),
  source: Annotation<ResolvedStrPotentialSource | undefined>(),
  evidence: Annotation<StrPotentialEvidence | undefined>(),
  modelOutput: Annotation<StrPotentialModelOutput | undefined>(),
});

export function initializeStrPotentialWorkflowState(params: Readonly<{ workflowId: string; listingUrl: string; forceRefresh?: boolean; now?: string }>): StrPotentialWorkflowState {
  const now = params.now ?? new Date().toISOString();
  return Object.freeze({ workflowId: params.workflowId, listingUrl: params.listingUrl, forceRefresh: params.forceRefresh ?? false, status: "initialized", createdAt: now, updatedAt: now });
}

export function createStrPotentialGraph(dependencies: Readonly<{ repository: StrPotentialRepository; provider: StrPotentialProvider; now?: () => string }>) {
  const tools = createStrPotentialTools(dependencies);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const lookupCache = async ({ workflowState }: typeof GraphState.State) => {
    if (workflowState.forceRefresh) return { workflowState: { ...workflowState, status: "assembling_evidence" as const } };
    try {
      const saved = await tools.lookupStrPotentialCache.invoke({ listingUrl: workflowState.listingUrl });
      return saved ? { workflowState: finish({ ...workflowState, saved, status: saved.evaluation.status, dataOrigin: "cache" }, now()) }
        : { workflowState: { ...workflowState, status: "assembling_evidence" as const } };
    } catch { return { workflowState: fail(workflowState, "unsupported_property", now()) }; }
  };
  const assembleEvidence = async ({ workflowState }: typeof GraphState.State) => {
    try {
      const assembled = await tools.assembleListingEvidence.invoke({ listingUrl: workflowState.listingUrl });
      return { source: assembled.source, evidence: assembled.evidence, workflowState: { ...workflowState, status: "evaluating" as const } };
    } catch { return { workflowState: fail(workflowState, "unsupported_property", now()) }; }
  };
  const insufficient = async ({ workflowState, source, evidence }: typeof GraphState.State) => {
    const evaluation = deterministicInsufficient(evidence!, dependencies.provider, now());
    try {
      const saved = await dependencies.repository.save({ source: source!, evidence: evidence!, evaluation });
      return { workflowState: finish({ ...workflowState, saved, status: "insufficient_evidence", dataOrigin: "deterministic" }, now()) };
    } catch { return { workflowState: fail(workflowState, "persistence_failed", now()) }; }
  };
  const evaluate = async ({ workflowState, evidence }: typeof GraphState.State) => {
    try {
      const modelOutput = await tools.evaluateStrPotential.invoke({ evidence: evidence! });
      return { modelOutput, workflowState: { ...workflowState, status: "persisting" as const } };
    } catch { return { workflowState: fail(workflowState, "provider_unavailable", now()) }; }
  };
  const persist = async ({ workflowState, source, evidence, modelOutput }: typeof GraphState.State) => {
    try {
      const evaluation = toEvaluation(modelOutput!, evidence!, dependencies.provider, now());
      const saved = await dependencies.repository.save({ source: source!, evidence: evidence!, evaluation });
      return { workflowState: finish({ ...workflowState, saved, status: "completed", dataOrigin: "model" }, now()) };
    } catch { return { workflowState: fail(workflowState, "persistence_failed", now()) }; }
  };
  return new StateGraph(GraphState)
    .addNode("lookup_cache", lookupCache)
    .addNode("assemble_evidence", assembleEvidence)
    .addNode("insufficient_evidence", insufficient)
    .addNode("evaluate", evaluate)
    .addNode("persist", persist)
    .addEdge(START, "lookup_cache")
    .addConditionalEdges("lookup_cache", ({ workflowState }) => workflowState.saved || workflowState.status === "failed" ? "stop" : "assemble", { stop: END, assemble: "assemble_evidence" })
    .addConditionalEdges("assemble_evidence", ({ workflowState, evidence }) => workflowState.status === "failed" ? "stop" : hasUsefulEvidence(evidence!) ? "evaluate" : "insufficient", { stop: END, evaluate: "evaluate", insufficient: "insufficient_evidence" })
    .addConditionalEdges("evaluate", ({ workflowState }) => workflowState.status === "failed" ? "stop" : "persist", { stop: END, persist: "persist" })
    .addEdge("persist", END)
    .addEdge("insufficient_evidence", END)
    .compile();
}

function hasUsefulEvidence(evidence: StrPotentialEvidence) { return evidence.images.length > 0 || Boolean(evidence.property.description) || evidence.property.amenities.length > 0 || evidence.comparableCharacteristics.length > 0; }
function toEvaluation(output: StrPotentialModelOutput, evidence: StrPotentialEvidence, provider: StrPotentialProvider, evaluatedAt: string): StrPotentialEvaluation { return Object.freeze({ ...output, status: "completed", budget: calculateImprovementBudget(output.recommendations, evidence.improvementReserveUsd), evaluatedAt, model: provider.identity }); }
function deterministicInsufficient(evidence: StrPotentialEvidence, provider: StrPotentialProvider, evaluatedAt: string): StrPotentialEvaluation { return Object.freeze({ status: "insufficient_evidence", potential: "insufficient_evidence", summary: "There is not enough listing evidence to evaluate this home's STR potential yet.", confidence: "low", confidenceExplanation: "No usable listing photos, description, amenities, or comparable characteristics were available.", strengths: Object.freeze([]), risks: Object.freeze([]), missingEvidence: Object.freeze(["Listing photos", "Property description", "Existing amenities"]), recommendations: Object.freeze([]), budget: calculateImprovementBudget([], evidence.improvementReserveUsd), evaluatedAt, model: provider.identity }); }
function finish(state: StrPotentialWorkflowState, completedAt: string): StrPotentialWorkflowState { return Object.freeze({ ...state, updatedAt: completedAt, completedAt }); }
function fail(state: StrPotentialWorkflowState, failureCode: NonNullable<StrPotentialWorkflowState["failureCode"]>, completedAt: string): StrPotentialWorkflowState { return finish({ ...state, status: "failed", failureCode }, completedAt); }
