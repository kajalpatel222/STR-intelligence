import {
  ATTENTION_CATEGORY_CODES,
  initializeAttentionEvaluationResult,
  type AttentionCategoryBreakdown,
  type AttentionCategoryCode,
  type AttentionEvaluationInput,
  type AttentionEvaluationResult,
  type AttentionEvidenceCode,
  type AttentionReason,
  type AttentionRiskDeduction,
  type StrictLimitViolation,
} from "./attention-evaluator.js";

export const ATTENTION_CATEGORY_WEIGHTS: Readonly<Record<AttentionCategoryCode, number>> = Object.freeze({
  budget_fit: 35,
  str_appeal: 25,
  amenities: 15,
  value_add: 15,
  deal_signals: 10,
});

const STR_APPEAL_TERMS = ["cabin", "deck", "fire pit", "hot tub", "privacy", "private", "yosemite"];
const VALUE_ADD_TERMS = ["fixer", "needs updating", "needs renovation", "room to add", "potential", "unfinished"];

/**
 * Scores only evidence present in the normalized sale listing. Missing evidence lowers confidence,
 * not attractiveness; available category points are therefore normalized to a 100-point score.
 */
export function evaluateAttention(input: AttentionEvaluationInput): AttentionEvaluationResult {
  const initial = initializeAttentionEvaluationResult(input);
  const confidenceScore = calculateConfidence(input);
  if (initial.evaluability.status === "unscorable") {
    return freezeResult({ ...initial, confidenceScore });
  }

  const categories = calculateCategories(input);
  const strictLimitViolations = calculateStrictViolations(input);
  const riskDeductions = calculateRiskDeductions(input);
  const availableCategories = ATTENTION_CATEGORY_CODES.filter((code) => categories[code].score !== null);
  const availableWeight = availableCategories.reduce((sum, code) => sum + ATTENTION_CATEGORY_WEIGHTS[code], 0);
  const earned = availableCategories.reduce((sum, code) => sum + (categories[code].score ?? 0), 0);
  const baseScore = availableWeight === 0 ? 0 : (earned / availableWeight) * 100;
  const deductions = riskDeductions.reduce((sum, risk) => sum + (risk.deductionPoints ?? 0), 0);
  const reasons = ATTENTION_CATEGORY_CODES.flatMap((code) => (categories[code].score ?? 0) > 0 ? categories[code].reasons : []);

  return freezeResult({
    ...initial,
    attentionScore: round(clamp(baseScore - deductions, 0, 100)),
    confidenceScore,
    categories,
    reasons,
    riskDeductions,
    strictLimitViolations,
  });
}

function calculateCategories(input: AttentionEvaluationInput): AttentionCategoryBreakdown {
  const { facts, criteria } = input;
  const price = facts.listingPriceUsd!;
  const budgetScore = price < criteria.minimumPurchaseBudgetUsd && criteria.minimumPurchaseBudgetUsd > 0
    ? 30 + 5 * clamp(price / criteria.minimumPurchaseBudgetUsd, 0, 1)
    : ATTENTION_CATEGORY_WEIGHTS.budget_fit;
  const budgetReason: AttentionReason = price > criteria.maximumPurchaseBudgetUsd
    ? reason("above_purchase_budget", "The listing price is above the preferred purchase limit.", ["listing_price"])
    : price < criteria.minimumPurchaseBudgetUsd
      ? reason("below_purchase_budget", "The listing price is below the preferred purchase range.", ["listing_price"])
      : reason("within_purchase_budget", "The listing price is within the preferred purchase range.", ["listing_price"]);

  const description = facts.description?.toLowerCase() ?? "";
  const appealAvailable = hasEvidence(input, "description") || hasEvidence(input, "view_signals");
  const appealPoints = Math.min(25, Math.min(facts.viewSignals.length, 2) * 7.5
    + Math.min(countTerms(description, STR_APPEAL_TERMS), 4) * 2.5);
  const amenityAvailable = hasEvidence(input, "amenities");
  const amenityPoints = Math.min(15, facts.amenities.length * 3);
  const valueAddAvailable = hasEvidence(input, "description");
  const valueAddPoints = Math.min(15, countTerms(description, VALUE_ADD_TERMS) * 5);
  const dealAvailable = hasEvidence(input, "price_history") || hasEvidence(input, "listing_history");
  const dealPoints = calculateDealSignalPoints(price, facts.history);

  return Object.freeze({
    budget_fit: category(round(budgetScore), [budgetReason], ["listing_price"]),
    str_appeal: appealAvailable
      ? category(round(appealPoints), [reason("str_appeal_evidence", appealPoints > 0 ? "The listing includes guest-attraction signals." : "No guest-attraction signals were found in the available listing evidence.", ["description", "view_signals"])], ["description", "view_signals"])
      : category(null),
    amenities: amenityAvailable
      ? category(round(amenityPoints), [reason("amenity_evidence", amenityPoints > 0 ? "Existing amenities contribute to the opportunity." : "No amenities were identified in the available listing evidence.", ["amenities"])], ["amenities"])
      : category(null),
    value_add: valueAddAvailable
      ? category(round(valueAddPoints), [reason("value_add_evidence", valueAddPoints > 0 ? "The description contains potential improvement opportunities." : "No explicit improvement opportunity was identified.", ["description"])], ["description"])
      : category(null),
    deal_signals: dealAvailable
      ? category(dealPoints, [reason("deal_signal_evidence", dealPoints > 0 ? "Listing history shows a price reduction." : "No price reduction was found in the available history.", ["listing_history", "price_history"])], ["listing_history", "price_history"])
      : category(null),
  });
}

