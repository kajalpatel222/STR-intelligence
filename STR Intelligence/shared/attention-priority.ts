import type { AttentionEvaluationResult } from "./attention-evaluator.js";

export const ATTENTION_PRIORITY_BANDS = ["review_now", "promising", "low_priority", "ineligible"] as const;
export type AttentionPriorityBand = (typeof ATTENTION_PRIORITY_BANDS)[number];

export type AttentionPriorityReasonCode =
  | "high_attention_sufficient_confidence"
  | "promising_attention"
  | "high_attention_needs_evidence"
  | "low_attention"
  | "unscorable"
  | "strict_limit_violation";

export type AttentionPriority = Readonly<{
  band: AttentionPriorityBand;
  reasonCode: AttentionPriorityReasonCode;
  reason: string;
}>;

export function classifyAttentionPriority(result: AttentionEvaluationResult): AttentionPriority {
  if (result.evaluability.status === "unscorable") {
    return priority("ineligible", "unscorable", "A valid asking price is required before this home can be considered.");
  }
  if (result.strictLimitViolations.length > 0) {
    return priority("ineligible", "strict_limit_violation", "This home falls outside a Strict investment limit.");
  }

  const attention = result.attentionScore ?? 0;
  const confidence = result.confidenceScore ?? 0;
  if (attention >= 75 && confidence >= 65) {
    return priority("review_now", "high_attention_sufficient_confidence", "Strong fit with enough listing evidence to review now.");
  }
  if (attention >= 75) {
    return priority("promising", "high_attention_needs_evidence", "Strong potential, but more listing evidence is needed.");
  }
  if (attention >= 55) {
    return priority("promising", "promising_attention", "This home shows enough potential for further review.");
  }
  return priority("low_priority", "low_attention", "This home is currently a weaker match for your criteria.");
}

function priority(band: AttentionPriorityBand, reasonCode: AttentionPriorityReasonCode, reason: string): AttentionPriority {
  return Object.freeze({ band, reasonCode, reason });
}
