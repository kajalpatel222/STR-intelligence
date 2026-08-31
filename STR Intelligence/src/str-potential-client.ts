import {
  STR_EVIDENCE_KINDS,
  STR_POTENTIAL_LEVELS,
  calculateImprovementBudget,
  type StrEvidenceReference,
  type StrImprovementRecommendation,
  type StrPotentialFinding,
} from "../shared/str-potential";

export type PublicStrPotentialProperty = Readonly<{
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
}>;

export type PublicStrPotentialEvaluation = Readonly<{
  status: "completed" | "insufficient_evidence";
  property: PublicStrPotentialProperty;
  evaluation: Readonly<{
    potential: (typeof STR_POTENTIAL_LEVELS)[number];
    summary: string;
    confidence: "high" | "moderate" | "low";
    confidenceExplanation: string;
    strengths: readonly StrPotentialFinding[];
    risks: readonly StrPotentialFinding[];
    missingEvidence: readonly string[];
    recommendations: readonly StrImprovementRecommendation[];
    budget: ReturnType<typeof calculateImprovementBudget>;
    evaluatedAt: string;
  }>;
  savedAt: string;
}>;

export async function requestStrPotential(
  listingUrl: string,
  options: Readonly<{ refresh?: boolean; fetcher?: typeof fetch }> = {},
): Promise<PublicStrPotentialEvaluation> {
  const response = await (options.fetcher ?? fetch)("/api/str-potential", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingUrl, ...(options.refresh ? { refresh: true } : {}) }),
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(publicError(payload));
  return parsePublicStrPotential(payload);
}

export function parsePublicStrPotential(value: unknown): PublicStrPotentialEvaluation {
  const root = object(value, "response");
  keys(root, ["status", "property", "evaluation", "savedAt"], "response");
  const property = parseProperty(root.property);
  const evaluation = object(root.evaluation, "evaluation");
  keys(evaluation, ["potential", "summary", "confidence", "confidenceExplanation", "strengths", "risks", "missingEvidence", "recommendations", "budget", "evaluatedAt"], "evaluation");
  const status = enumValue(root.status, ["completed", "insufficient_evidence"] as const, "status");
  const recommendations = array(evaluation.recommendations, "recommendations").map(parseRecommendation);
  const budget = object(evaluation.budget, "budget");
  keys(budget, ["estimatedCostLowUsd", "estimatedCostHighUsd", "improvementReserveUsd", "reserveGapLowUsd", "reserveGapHighUsd"], "budget");
  const reserve = nonNegativeNumber(budget.improvementReserveUsd, "improvement reserve");
  const parsed = {
    status,
    property,
    evaluation: {
      potential: enumValue(evaluation.potential, STR_POTENTIAL_LEVELS, "potential"),
      summary: text(evaluation.summary, "summary"),
      confidence: enumValue(evaluation.confidence, ["high", "moderate", "low"] as const, "confidence"),
      confidenceExplanation: text(evaluation.confidenceExplanation, "confidence explanation"),
      strengths: array(evaluation.strengths, "strengths").map(parseFinding),
      risks: array(evaluation.risks, "risks").map(parseFinding),
      missingEvidence: array(evaluation.missingEvidence, "missing evidence").map((item) => text(item, "missing evidence item")),
      recommendations,
      budget: calculateImprovementBudget(recommendations, reserve),
      evaluatedAt: isoDate(evaluation.evaluatedAt, "evaluation date"),
    },
    savedAt: isoDate(root.savedAt, "saved date"),
  } satisfies PublicStrPotentialEvaluation;
  return deepFreeze(parsed);
}

