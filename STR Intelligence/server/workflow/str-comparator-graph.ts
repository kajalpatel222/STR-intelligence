import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { calculateComparatorSummary, type ComparatorCandidate, type ComparatorSummary } from "../../shared/str-comparator.js";
import { haversineDistanceKm, rankComparableCandidates } from "../../shared/str-comparator-ranking.js";
import type { StrComparatorProvider, DiscoveredListing, ListingCalendar, ProviderBatch } from "../sources/str-comparator/provider.js";
import type { ComparatorTargetRecord, PersistedComparable, PersistedEvidence, StrComparisonRepositoryPort, ComparisonCacheLookup } from "../str-comparator/repository.js";
import { createComparatorTools } from "../str-comparator/tools.js";

export type StrComparatorIntent = "discover" | "enrich";
export type StrComparatorWorkflowStatus = "initialized" | "collecting" | "persisting" | "completed" | "partial" | "failed";

export type StrComparatorWorkflowState = Readonly<{
  workflowId: string;
  intent: StrComparatorIntent;
  listingUrl: string;
  bypassCache: boolean;
  comparisonReference?: string;
  selectedListingUrls: readonly string[];
  target?: ComparatorTargetRecord;
  runId?: string;
  candidates: readonly PersistedComparable[];
  summary?: ComparatorSummary;
  status: StrComparatorWorkflowStatus;
  cacheStatus?: ComparisonCacheLookup["status"];
  dataOrigin?: "fresh_cache" | "provider" | "saved_fallback";
  failureCode?: "unsupported_property" | "provider_unavailable" | "insufficient_candidates" | "persistence_failed";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}>;

const ComparatorGraphState = Annotation.Root({
  workflowState: Annotation<StrComparatorWorkflowState>(),
  cacheLookup: Annotation<ComparisonCacheLookup | undefined>(),
  providerBatch: Annotation<ProviderBatch<DiscoveredListing> | undefined>(),
  providerFailed: Annotation<boolean | undefined>(),
});

export function initializeStrComparatorWorkflowState(params: {
  workflowId: string;
  intent: StrComparatorIntent;
  listingUrl: string;
  comparisonReference?: string;
  selectedListingUrls?: readonly string[];
  bypassCache?: boolean;
  now?: string;
}): StrComparatorWorkflowState {
  const now = params.now ?? new Date().toISOString();
  return Object.freeze({ workflowId: params.workflowId, intent: params.intent, listingUrl: params.listingUrl, bypassCache: params.bypassCache ?? false,
    comparisonReference: params.comparisonReference, selectedListingUrls: Object.freeze([...(params.selectedListingUrls ?? [])]),
    candidates: Object.freeze([]), status: "initialized", createdAt: now, updatedAt: now });
}

