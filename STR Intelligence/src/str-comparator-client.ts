import type { ComparatorStatus, EvidenceConfidence } from "../shared/str-comparator.js";
import type { ComparatorRadiusMiles } from "../shared/str-comparator.js";

export type StrComparatorTargetDto = Readonly<{
  listingUrl: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  livingAreaSqft?: number;
  propertyType?: string;
  imageUrl?: string;
}>;

export type StrComparableDto = Readonly<{
  providerListingKey?: string;
  listingUrl: string;
  title?: string;
  imageUrl?: string;
  distanceMiles: number;
  propertyType?: string;
  roomType?: string;
  bedrooms?: number;
  bathrooms?: number;
  guestCapacity?: number;
  rating?: number;
  reviewCount?: number;
  isSuperhost?: boolean;
  amenities: readonly string[];
  observedNightlyPriceUsd?: number;
  observedCheckIn?: string;
  observedCheckOut?: string;
  adrLtmUsd?: number;
  occupancyLtmPercent?: number;
  annualRevenueLtmUsd?: number;
  marketCollectedAt?: string;
  similarityScore: number;
  matchReasons: readonly string[];
  observedAt?: string;
  included: boolean;
  estimatedAdrUsd?: number;
  rateMinimumUsd?: number;
  rateMaximumUsd?: number;
  rateObservationCount?: number;
  calendarUnavailablePercentage?: number;
  calendarUnavailableNights?: number;
  calendarObservationCount?: number;
  calendarWindows?: readonly CalendarWindowMetricDto[];
  calendarObservedAt?: string;
}>;

export type CalendarWindowDays = 15 | 30 | 45 | 60 | 90;
export type CalendarWindowMetricDto = Readonly<{
  days: CalendarWindowDays;
  unavailablePercentage: number;
  unavailableNights: number;
  observationCount: number;
}>;

export type StrComparatorMarketDto = Readonly<{
  estimatedAdrMedianUsd: number | null;
  estimatedAdrRangeUsd: Readonly<{ minimum: number; maximum: number }> | null;
  calendarUnavailableMedianPercentage: number | null;
  calendarUnavailableRangePercentage: Readonly<{ minimum: number; maximum: number }> | null;
}>;

export type StrComparisonDto = Readonly<{
  publicReference: string;
  radiusMiles?: ComparatorRadiusMiles;
  status: ComparatorStatus | string;
  stage: "discovery" | "calendar" | "complete" | string;
  completedAt?: string;
  cachedAt?: string;
  target: StrComparatorTargetDto;
  candidates: readonly StrComparableDto[];
  summary?: Readonly<{
    reasonText?: string;
    evidenceConfidence?: EvidenceConfidence;
    market?: StrComparatorMarketDto;
  }>;
}>;

export interface StrComparatorClient {
  discover(listingUrl: string, radiusMiles?: ComparatorRadiusMiles): Promise<StrComparisonDto>;
  analyze(publicReference: string, listingUrls: readonly string[]): Promise<StrComparisonDto>;
  updateSelections(publicReference: string, listingUrls: readonly string[]): Promise<StrComparisonDto>;
  refreshCalendar(publicReference: string, listingUrl: string): Promise<StrComparisonDto>;
}

type Fetcher = typeof fetch;

export async function discoverStrComparables(listingUrl: string, radiusMiles: ComparatorRadiusMiles = 1, fetcher: Fetcher = fetch): Promise<StrComparisonDto> {
  return requestComparison("/api/str-comparisons", {
    method: "POST",
    body: JSON.stringify({ listingUrl, radiusMiles }),
  }, fetcher, "Comparable discovery could not be completed.");
}

export async function loadSavedStrComparison(publicReference: string, fetcher: Fetcher = fetch): Promise<StrComparisonDto> {
  return requestComparison("/api/saved-str-comparison", {
    method: "POST",
    body: JSON.stringify({ reference: publicReference }),
  }, fetcher, "The saved comparison could not be loaded.");
}

export async function loadSavedStrComparisonLinks(listingUrls: readonly string[], fetcher: Fetcher = fetch): Promise<Readonly<Record<string, string>>> {
  const response = await fetcher("/api/str-comparison-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingUrls }) });
  const body = await response.json() as { comparisons?: unknown };
  if (!response.ok || !body.comparisons || typeof body.comparisons !== "object" || Array.isArray(body.comparisons)) return Object.freeze({});
  return Object.freeze(Object.fromEntries(Object.entries(body.comparisons as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")));
}

export async function analyzeStrComparableEvidence(
  publicReference: string,
  listingUrls: readonly string[],
  fetcher: Fetcher = fetch,
): Promise<StrComparisonDto> {
  return requestComparison(`/api/str-comparisons/${encodeURIComponent(publicReference)}/evidence`, {
    method: "POST",
    body: JSON.stringify({ listingUrls }),
  }, fetcher, "ADR and calendar analysis could not be completed.");
}

export async function updateStrComparableSelections(publicReference: string, listingUrls: readonly string[], fetcher: Fetcher = fetch): Promise<StrComparisonDto> {
  return requestComparison(`/api/str-comparisons/${encodeURIComponent(publicReference)}/selections`, { method: "PUT", body: JSON.stringify({ listingUrls }) }, fetcher, "Comparable selections could not be saved.");
}

export async function refreshStrComparableCalendar(publicReference: string, listingUrl: string, fetcher: Fetcher = fetch): Promise<StrComparisonDto> {
  return requestComparison("/api/refresh-str-calendar", { method: "POST", body: JSON.stringify({ reference: publicReference, listingUrl }) }, fetcher, "Fresh calendar data could not be loaded.");
}

export const strComparatorClient: StrComparatorClient = Object.freeze({
  discover: discoverStrComparables,
  analyze: analyzeStrComparableEvidence,
  updateSelections: updateStrComparableSelections,
  refreshCalendar: refreshStrComparableCalendar,
});

async function requestComparison(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
  fallbackMessage: string,
): Promise<StrComparisonDto> {
  const response = await fetcher(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const outcome = await response.json() as PublicComparisonResponse | ({ message?: string; comparison?: StrComparisonDto } & Partial<StrComparisonDto>);
  if (!response.ok) throw new Error(outcome.message ?? fallbackMessage);
  const comparison = "comparisonReference" in outcome
    ? normalizePublicComparison(outcome)
    : outcome.comparison ?? (outcome as StrComparisonDto);
  if (!comparison.publicReference || !comparison.target || !Array.isArray(comparison.candidates)) {
    throw new Error("The comparator returned an incomplete response.");
  }
  return comparison;
}

type PublicComparisonResponse = Readonly<{
  message?: string;
  status: string;
  comparisonReference: string;
  radiusMiles?: ComparatorRadiusMiles;
  lastCheckedAt?: string;
  target: StrComparatorTargetDto;
  summary?: StrComparisonDto["summary"];
  comparables: readonly Omit<StrComparableDto, "providerListingKey" | "observedAt">[];
}>;

function normalizePublicComparison(response: PublicComparisonResponse): StrComparisonDto {
  const hasEvidence = response.comparables.some((item) =>
    item.estimatedAdrUsd !== undefined || item.calendarUnavailablePercentage !== undefined,
  );
  return {
    publicReference: response.comparisonReference,
    radiusMiles: response.radiusMiles ?? 1,
    status: response.status,
    stage: hasEvidence ? "complete" : "discovery",
    completedAt: response.lastCheckedAt,
    target: response.target,
    candidates: response.comparables.map((item) => ({ ...item, providerListingKey: item.listingUrl })),
    ...(response.summary === undefined ? {} : { summary: response.summary }),
  };
}