function parseProperty(value: unknown): PublicStrPotentialProperty {
  const item = object(value, "property");
  keys(item, ["listingUrl", "title", "address", "location", "propertyType", "priceUsd", "beds", "baths", "livingAreaSqft", "lotSqft", "lotAcres"], "property");
  const listingUrl = text(item.listingUrl, "listing URL");
  const url = new URL(listingUrl);
  if (url.protocol !== "https:" || !(url.hostname === "zillow.com" || url.hostname.endsWith(".zillow.com"))) throw new Error("Invalid listing URL");
  return compact({
    listingUrl,
    title: text(item.title, "property title"),
    address: optionalText(item.address, "address"),
    location: optionalText(item.location, "location"),
    propertyType: optionalText(item.propertyType, "property type"),
    priceUsd: optionalNonNegative(item.priceUsd, "price"),
    beds: optionalNonNegative(item.beds, "beds"),
    baths: optionalNonNegative(item.baths, "baths"),
    livingAreaSqft: optionalNonNegative(item.livingAreaSqft, "living area"),
    lotSqft: optionalNonNegative(item.lotSqft, "lot area"),
    lotAcres: optionalNonNegative(item.lotAcres, "lot acres"),
  });
}

function parseFinding(value: unknown): StrPotentialFinding {
  const item = object(value, "finding");
  keys(item, ["code", "title", "explanation", "evidence"], "finding");
  return { code: text(item.code, "finding code"), title: text(item.title, "finding title"), explanation: text(item.explanation, "finding explanation"), evidence: array(item.evidence, "finding evidence").map(parseEvidence) };
}

function parseRecommendation(value: unknown): StrImprovementRecommendation {
  const item = object(value, "recommendation");
  keys(item, ["code", "title", "rationale", "priority", "estimatedCostLowUsd", "estimatedCostHighUsd", "expectedGuestImpact", "requiresProfessionalReview", "evidence"], "recommendation");
  const low = nonNegativeNumber(item.estimatedCostLowUsd, "low cost");
  const high = nonNegativeNumber(item.estimatedCostHighUsd, "high cost");
  if (low > high) throw new Error("Invalid recommendation cost range");
  if (typeof item.requiresProfessionalReview !== "boolean") throw new Error("Invalid professional review value");
  return {
    code: text(item.code, "recommendation code"), title: text(item.title, "recommendation title"), rationale: text(item.rationale, "recommendation rationale"),
    priority: enumValue(item.priority, ["essential", "recommended", "optional"] as const, "priority"),
    estimatedCostLowUsd: low, estimatedCostHighUsd: high,
    expectedGuestImpact: enumValue(item.expectedGuestImpact, ["high", "medium", "low"] as const, "guest impact"),
    requiresProfessionalReview: item.requiresProfessionalReview,
    evidence: array(item.evidence, "recommendation evidence").map(parseEvidence),
  };
}

function parseEvidence(value: unknown): StrEvidenceReference {
  const item = object(value, "evidence");
  keys(item, ["code", "kind", "label", "imageIndex"], "evidence");
  return compact({ code: text(item.code, "evidence code"), kind: enumValue(item.kind, STR_EVIDENCE_KINDS, "evidence kind"), label: text(item.label, "evidence label"), imageIndex: optionalNonNegative(item.imageIndex, "image index") });
}

function publicError(value: unknown) { const item = value && typeof value === "object" ? value as Record<string, unknown> : {}; return typeof item.message === "string" && item.message.trim() ? item.message : "STR potential could not be evaluated right now. Please try again."; }
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}`); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: readonly string[], label: string) { if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`Invalid ${label}`); }
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`Invalid ${label}`); return value; }
function text(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${label}`); return value.trim(); }
function optionalText(value: unknown, label: string) { return value === undefined || value === null ? undefined : text(value, label); }
function nonNegativeNumber(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}`); return value; }
function optionalNonNegative(value: unknown, label: string) { return value === undefined || value === null ? undefined : nonNegativeNumber(value, label); }
function isoDate(value: unknown, label: string): string { const result = text(value, label); if (Number.isNaN(Date.parse(result))) throw new Error(`Invalid ${label}`); return result; }
function enumValue<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] { if (typeof value !== "string" || !values.includes(value)) throw new Error(`Invalid ${label}`); return value as T[number]; }
function compact<T extends Record<string, unknown>>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