function calculateStrictViolations(input: AttentionEvaluationInput): readonly StrictLimitViolation[] {
  const price = input.facts.listingPriceUsd!;
  if (input.criteria.mode !== "strict" || price <= input.criteria.maximumPurchaseBudgetUsd) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    code: "purchase_price_above_maximum" as const,
    text: "The listing exceeds the strict maximum purchase budget.",
    observedValueUsd: price,
    limitValueUsd: input.criteria.maximumPurchaseBudgetUsd,
  })]);
}

function calculateRiskDeductions(input: AttentionEvaluationInput): readonly AttentionRiskDeduction[] {
  const price = input.facts.listingPriceUsd!;
  const maximum = input.criteria.maximumPurchaseBudgetUsd;
  const risks: AttentionRiskDeduction[] = [];
  if (price > maximum) {
    const overageRatio = maximum > 0 ? (price - maximum) / maximum : 1;
    const deduction = input.criteria.mode === "strict" ? 35 : round(Math.min(35, 35 * (overageRatio / 0.25)));
    risks.push(Object.freeze<AttentionRiskDeduction>({
      code: "price_above_limit",
      text: input.criteria.mode === "strict"
        ? "The price violates the strict purchase limit."
        : "The price is a flexible near-match and receives a proportional penalty.",
      deductionPoints: deduction,
      evidenceCodes: Object.freeze(["listing_price"] as AttentionEvidenceCode[]),
    }));
  }
  if (input.facts.propertyKind !== "existing_home") {
    risks.push(Object.freeze<AttentionRiskDeduction>({
      code: "property_type_mismatch",
      text: "The property is not classified as an existing home.",
      deductionPoints: 15,
      evidenceCodes: Object.freeze(["property_type"] as AttentionEvidenceCode[]),
    }));
  }
  return Object.freeze(risks);
}

function calculateConfidence(input: AttentionEvaluationInput): number {
  const { facts } = input;
  const checks: ReadonlyArray<readonly [number, boolean]> = [
    [25, validPositive(facts.listingPriceUsd)],
    [15, Boolean(facts.propertyType) && facts.propertyKind !== "unknown"],
    [15, Boolean(facts.location?.city && facts.location?.state)],
    [7, validNonnegative(facts.beds)],
    [7, validNonnegative(facts.baths)],
    [8, validPositive(facts.livingAreaSqft) || validPositive(facts.lotAreaSqft) || validPositive(facts.lotAreaAcres)],
    [6, Boolean(facts.description?.trim())],
    [5, facts.hasPrimaryImage && facts.photoUrls.length > 0],
    [4, hasEvidence(input, "amenities")],
    [3, hasEvidence(input, "view_signals")],
    [3, facts.history.length > 0],
    [2, facts.history.some((event) => event.eventType === "price_change")],
  ];
  return checks.reduce((score, [weight, present]) => score + (present ? weight : 0), 0);
}

function calculateDealSignalPoints(currentPrice: number, history: AttentionEvaluationInput["facts"]["history"]): number {
  const priorPrices = history.map((event) => event.priceUsd).filter((price): price is number => validPositive(price));
  const highestPrior = priorPrices.length ? Math.max(...priorPrices) : currentPrice;
  const reduction = highestPrior > currentPrice ? (highestPrior - currentPrice) / highestPrior : 0;
  if (reduction >= 0.05) return 10;
  if (reduction >= 0.02) return 7;
  if (reduction > 0) return 4;
  return 0;
}

function hasEvidence(input: AttentionEvaluationInput, code: AttentionEvidenceCode): boolean {
  return input.evidence.available.includes(code);
}

function countTerms(text: string, terms: readonly string[]): number {
  return terms.filter((term) => text.includes(term)).length;
}

function category(score: number | null, reasons: readonly AttentionReason[] = [], evidenceCodes: readonly AttentionEvidenceCode[] = []) {
  return Object.freeze({ score, reasons: Object.freeze([...reasons]), evidenceCodes: Object.freeze([...evidenceCodes]) });
}

function reason(code: AttentionReason["code"], text: string, evidenceCodes: readonly AttentionEvidenceCode[]): AttentionReason {
  return Object.freeze({ code, text, evidenceCodes: Object.freeze([...evidenceCodes]) });
}

function freezeResult(result: AttentionEvaluationResult): AttentionEvaluationResult {
  return Object.freeze(result);
}

function validPositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validNonnegative(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
