import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { PublicAttentionEvaluation } from "../../shared/attention-api.js";
import type { AttentionEvaluationInput } from "../../shared/attention-evaluator.js";
import { explainAttentionEvaluation } from "../../shared/attention-reasons.js";
import { evaluateAttention } from "../../shared/attention-scoring.js";
import { classifyAttentionPriority } from "../../shared/attention-priority.js";

const AttentionEvaluationGraphState = Annotation.Root({
  inputs: Annotation<readonly AttentionEvaluationInput[]>(),
  evaluations: Annotation<readonly PublicAttentionEvaluation[]>(),
});

function evaluateCurrentBatch(state: typeof AttentionEvaluationGraphState.State) {
  return {
    evaluations: state.inputs.map((input, listingIndex) => {
      const result = evaluateAttention(input);
      return Object.freeze({
        listingIndex,
        result,
        explanation: explainAttentionEvaluation(input, result),
        priority: classifyAttentionPriority(result),
      });
    }),
  };
}

// This graph is intentionally evaluation-only: applying criteria must never traverse the ingestion graph
// or trigger another provider request for listings already held by the browser.
export function createAttentionEvaluationGraph() {
  return new StateGraph(AttentionEvaluationGraphState)
    .addNode("evaluate_current_batch", evaluateCurrentBatch)
    .addEdge(START, "evaluate_current_batch")
    .addEdge("evaluate_current_batch", END)
    .compile();
}

export const attentionEvaluationGraph = createAttentionEvaluationGraph();
