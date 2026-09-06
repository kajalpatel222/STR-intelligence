import type { StrComparisonRepositoryPort, StoredComparison } from "../str-comparator/repository.js";
import { initializeStrComparatorWorkflowState, type StrComparatorWorkflowState } from "../workflow/str-comparator-graph.js";

type GraphInvoker = Readonly<{ invoke(input: { workflowState: StrComparatorWorkflowState }): Promise<{ workflowState: StrComparatorWorkflowState }> }>;

export function createStrComparisonsHandler(graph: GraphInvoker, repository: StrComparisonRepositoryPort) {
  const inFlight = new Map<string, Promise<ReturnType<typeof response>>>();
  async function once(key: string, operation: () => Promise<ReturnType<typeof response>>) {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const pending = operation().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }
  return {
    async create(input: unknown, refresh = false) {
      const body = asRecord(input);
      if (!isZillowUrl(body.listingUrl)) return response(400, { status: "invalid", message: "Choose a valid Home listing." });
      return once(`discover:${body.listingUrl}`, async () => {
        const result = await graph.invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: crypto.randomUUID(), intent: "discover", listingUrl: body.listingUrl as string, bypassCache: refresh }) });
        if (!result.workflowState.comparisonReference) return response(503, { status: "unavailable", message: "Comparable stays are temporarily unavailable. Please try again." });
        return this.get(result.workflowState.comparisonReference);
      });
    },
    async get(reference: string) {
      if (!isUuid(reference)) return response(400, { status: "invalid", message: "The comparison reference is invalid." });
      const stored = await repository.loadComparison(reference);
      return stored ? response(200, toPublicComparison(stored)) : response(404, { status: "not_found", message: "This comparison is no longer available." });
    },
    async select(reference: string, input: unknown) {
      const body = asRecord(input);
      if (!isUuid(reference) || !Array.isArray(body.listingUrls) || body.listingUrls.length < 1 || body.listingUrls.length > 5 || !body.listingUrls.every(isAirbnbUrl)) return response(400, { status: "invalid", message: "Keep between one and five comparable stays included." });
      const stored = await repository.loadComparison(reference);
      const allowed = new Set(stored?.candidates.map((item) => item.listingUrl));
      if (!stored || !body.listingUrls.every((url) => allowed.has(url))) return response(400, { status: "invalid", message: "Choose comparable stays from this comparison." });
      await repository.updateSelections(reference, body.listingUrls);
      return this.get(reference);
    },
    async enrich(reference: string, input: unknown) {
      const body = asRecord(input);
      const stored = isUuid(reference) ? await repository.loadComparison(reference) : undefined;
      const urls = Array.isArray(body.listingUrls) ? body.listingUrls : stored?.candidates.filter((item) => item.included).map((item) => item.listingUrl);
      if (!stored || !urls || urls.length < 1 || urls.length > 5 || !urls.every(isAirbnbUrl)) return response(400, { status: "invalid", message: "Choose valid comparable stays before adding rate evidence." });
      const allowed = new Set(stored.candidates.map((item) => item.listingUrl));
      if (!urls.every((url) => allowed.has(url))) return response(400, { status: "invalid", message: "Choose comparable stays from this comparison." });
      await repository.updateSelections(reference, urls);
      return once(`evidence:${reference}:${[...urls].sort().join("|")}`, async () => {
        const result = await graph.invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: crypto.randomUUID(), intent: "enrich", listingUrl: stored.target.listingUrl, comparisonReference: reference, selectedListingUrls: urls }) });
        if (result.workflowState.status === "failed") return response(503, { status: "unavailable", message: "Rate and availability evidence is temporarily unavailable. Your comparable stays remain saved." });
        return this.get(reference);
      });
    },
    async refreshCalendar(input: unknown) {
      const body = asRecord(input);
      const reference = typeof body.reference === "string" ? body.reference : "";
      const listingUrl = typeof body.listingUrl === "string" ? body.listingUrl : "";
      const stored = isUuid(reference) ? await repository.loadComparison(reference) : undefined;
      if (!stored || !isAirbnbUrl(listingUrl) || !stored.candidates.some((item) => item.listingUrl === listingUrl)) {
        return response(400, { status: "invalid", message: "Choose a valid comparable stay to refresh." });
      }
      return once(`calendar:${reference}:${listingUrl}`, async () => {
        const result = await graph.invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: crypto.randomUUID(), intent: "enrich", listingUrl: stored.target.listingUrl, comparisonReference: reference, selectedListingUrls: [listingUrl] }) });
        if (result.workflowState.status === "failed") return response(503, { status: "unavailable", message: "Fresh calendar data is temporarily unavailable. Saved evidence remains available." });
        return this.get(reference);
      });
    },
  };
}

