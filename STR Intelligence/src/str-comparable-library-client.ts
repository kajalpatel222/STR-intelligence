import type { StrComparableDto } from "./str-comparator-client.js";

export type StrComparableLibraryItem = Readonly<StrComparableDto & {
  comparisonReference: string;
  associatedPropertyCount: number;
  associatedProperties: readonly Readonly<{ listingUrl: string; address: string }>[];
  firstObservedAt: string;
  latestObservedAt: string;
}>;

export async function loadStrComparableLibrary(fetcher: typeof fetch = fetch): Promise<readonly StrComparableLibraryItem[]> {
  const response = await fetcher("/api/str-comparables", { headers: { Accept: "application/json" } });
  const body = await response.json() as { message?: string; comparables?: unknown };
  if (!response.ok) throw new Error(body.message ?? "The STR library could not be loaded.");
  if (!Array.isArray(body.comparables)) throw new Error("The STR library returned an incomplete response.");
  return Object.freeze(body.comparables.flatMap(normalizeLibraryItem));
}

function normalizeLibraryItem(value: unknown): readonly StrComparableLibraryItem[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (typeof item.listingUrl !== "string" || typeof item.observedNightlyPriceUsd !== "number") return [];
  return [Object.freeze({
    ...item,
    listingUrl: item.listingUrl,
    distanceMiles: numberOr(item.distanceMiles, Number.NaN),
    observedNightlyPriceUsd: item.observedNightlyPriceUsd,
    observedCheckIn: textOr(item.observedCheckIn, ""),
    observedCheckOut: textOr(item.observedCheckOut, ""),
    similarityScore: numberOr(item.similarityScore, 0),
    amenities: Object.freeze(strings(item.amenities)),
    matchReasons: Object.freeze(strings(item.matchReasons)),
    calendarWindows: Object.freeze(calendarWindows(item.calendarWindows)),
    included: true,
    comparisonReference: textOr(item.comparisonReference, ""),
    associatedPropertyCount: numberOr(item.associatedPropertyCount, 0),
    associatedProperties: Object.freeze(properties(item.associatedProperties)),
    firstObservedAt: textOr(item.firstObservedAt, ""),
    latestObservedAt: textOr(item.latestObservedAt, ""),
  } as StrComparableLibraryItem)];
}

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function calendarWindows(value: unknown) {
  if (!Array.isArray(value)) return [];
  const supported = new Set([15, 30, 45, 60, 90]);
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const metric = entry as Record<string, unknown>;
    return supported.has(metric.days as number) && [metric.unavailablePercentage, metric.unavailableNights, metric.observationCount].every((item) => typeof item === "number" && Number.isFinite(item))
      ? [{ days: metric.days, unavailablePercentage: metric.unavailablePercentage, unavailableNights: metric.unavailableNights, observationCount: metric.observationCount }]
      : [];
  });
}
function properties(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const property = entry as Record<string, unknown>;
    if (typeof property.listingUrl !== "string" || !property.listingUrl.startsWith("https://www.zillow.com/")) return [];
    if (typeof property.address !== "string" || !property.address.trim()) return [];
    return [{ listingUrl: property.listingUrl, address: property.address.trim() }];
  });
}
function textOr(value: unknown, fallback: string) { return typeof value === "string" ? value : fallback; }
function numberOr(value: unknown, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
