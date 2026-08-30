import {
  ATTENTION_CATEGORY_CODES,
  type AttentionCategoryCode,
  type AttentionEvaluationInput,
  type AttentionEvaluationResult,
  type AttentionEvidenceCode,
  type AttentionReasonCode,
  type AttentionRiskCode,
  type StrictLimitCode,
} from "./attention-evaluator.js";

export type AttentionExplanation = Readonly<{
  summary: string;
  positiveDrivers: readonly string[];
  concerns: readonly string[];
  missingEvidence: readonly string[];
}>;

const REASON_TEXT: Record<AttentionReasonCode, string> = {
  within_purchase_budget: "The asking price fits your purchase budget.",
  below_purchase_budget: "The asking price is below your preferred range.",
  above_purchase_budget: "The asking price is above your preferred range.",
  missing_required_price: "A valid asking price is needed before this property can be scored.",
  limited_property_evidence: "The listing has limited detail, so its potential needs more review.",
  str_appeal_evidence: "The listing shows features that may appeal to short-term-rental guests.",
  amenity_evidence: "The property already includes useful guest amenities.",
  value_add_evidence: "The property shows potential for improvements within your plan.",
  deal_signal_evidence: "The listing history contains a potentially favorable deal signal.",
};

const RISK_TEXT: Record<AttentionRiskCode, string> = {
  price_above_limit: "The asking price exceeds your purchase limit.",
  price_below_limit: "The asking price falls below your preferred range.",
  missing_required_evidence: "Important property information is missing.",
  property_type_mismatch: "The property type does not match this investment search.",
  unknown_location_risk: "The location needs verification before relying on this result.",
};

const STRICT_LIMIT_TEXT: Record<StrictLimitCode, string> = {
  purchase_price_below_minimum: "The asking price is below your strict purchase range.",
  purchase_price_above_maximum: "The asking price is above your strict purchase limit.",
  improvement_reserve_above_maximum: "The estimated improvements exceed your strict reserve limit.",
};

const EVIDENCE_TEXT: Record<AttentionEvidenceCode, string> = {
  listing_price: "asking price",
  property_type: "property type",
  location: "location",
  beds: "bedroom count",
  baths: "bathroom count",
  living_area: "living area",
  lot_area: "lot size",
  description: "property description",
  photos: "listing photos",
  amenities: "amenity details",
  view_signals: "view details",
  listing_history: "listing history",
  price_history: "price history",
};

/**
 * Converts stable evaluator codes into consistent end-user explanations. The score engine owns
 * calculations; this module deliberately ignores provider payloads and any model-generated prose.
 */
export function explainAttentionEvaluation(
  input: AttentionEvaluationInput,
  result: AttentionEvaluationResult,
): AttentionExplanation {
  if (result.evaluability.status === "unscorable") {
    return freezeExplanation({
      summary: "This property cannot be scored yet because a valid asking price is missing.",
      positiveDrivers: [],
      concerns: [REASON_TEXT.missing_required_price],
      missingEvidence: missingEvidenceText(input.evidence.missing),
    });
  }

  const reasonCodes = collectReasonCodes(result);
  const positiveDrivers = unique(reasonCodes
    .filter(isPositiveReason)
    .map((code) => REASON_TEXT[code]));

  const concerns = unique([
    ...result.strictLimitViolations.map((violation) => STRICT_LIMIT_TEXT[violation.code]),
    ...result.riskDeductions.map((risk) => RISK_TEXT[risk.code]),
    ...reasonCodes.filter(isConcernReason).map((code) => REASON_TEXT[code]),
  ]);

  return freezeExplanation({
    summary: buildSummary(result),
    positiveDrivers,
    concerns,
    missingEvidence: missingEvidenceText(input.evidence.missing),
  });
}

function buildSummary(result: AttentionEvaluationResult): string {
  if (result.attentionScore === null || result.confidenceScore === null) {
    return "The evaluation is still being calculated.";
  }
  return `Attention score ${result.attentionScore} out of 100, with ${result.confidenceScore}% confidence.`;
}

function collectReasonCodes(result: AttentionEvaluationResult): AttentionReasonCode[] {
  const codes = result.reasons.map((reason) => reason.code);
  for (const category of ATTENTION_CATEGORY_CODES) {
    if ((result.categories[category].score ?? 0) > 0) codes.push(...categoryReasons(result, category));
  }
  return unique(codes);
}

function categoryReasons(result: AttentionEvaluationResult, category: AttentionCategoryCode): AttentionReasonCode[] {
  return result.categories[category].reasons.map((reason) => reason.code);
}

function isPositiveReason(code: AttentionReasonCode): boolean {
  return code === "within_purchase_budget"
    || code === "str_appeal_evidence"
    || code === "amenity_evidence"
    || code === "value_add_evidence"
    || code === "deal_signal_evidence";
}

function isConcernReason(code: AttentionReasonCode): boolean {
  return code === "below_purchase_budget"
    || code === "above_purchase_budget"
    || code === "missing_required_price"
    || code === "limited_property_evidence";
}

function missingEvidenceText(codes: readonly AttentionEvidenceCode[]): string[] {
  return unique(codes.map((code) => `Missing ${EVIDENCE_TEXT[code]}.`));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function freezeExplanation(explanation: AttentionExplanation): AttentionExplanation {
  return Object.freeze({
    summary: explanation.summary,
    positiveDrivers: Object.freeze([...explanation.positiveDrivers]),
    concerns: Object.freeze([...explanation.concerns]),
    missingEvidence: Object.freeze([...explanation.missingEvidence]),
  });
}