export function createStrComparatorGraph(dependencies: { provider: StrComparatorProvider; repository: StrComparisonRepositoryPort }) {
  const tools = createComparatorTools(dependencies);
  const resolveTarget = async ({ workflowState }: typeof ComparatorGraphState.State) => {
    try {
      const target = await dependencies.repository.resolveTarget(workflowState.listingUrl);
      if (!target) return { workflowState: finishFailure(workflowState, "unsupported_property") };
      return { workflowState: Object.freeze({ ...workflowState, target, status: "collecting" as const }) };
    } catch {
      return { workflowState: finishFailure(workflowState, "persistence_failed") };
    }
  };
  const lookupCache = async ({ workflowState }: typeof ComparatorGraphState.State) => {
    const cacheLookup = await tools.lookupComparisonCache.invoke({ canonicalPropertyId: workflowState.target!.canonicalPropertyId });
    return { cacheLookup, workflowState: Object.freeze({ ...workflowState, cacheStatus: cacheLookup.status }) };
  };
  const useFreshCache = ({ workflowState, cacheLookup }: typeof ComparatorGraphState.State) => ({
    workflowState: finish({ ...workflowState, comparisonReference: cacheLookup?.status === "fresh" ? cacheLookup.publicReference : undefined, status: "completed", dataOrigin: "fresh_cache" }),
  });
  const collectProvider = async ({ workflowState }: typeof ComparatorGraphState.State) => {
    const dates = representativeStayDates(new Date());
    try {
      const providerBatch = await tools.discoverNearbyStays.invoke({ location: [workflowState.target?.city, workflowState.target?.state].filter(Boolean).join(", "), limit: 15, currency: "USD", locale: "en-US", checkIn: dates.checkIn, checkOut: dates.checkOut });
      return { providerBatch, providerFailed: providerBatch.records.length === 0 && providerBatch.errors.length > 0 };
    } catch {
      return { providerFailed: true };
    }
  };
  const persistProviderResult = async ({ workflowState, providerBatch, cacheLookup }: typeof ComparatorGraphState.State) => {
    const result = await persistDiscoveredComparables(workflowState, providerBatch!, dependencies);
    const providerProducedNoUsableResult = result.failureCode === "provider_unavailable" || result.failureCode === "insufficient_candidates";
    return { workflowState: providerProducedNoUsableResult && cacheLookup && cacheLookup.status !== "missing"
      ? finish({ ...workflowState, comparisonReference: cacheLookup.publicReference, status: "partial", dataOrigin: "saved_fallback" })
      : result };
  };
  const useStaleCache = ({ workflowState, cacheLookup }: typeof ComparatorGraphState.State) => ({
    workflowState: finish({ ...workflowState, comparisonReference: cacheLookup && cacheLookup.status !== "missing" ? cacheLookup.publicReference : undefined, status: "partial", dataOrigin: "saved_fallback" }),
  });
  const providerUnavailable = ({ workflowState }: typeof ComparatorGraphState.State) => ({ workflowState: finishFailure(workflowState, "provider_unavailable") });
  const enrich = async ({ workflowState }: typeof ComparatorGraphState.State) => ({ workflowState: await enrichComparables(workflowState, dependencies) });

  // Conditional edges make the retrieval-first policy inspectable; no model chooses or executes these tools.
  return new StateGraph(ComparatorGraphState)
    .addNode("resolve_target", resolveTarget)
    .addNode("lookup_cache", lookupCache)
    .addNode("use_fresh_cache", useFreshCache)
    .addNode("collect_provider", collectProvider)
    .addNode("persist_provider_result", persistProviderResult)
    .addNode("use_stale_cache", useStaleCache)
    .addNode("provider_unavailable", providerUnavailable)
    .addNode("enrich_comparables", enrich)
    .addConditionalEdges(START, ({ workflowState }) => workflowState.intent === "discover" ? "discover" : "enrich", { discover: "resolve_target", enrich: "enrich_comparables" })
    .addConditionalEdges("resolve_target", ({ workflowState }) => workflowState.failureCode ? "stop" : "lookup", { stop: END, lookup: "lookup_cache" })
    .addConditionalEdges("lookup_cache", ({ workflowState, cacheLookup }) => cacheLookup?.status === "fresh" && !workflowState.bypassCache ? "cached" : "provider", { cached: "use_fresh_cache", provider: "collect_provider" })
    .addConditionalEdges("collect_provider", ({ cacheLookup, providerFailed }) => !providerFailed ? "persist" : cacheLookup && cacheLookup.status !== "missing" ? "stale" : "unavailable", { persist: "persist_provider_result", stale: "use_stale_cache", unavailable: "provider_unavailable" })
    .addEdge("use_fresh_cache", END)
    .addEdge("persist_provider_result", END)
    .addEdge("use_stale_cache", END)
    .addEdge("provider_unavailable", END)
    .addEdge("enrich_comparables", END)
    .compile();
}

async function persistDiscoveredComparables(state: StrComparatorWorkflowState, batch: ProviderBatch<DiscoveredListing>, dependencies: { provider: StrComparatorProvider; repository: StrComparisonRepositoryPort }): Promise<StrComparatorWorkflowState> {
  try {
    const target = state.target!;
    const dates = representativeStayDates(new Date());
    const normalized = batch.records.flatMap((record) => toPersistedCandidate(record, target, dates, dependencies.provider.rawPayload?.(record as object)));
    const comparatorCandidates = normalized.map((candidate) => toComparatorCandidate(candidate));
    const ranked = rankComparableCandidates(toComparatorTarget(target), comparatorCandidates, 5);
    const byKey = new Map(normalized.map((item) => [item.providerListingKey, item]));
    const selected = Object.freeze(ranked.flatMap((item) => {
      const persisted = byKey.get(item.candidate.id);
      return persisted ? [Object.freeze({ ...persisted, distanceMiles: round(item.distanceKm * 0.621371, 2), similarityScore: round(item.similarityScore * 100, 2), matchReasons: Object.freeze(matchReasons(target, persisted)) })] : [];
    }));
    if (!selected.length) return finishFailure({ ...state, target }, batch.errors.length ? "provider_unavailable" : "insufficient_candidates");

    const publicReference = crypto.randomUUID();
    const requestSnapshot = { location: [target.city, target.state].filter(Boolean).join(", "), candidateLimit: 15, selectedLimit: 5, observedCheckIn: dates.checkIn, observedCheckOut: dates.checkOut };
    const runId = await dependencies.repository.createRun({ target, publicReference, cacheKey: `${target.listingSnapshotId}:v1:${dates.checkIn}`, request: requestSnapshot });
    const summary = calculateComparatorSummary({ target: toComparatorTarget(target), candidates: selected.map((candidate) => toComparatorCandidate(candidate)) });
    await dependencies.repository.saveDiscovery(runId, selected, summary);
    return finish({ ...state, target, runId, comparisonReference: publicReference, candidates: selected, summary, status: batch.errors.length ? "partial" : "completed", dataOrigin: "provider" });
  } catch {
    return finishFailure(state, "persistence_failed");
  }
}

