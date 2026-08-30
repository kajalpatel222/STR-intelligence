import {
  createInvestmentCriteriaSnapshot,
  type InvestmentCriteria,
} from "./investment-criteria.js";

export const ATTENTION_CATEGORY_CODES = [
  "budget_fit",
  "str_appeal",
  "amenities",
  "value_add",
  "deal_signals",
] as const;
export type AttentionCategoryCode = (typeof ATTENTION_CATEGORY_CODES)[number];

export type AttentionPropertyKind = "existing_home" | "land" | "other" | "unknown";

export type AttentionEvidenceCode =
  | "listing_price"
  | "property_type"
  | "location"
  | "beds"
  | "baths"
  | "living_area"
  | "lot_area"
  | "description"
  | "photos"
  | "amenities"
  | "view_signals"
  | "listing_history"
  | "price_history";

export type AttentionReasonCode =
  | "within_purchase_budget"
  | "below_purchase_budget"
  | "above_purchase_budget"
  | "missing_required_price"
  | "limited_property_evidence"
  | "str_appeal_evidence"
  | "amenity_evidence"
  | "value_add_evidence"
  | "deal_signal_evidence";

export type AttentionRiskCode =
  | "price_above_limit"
  | "price_below_limit"
  | "missing_required_evidence"
  | "property_type_mismatch"
  | "unknown_location_risk";

export type StrictLimitCode =
  | "purchase_price_below_minimum"
  | "purchase_price_above_maximum"
  | "improvement_reserve_above_maximum";

export type AttentionHistoryEvent = Readonly<{
  occurredAt: string;
  eventType: "listed" | "price_change" | "status_change" | "other";
  priceUsd?: number;
  description?: string;
}>;

export type AttentionPropertyFacts = Readonly<{
  listingPriceUsd?: number;
  propertyKind: AttentionPropertyKind;
  propertyType?: string;
  location?: Readonly<{
    address?: string;
    city?: string;
    county?: string;
    state?: string;
    postalCode?: string;
  }>;
  beds?: number;
  baths?: number;
  livingAreaSqft?: number;
  lotAreaSqft?: number;
  lotAreaAcres?: number;
  description?: string;
  photoUrls: readonly string[];
  hasPrimaryImage: boolean;
  amenities: readonly string[];
  viewSignals: readonly string[];
  history: readonly AttentionHistoryEvent[];
}>;

export type AttentionEvidenceAvailability = Readonly<{
  available: readonly AttentionEvidenceCode[];
  missing: readonly AttentionEvidenceCode[];
  completeness: "complete" | "partial" | "minimal";
}>;

export type AttentionEvaluationInput = Readonly<{
  criteria: InvestmentCriteria;
  facts: AttentionPropertyFacts;
  evidence: AttentionEvidenceAvailability;
}>;

export type AttentionReason = Readonly<{
  code: AttentionReasonCode;
  text: string;
  evidenceCodes: readonly AttentionEvidenceCode[];
}>;

export type AttentionRiskDeduction = Readonly<{
  code: AttentionRiskCode;
  text: string;
  deductionPoints: number | null;
  evidenceCodes: readonly AttentionEvidenceCode[];
}>;

export type StrictLimitViolation = Readonly<{
  code: StrictLimitCode;
  text: string;
  observedValueUsd: number;
  limitValueUsd: number;
}>;

export type AttentionCategoryBreakdown = Readonly<Record<AttentionCategoryCode, Readonly<{
  score: number | null;
  reasons: readonly AttentionReason[];
  evidenceCodes: readonly AttentionEvidenceCode[];
}>>>;

export type AttentionEvaluability =
  | Readonly<{ status: "evaluable" }>
  | Readonly<{ status: "unscorable"; code: "missing_or_nonpositive_price"; text: string }>;

export type AttentionEvaluationResult = Readonly<{
  attentionScore: number | null;
  confidenceScore: number | null;
  evaluability: AttentionEvaluability;
  categories: AttentionCategoryBreakdown;
  reasons: readonly AttentionReason[];
  riskDeductions: readonly AttentionRiskDeduction[];
  strictLimitViolations: readonly StrictLimitViolation[];
}>;

export function createAttentionEvaluationInput(input: AttentionEvaluationInput): AttentionEvaluationInput {
  // Snapshotting here prevents later workflow or adapter mutations from changing evaluation evidence in place.
  return Object.freeze({
    criteria: createInvestmentCriteriaSnapshot(input.criteria),
    facts: freezeFacts(input.facts),
    evidence: Object.freeze({
      available: Object.freeze([...input.evidence.available]),
      missing: Object.freeze([...input.evidence.missing]),
      completeness: input.evidence.completeness,
    }),
  });
}

export function initializeAttentionEvaluationResult(input: AttentionEvaluationInput): AttentionEvaluationResult {
  const price = input.facts.listingPriceUsd;
  const evaluability: AttentionEvaluability = typeof price === "number" && Number.isFinite(price) && price > 0
    ? Object.freeze({ status: "evaluable" })
    : Object.freeze({
        status: "unscorable",
        code: "missing_or_nonpositive_price",
        text: "A positive listing price is required before this property can be evaluated.",
      });

  return Object.freeze({
    attentionScore: null,
    confidenceScore: null,
    evaluability,
    categories: emptyCategories(),
    reasons: Object.freeze([]),
    riskDeductions: Object.freeze([]),
    strictLimitViolations: Object.freeze([]),
  });
}

function freezeFacts(facts: AttentionPropertyFacts): AttentionPropertyFacts {
  return Object.freeze({
    ...facts,
    location: facts.location ? Object.freeze({ ...facts.location }) : undefined,
    photoUrls: Object.freeze([...facts.photoUrls]),
    amenities: Object.freeze([...facts.amenities]),
    viewSignals: Object.freeze([...facts.viewSignals]),
    history: Object.freeze(facts.history.map((event) => Object.freeze({ ...event }))),
  });
}

function emptyCategories(): AttentionCategoryBreakdown {
  const category = () => Object.freeze({
    score: null,
    reasons: Object.freeze([]) as readonly AttentionReason[],
    evidenceCodes: Object.freeze([]) as readonly AttentionEvidenceCode[],
  });
  return Object.freeze({
    budget_fit: category(),
    str_appeal: category(),
    amenities: category(),
    value_add: category(),
    deal_signals: category(),
  });
}
