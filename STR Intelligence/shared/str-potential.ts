export const STR_POTENTIAL_LEVELS = ["strong", "moderate", "limited", "insufficient_evidence"] as const;
export type StrPotentialLevel = (typeof STR_POTENTIAL_LEVELS)[number];

export const STR_EVIDENCE_KINDS = ["property_fact", "listing_text", "photo", "comparable"] as const;
export type StrEvidenceKind = (typeof STR_EVIDENCE_KINDS)[number];

export type StrEvidenceReference = Readonly<{
  code: string;
  kind: StrEvidenceKind;
  label: string;
  imageIndex?: number;
}>;

export type StrPotentialPropertyFacts = Readonly<{
  listingUrl: string;
  title: string;
  address?: string;
  location?: string;
  propertyType?: string;
  priceUsd?: number;
  beds?: number;
  baths?: number;
  livingAreaSqft?: number;
  lotSqft?: number;
  lotAcres?: number;
  description?: string;
  amenities: readonly string[];
}>;

export type StrPotentialImage = Readonly<{
  url: string;
  index: number;
  alt: string;
}>;

export type StrPotentialEvidence = Readonly<{
  property: StrPotentialPropertyFacts;
  images: readonly StrPotentialImage[];
  improvementReserveUsd: number;
  comparableCharacteristics: readonly string[];
  observedAt: string;
}>;

export type StrPotentialFinding = Readonly<{
  code: string;
  title: string;
  explanation: string;
  evidence: readonly StrEvidenceReference[];
}>;

export type StrImprovementRecommendation = Readonly<{
  code: string;
  title: string;
  rationale: string;
  priority: "essential" | "recommended" | "optional";
  estimatedCostLowUsd: number;
  estimatedCostHighUsd: number;
  expectedGuestImpact: "high" | "medium" | "low";
  requiresProfessionalReview: boolean;
  evidence: readonly StrEvidenceReference[];
}>;

export type StrImprovementBudgetSummary = Readonly<{
  estimatedCostLowUsd: number;
  estimatedCostHighUsd: number;
  improvementReserveUsd: number;
  reserveGapLowUsd: number;
  reserveGapHighUsd: number;
}>;

export type StrPotentialEvaluation = Readonly<{
  status: "completed" | "insufficient_evidence";
  potential: StrPotentialLevel;
  summary: string;
  confidence: "high" | "moderate" | "low";
  confidenceExplanation: string;
  strengths: readonly StrPotentialFinding[];
  risks: readonly StrPotentialFinding[];
  missingEvidence: readonly string[];
  recommendations: readonly StrImprovementRecommendation[];
  budget: StrImprovementBudgetSummary;
  evaluatedAt: string;
  model: Readonly<{ provider: string; model: string; promptVersion: string }>;
}>;

export type SavedStrPotentialEvaluation = Readonly<{
  property: StrPotentialPropertyFacts;
  evaluation: StrPotentialEvaluation;
  savedAt: string;
  isFresh: boolean;
}>;

export function calculateImprovementBudget(
  recommendations: readonly StrImprovementRecommendation[],
  improvementReserveUsd: number,
): StrImprovementBudgetSummary {
  const estimatedCostLowUsd = recommendations.reduce((total, item) => total + item.estimatedCostLowUsd, 0);
  const estimatedCostHighUsd = recommendations.reduce((total, item) => total + item.estimatedCostHighUsd, 0);
  return Object.freeze({
    estimatedCostLowUsd,
    estimatedCostHighUsd,
    improvementReserveUsd,
    reserveGapLowUsd: Math.max(estimatedCostLowUsd - improvementReserveUsd, 0),
    reserveGapHighUsd: Math.max(estimatedCostHighUsd - improvementReserveUsd, 0),
  });
}

export function createStrPotentialEvidence(input: StrPotentialEvidence): StrPotentialEvidence {
  return deepFreezeCopy({
    ...input,
    property: { ...input.property, amenities: [...input.property.amenities] },
    images: input.images.map((item) => ({ ...item })),
    comparableCharacteristics: [...input.comparableCharacteristics],
  });
}

function deepFreezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): unknown => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return item;
    for (const child of Object.values(item)) freeze(child);
    return Object.freeze(item);
  };
  return freeze(copy) as T;
}