async function enrichComparables(state: StrComparatorWorkflowState, dependencies: { provider: StrComparatorProvider; repository: StrComparisonRepositoryPort }): Promise<StrComparatorWorkflowState> {
  try {
    if (!state.comparisonReference) return finishFailure(state, "unsupported_property");
    const stored = await dependencies.repository.loadComparison(state.comparisonReference);
    if (!stored) return finishFailure(state, "unsupported_property");
    const selectedUrls = new Set(state.selectedListingUrls.length ? state.selectedListingUrls : stored.candidates.filter((item) => item.included).map((item) => item.listingUrl));
    if (!selectedUrls.size || selectedUrls.size > 5) return finishFailure(state, "unsupported_property");
    const selected = stored.candidates.filter((item) => selectedUrls.has(item.listingUrl)).slice(0, 5);
    const batch = await dependencies.provider.collectCalendars({ listings: selected.map((item) => ({ listingId: item.providerListingKey, url: item.listingUrl })), months: 12, currency: "USD", locale: "en-US" });
    const evidence = batch.records.flatMap((record) => toPersistedEvidence(record, dependencies.provider.rawPayload?.(record as object)));
    const calendarByKey = new Map(batch.records.map((item) => [item.listingId, item]));
    const summary = calculateComparatorSummary({ target: toComparatorTarget(stored.target), candidates: selected.map((item) => toComparatorCandidate(item, calendarByKey.get(item.providerListingKey))) });
    await dependencies.repository.saveEvidence(await internalRunId(dependencies.repository, state.comparisonReference), evidence, summary);
    return finish({ ...state, target: stored.target, candidates: selected, summary, status: batch.errors.length ? "partial" : "completed" });
  } catch {
    return finishFailure(state, "persistence_failed");
  }
}

// Repository implementations keep run IDs private; the production repository exposes this narrow internal lookup.
async function internalRunId(repository: StrComparisonRepositoryPort, reference: string) {
  const value = (repository as StrComparisonRepositoryPort & { resolveRunId?(reference: string): Promise<string> }).resolveRunId;
  if (!value) throw new Error("Comparison repository cannot resolve its private run.");
  return value.call(repository, reference);
}