export function createStrComparisonLinksHandler(repository: Readonly<{
  findSavedComparisons(listingUrls: readonly string[]): Promise<Readonly<Record<string, string>>>;
}>) {
  return async (input: unknown) => {
    const body = asRecord(input);
    if (!Array.isArray(body.listingUrls) || body.listingUrls.length > 200 || !body.listingUrls.every(isZillowUrl)) {
      return response(400, { status: "invalid", message: "Choose valid Zillow properties." });
    }
    return response(200, { status: "available", comparisons: await repository.findSavedComparisons(body.listingUrls) });
  };
}

export function toPublicComparison(stored: StoredComparison) {
  return {
    status: stored.status,
    comparisonReference: stored.publicReference,
    lastCheckedAt: stored.completedAt,
    target: {
      listingUrl: stored.target.listingUrl,
      address: stored.target.address, city: stored.target.city, state: stored.target.state, postalCode: stored.target.postalCode,
      price: stored.target.price, bedrooms: stored.target.bedrooms, bathrooms: stored.target.bathrooms,
      livingAreaSqft: stored.target.livingAreaSqft, propertyType: stored.target.propertyType, imageUrl: stored.target.imageUrl,
    },
    summary: publicSummary(stored.summary),
    comparables: stored.candidates.map((item) => ({
      listingUrl: item.listingUrl, title: item.title, imageUrl: item.imageUrl, distanceMiles: item.distanceMiles,
      propertyType: item.propertyType, roomType: item.roomType, bedrooms: item.bedrooms, bathrooms: item.bathrooms,
      guestCapacity: item.guestCapacity, rating: item.rating, reviewCount: item.reviewCount, isSuperhost: item.isSuperhost,
      amenities: item.amenities.slice(0, 12), observedNightlyPriceUsd: item.observedNightlyPriceUsd,
      observedCheckIn: item.observedCheckIn, observedCheckOut: item.observedCheckOut, similarityScore: item.similarityScore,
      matchReasons: item.matchReasons, included: item.included, estimatedAdrUsd: item.estimatedAdrUsd,
      rateMinimumUsd: item.rateMinimumUsd, rateMaximumUsd: item.rateMaximumUsd,
      rateObservationCount: item.rateObservationCount, calendarUnavailablePercentage: item.calendarUnavailablePercentage,
      calendarUnavailableNights: item.calendarUnavailableNights, calendarObservationCount: item.calendarObservationCount,
      calendarWindows: item.calendarWindows,
      calendarObservedAt: item.calendarObservedAt,
    })),
  };
}

function publicSummary(value: unknown) {
  const summary = asRecord(value);
  const market = asRecord(summary.market);
  return {
    reasonText: typeof summary.reasonText === "string" ? summary.reasonText : undefined,
    evidenceConfidence: ["high", "medium", "low", "none"].includes(String(summary.evidenceConfidence)) ? summary.evidenceConfidence : undefined,
    market: {
      estimatedAdrMedianUsd: safeNumberOrNull(market.estimatedAdrMedianUsd),
      estimatedAdrRangeUsd: safeRange(market.estimatedAdrRangeUsd),
      calendarUnavailableMedianPercentage: safeNumberOrNull(market.calendarUnavailableMedianPercentage),
      calendarUnavailableRangePercentage: safeRange(market.calendarUnavailableRangePercentage),
    },
  };
}
function safeRange(value: unknown) { const record = asRecord(value); const minimum = safeNumberOrNull(record.minimum); const maximum = safeNumberOrNull(record.maximum); return minimum === null || maximum === null ? null : { minimum, maximum }; }
function safeNumberOrNull(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function isZillowUrl(value: unknown): value is string { return isHttpsHost(value, "zillow.com"); }
function isAirbnbUrl(value: unknown): value is string { return isHttpsHost(value, "airbnb.com"); }
function isHttpsHost(value: unknown, host: string) { if (typeof value !== "string" || value.length > 2048) return false; try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === host || url.hostname.endsWith(`.${host}`)); } catch { return false; } }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function response(statusCode: number, body: Record<string, unknown>) { return { statusCode, body } as const; }
