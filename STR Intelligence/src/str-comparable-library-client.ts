import type { StrComparableDto } from "./str-comparator-client.js";

export type StrComparableLibraryItem = Readonly<StrComparableDto & {
  associatedPropertyCount: number;
  associatedProperties: readonly string[];
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
    included: true,
    associatedPropertyCount: numberOr(item.associatedPropertyCount, 0),
    associatedProperties: Object.freeze(strings(item.associatedProperties)),
    firstObservedAt: textOr(item.firstObservedAt, ""),
    latestObservedAt: textOr(item.latestObservedAt, ""),
  } as StrComparableLibraryItem)];
}

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function textOr(value: unknown, fallback: string) { return typeof value === "string" ? value : fallback; }
function numberOr(value: unknown, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