function toPersistedCandidate(record: DiscoveredListing, target: ComparatorTargetRecord, dates: { checkIn: string; checkOut: string }, rawPayload?: unknown): readonly PersistedComparable[] {
  const entireHome = /entire|whole/i.test(record.roomType ?? "");
  if (!entireHome || !record.listingId || !record.url || !positive(record.nightlyRate) || !coordinate(record.latitude, -90, 90) || !coordinate(record.longitude, -180, 180)) return [];
  const bedrooms = nonNegative(record.bedrooms) ? record.bedrooms : undefined;
  const bathrooms = nonNegative(record.bathrooms) ? record.bathrooms : undefined;
  const guestCapacity = positive(record.maxGuests) ? record.maxGuests : undefined;
  if (bedrooms === undefined || bathrooms === undefined || guestCapacity === undefined) return [];
  return [Object.freeze({ providerListingKey: record.listingId, listingUrl: record.url, title: record.title, imageUrl: record.imageUrl,
    latitude: record.latitude!, longitude: record.longitude!, distanceMiles: round(haversineDistanceKm(toComparatorTarget(target).coordinates, { latitude: record.latitude!, longitude: record.longitude! }) * .621371, 2),
    propertyType: record.propertyType, roomType: record.roomType, bedrooms, bathrooms, guestCapacity, rating: record.rating, reviewCount: record.reviewCount,
    isSuperhost: record.isSuperhost, amenities: Object.freeze([...(record.amenities ?? [])]), observedNightlyPriceUsd: record.nightlyRate!, observedCheckIn: dates.checkIn, observedCheckOut: dates.checkOut,
    similarityScore: 0, matchReasons: Object.freeze([]), observedAt: record.scrapedAt ?? new Date().toISOString(), rawPayload: rawPayload ?? {}, })];
}
function toComparatorTarget(target: ComparatorTargetRecord) { const bedrooms = target.bedrooms ?? 1; return { coordinates: { latitude: target.latitude, longitude: target.longitude }, bedrooms, bathrooms: target.bathrooms ?? 1, accommodates: Math.max(2, bedrooms * 2) }; }
function toComparatorCandidate(candidate: PersistedComparable, calendar?: ListingCalendar): ComparatorCandidate { const days = calendar ? normalizedCalendarDays(calendar) : undefined; return { id: candidate.providerListingKey, name: candidate.title, entireHome: true, coordinates: { latitude: candidate.latitude, longitude: candidate.longitude }, bedrooms: candidate.bedrooms!, bathrooms: candidate.bathrooms!, accommodates: candidate.guestCapacity!, advertisedNightlyRateUsd: candidate.observedNightlyPriceUsd, rateObservations: days?.flatMap((day) => positive(day.nightlyRate) ? [{ date: day.date, nightlyRateUsd: day.nightlyRate! }] : []), calendarObservations: days?.slice(0, 90).map((day) => ({ date: day.date, availability: day.available ? "available" as const : "unavailable" as const })) }; }
export function toPersistedEvidence(calendar: ListingCalendar, rawPayload?: unknown): readonly PersistedEvidence[] { const observedAt = calendar.scrapedAt ?? new Date().toISOString(); const firstFutureDate = observedAt.slice(0, 10); const valid = normalizedCalendarDays(calendar); if (!valid.length) return []; const calendarWindow = valid.filter((day) => day.date >= firstFutureDate).slice(0, 90); if (!calendarWindow.length) return []; const available = calendarWindow.filter((day) => day.available).length; const unavailable = calendarWindow.length - available; return [Object.freeze({ providerListingKey: calendar.listingId, rates: Object.freeze(valid.flatMap((day) => positive(day.nightlyRate) ? [{ date: day.date, nightlyRateUsd: day.nightlyRate!, rawEvidence: day }] : [])), calendar: Object.freeze({ windowStart: calendarWindow[0]!.date, windowEnd: calendarWindow[calendarWindow.length - 1]!.date, availableNights: available, unavailableNights: unavailable, unknownNights: 0, unavailabilityRate: unavailable / calendarWindow.length, dailyObservations: calendarWindow, rawEvidence: rawPayload }), observedAt })]; }
function normalizedCalendarDays(calendar: ListingCalendar) { const byDate = new Map<string, ListingCalendar["days"][number]>(); for (const day of calendar.days) if (/^\d{4}-\d{2}-\d{2}$/.test(day.date) && !Number.isNaN(Date.parse(`${day.date}T00:00:00Z`))) byDate.set(day.date, day); return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)); }
function matchReasons(target: ComparatorTargetRecord, candidate: PersistedComparable) { const reasons: string[] = []; if (target.bedrooms === candidate.bedrooms) reasons.push("Same bedroom count"); if (target.bathrooms === candidate.bathrooms) reasons.push("Same bathroom count"); if (candidate.distanceMiles <= 10) reasons.push("Nearby location"); return reasons.length ? reasons : ["Closest overall property match"]; }
function representativeStayDates(now: Date) { const checkIn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14)); const day = checkIn.getUTCDay(); checkIn.setUTCDate(checkIn.getUTCDate() + ((5 - day + 7) % 7)); const checkOut = new Date(checkIn); checkOut.setUTCDate(checkOut.getUTCDate() + 2); return { checkIn: checkIn.toISOString().slice(0, 10), checkOut: checkOut.toISOString().slice(0, 10) }; }
function finish(state: StrComparatorWorkflowState): StrComparatorWorkflowState { return Object.freeze({ ...state, selectedListingUrls: Object.freeze([...state.selectedListingUrls]), candidates: Object.freeze([...state.candidates]), updatedAt: new Date().toISOString(), completedAt: new Date().toISOString() }); }
function finishFailure(state: StrComparatorWorkflowState, failureCode: StrComparatorWorkflowState["failureCode"]): StrComparatorWorkflowState { return finish({ ...state, status: "failed", failureCode }); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function coordinate(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
function round(value: number, places: number) { const factor = 10 ** places; return Math.round(value * factor) / factor; }
