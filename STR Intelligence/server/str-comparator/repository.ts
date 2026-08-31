import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";
import { haversineDistanceKm } from "../../shared/str-comparator-ranking.js";

export type ComparatorTargetRecord = Readonly<{
  canonicalPropertyId: string;
  listingSnapshotId: string;
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
  latitude: number;
  longitude: number;
  imageUrl?: string;
}>;

export type PersistedComparable = Readonly<{
  providerListingKey: string;
  listingUrl: string;
  title?: string;
  imageUrl?: string;
  latitude: number;
  longitude: number;
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
  observedNightlyPriceUsd: number;
  observedCheckIn: string;
  observedCheckOut: string;
  similarityScore: number;
  matchReasons: readonly string[];
  observedAt: string;
  rawPayload: unknown;
}>;

export type PersistedEvidence = Readonly<{
  providerListingKey: string;
  rates: readonly Readonly<{ date: string; nightlyRateUsd: number; rawEvidence?: unknown }>[];
  calendar: Readonly<{
    windowStart: string;
    windowEnd: string;
    availableNights: number;
    unavailableNights: number;
    unknownNights: number;
    unavailabilityRate?: number;
    dailyObservations: unknown;
    rawEvidence?: unknown;
  }>;
  observedAt: string;
}>;

export type ComparisonCacheLookup =
  | Readonly<{ status: "missing" }>
  | Readonly<{
      status: "fresh" | "stale";
      publicReference: string;
      completedAt?: string;
      expiresAt: string;
    }>;

export interface StrComparisonRepositoryPort {
  resolveTarget(listingUrl: string): Promise<ComparatorTargetRecord | undefined>;
  findComparisonCache(canonicalPropertyId: string, now?: Date): Promise<ComparisonCacheLookup>;
  createRun(params: { target: ComparatorTargetRecord; publicReference: string; cacheKey: string; request: unknown }): Promise<string>;
  resolveRunId(publicReference: string): Promise<string>;
  saveDiscovery(runId: string, candidates: readonly PersistedComparable[], summary: unknown): Promise<void>;
  saveEvidence(runId: string, evidence: readonly PersistedEvidence[], summary: unknown): Promise<void>;
  updateSelections(publicReference: string, listingUrls: readonly string[]): Promise<void>;
  loadComparison(publicReference: string): Promise<StoredComparison | undefined>;
}

export type StoredComparableLibraryItem = Readonly<{
  comparable: StoredComparison["candidates"][number];
  associatedPropertyCount: number;
  associatedProperties: readonly string[];
  firstObservedAt: string;
  latestObservedAt: string;
}>;

export type StoredComparison = Readonly<{
  publicReference: string;
  status: string;
  stage: string;
  completedAt?: string;
  target: ComparatorTargetRecord;
  summary?: unknown;
  candidates: readonly (PersistedComparable & Readonly<{
    included: boolean;
    estimatedAdrUsd?: number;
    rateMinimumUsd?: number;
    rateMaximumUsd?: number;
    rateObservationCount?: number;
    calendarUnavailablePercentage?: number;
    calendarUnavailableNights?: number;
    calendarObservationCount?: number;
  }>)[];
}>;

export class StrComparisonRepository implements StrComparisonRepositoryPort {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async resolveTarget(listingUrl: string): Promise<ComparatorTargetRecord | undefined> {
    const { data: mapping, error: mappingError } = await this.client.from("property_source_ids")
      .select("canonical_property_id").eq("external_url", listingUrl).limit(1).maybeSingle();
    if (mappingError) throw new Error("Unable to resolve the selected property.");
    if (!mapping) return undefined;
    const canonicalPropertyId = String(mapping.canonical_property_id);
    const [{ data: property, error: propertyError }, { data: snapshot, error: snapshotError }] = await Promise.all([
      this.client.from("canonical_properties").select("property_kind,address_line1,city,state,zip_code,lat,lng,beds,baths,building_sqft,current_use").eq("id", canonicalPropertyId).single(),
      this.client.from("listing_snapshots").select("id,listing_url,list_price,beds,baths,sqft,raw_payload").eq("canonical_property_id", canonicalPropertyId).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (propertyError || snapshotError) throw new Error("Unable to load the selected property.");
    if (!property || !snapshot || property.property_kind !== "existing_home") return undefined;
    const raw = asRecord(snapshot.raw_payload);
    const recovered = resolveTargetCoordinates(property, raw);
    if (!recovered) return undefined;
    return Object.freeze({
      canonicalPropertyId,
      listingSnapshotId: String(snapshot.id),
      listingUrl: String(snapshot.listing_url ?? listingUrl),
      address: optionalText(property.address_line1), city: optionalText(property.city), state: optionalText(property.state), postalCode: optionalText(property.zip_code),
      price: optionalNumber(snapshot.list_price), bedrooms: optionalNumber(snapshot.beds ?? property.beds), bathrooms: optionalNumber(snapshot.baths ?? property.baths),
      livingAreaSqft: optionalNumber(snapshot.sqft ?? property.building_sqft), propertyType: optionalText(property.current_use), latitude: recovered.latitude, longitude: recovered.longitude,
      imageUrl: optionalText(raw.imgSrc ?? raw.imageUrl),
    });
  }

  async findComparisonCache(canonicalPropertyId: string, now = new Date()): Promise<ComparisonCacheLookup> {
    const { data, error } = await this.client.from("str_comparison_runs").select("public_reference,completed_at,expires_at")
      .eq("canonical_property_id", canonicalPropertyId).in("status", ["discovered", "enriched", "partial"])
      .order("completed_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Unable to load saved comparison evidence.");
    if (!data) return Object.freeze({ status: "missing" });

    const expiresAt = optionalText(data.expires_at);
    if (!expiresAt) return Object.freeze({ status: "missing" });
    return Object.freeze({
      status: Date.parse(expiresAt) > now.getTime() ? "fresh" : "stale",
      publicReference: String(data.public_reference),
      completedAt: optionalText(data.completed_at),
      expiresAt,
    });
  }

  async createRun(params: { target: ComparatorTargetRecord; publicReference: string; cacheKey: string; request: unknown }): Promise<string> {
    const { data, error } = await this.client.from("str_comparison_runs").insert({
      public_reference: params.publicReference, canonical_property_id: params.target.canonicalPropertyId,
      listing_snapshot_id: params.target.listingSnapshotId, status: "running", stage: "discovery",
      request_snapshot: params.request, cache_key: params.cacheKey,
    }).select("id").single();
    if (error || !data) throw new Error("Unable to start the STR comparison.");
    return String(data.id);
  }

  async resolveRunId(publicReference: string): Promise<string> {
    const { data, error } = await this.client.from("str_comparison_runs").select("id").eq("public_reference", publicReference).maybeSingle();
    if (error || !data) throw new Error("Unable to resolve the STR comparison.");
    return String(data.id);
  }

  async saveDiscovery(runId: string, candidates: readonly PersistedComparable[], summary: unknown): Promise<void> {
    if (candidates.length) {
      const { data, error } = await this.client.from("str_comparison_candidates").insert(candidates.map((item) => ({
        comparison_run_id: runId, provider_source: "airbnb", provider_listing_key: item.providerListingKey,
        listing_url: item.listingUrl, title: item.title ?? null, image_url: item.imageUrl ?? null,
        latitude: item.latitude, longitude: item.longitude, distance_miles: item.distanceMiles,
        property_type: item.propertyType ?? null, room_type: item.roomType ?? null, bedrooms: item.bedrooms ?? null,
        bathrooms: item.bathrooms ?? null, guest_capacity: item.guestCapacity ?? null, rating: item.rating ?? null,
        review_count: item.reviewCount ?? null, is_superhost: item.isSuperhost ?? null, amenities: item.amenities,
        observed_nightly_price_usd: item.observedNightlyPriceUsd, observed_check_in: item.observedCheckIn,
        observed_check_out: item.observedCheckOut, similarity_score: item.similarityScore, match_reasons: item.matchReasons,
        raw_payload: item.rawPayload, observed_at: item.observedAt,
      }))).select("id");
      if (error || !data) throw new Error("Unable to save comparable evidence.");
      const { error: selectionError } = await this.client.from("str_comparable_selections").insert(data.map((row) => ({ comparison_run_id: runId, comparison_candidate_id: row.id, included: true })));
      if (selectionError) throw new Error("Unable to initialize comparable selections.");
    }
    const completedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { error } = await this.client.from("str_comparison_runs").update({ status: "discovered", candidate_count: candidates.length, selected_count: candidates.length, summary, completed_at: completedAt, expires_at: expiresAt }).eq("id", runId);
    if (error) throw new Error("Unable to finish comparable discovery.");
  }

  async saveEvidence(runId: string, evidence: readonly PersistedEvidence[], summary: unknown): Promise<void> {
    const { data: candidates, error } = await this.client.from("str_comparison_candidates").select("id,provider_listing_key").eq("comparison_run_id", runId);
    if (error) throw new Error("Unable to resolve comparable evidence.");
    const idByKey = new Map((candidates ?? []).map((item) => [String(item.provider_listing_key), String(item.id)]));
    for (const item of evidence) {
      const candidateId = idByKey.get(item.providerListingKey);
      if (!candidateId) continue;
      if (item.rates.length) {
        const { error: rateError } = await this.client.from("str_rate_observations").insert(item.rates.map((rate) => ({
          comparison_candidate_id: candidateId, check_in: rate.date, check_out: nextDate(rate.date), night_count: 1,
          nightly_rate_usd: rate.nightlyRateUsd, observed_at: item.observedAt, raw_evidence: rate.rawEvidence ?? {},
        })));
        if (rateError) throw new Error("Unable to save rate observations.");
      }
      const calendar = item.calendar;
      const { error: calendarError } = await this.client.from("str_calendar_snapshots").insert({
        comparison_candidate_id: candidateId, window_start: calendar.windowStart, window_end: calendar.windowEnd,
        available_nights: calendar.availableNights, unavailable_nights: calendar.unavailableNights,
        unknown_nights: calendar.unknownNights, unavailability_rate: calendar.unavailabilityRate ?? null,
        daily_observations: calendar.dailyObservations, raw_evidence: calendar.rawEvidence ?? {}, observed_at: item.observedAt,
      });
      if (calendarError) throw new Error("Unable to save calendar evidence.");
    }
    const { error: runError } = await this.client.from("str_comparison_runs").update({ status: "enriched", stage: "evidence", summary, completed_at: new Date().toISOString() }).eq("id", runId);
    if (runError) throw new Error("Unable to finish comparable evidence.");
  }

  async updateSelections(publicReference: string, listingUrls: readonly string[]): Promise<void> {
    const stored = await this.loadComparison(publicReference);
    if (!stored || listingUrls.length === 0) throw new Error("Keep at least one comparable included.");
    const { data: run } = await this.client.from("str_comparison_runs").select("id").eq("public_reference", publicReference).single();
    const { data: candidates, error } = await this.client.from("str_comparison_candidates").select("id,listing_url").eq("comparison_run_id", run!.id);
    if (error) throw new Error("Unable to update comparable selections.");
    const selected = new Set(listingUrls);
    const candidateUrls = new Set((candidates ?? []).map((item) => String(item.listing_url)));
    if ([...selected].some((url) => !candidateUrls.has(url))) throw new Error("Choose comparable stays from this comparison.");
    const { error: updateError } = await this.client.from("str_comparable_selections").upsert((candidates ?? []).map((item) => ({ comparison_run_id: run!.id, comparison_candidate_id: item.id, included: selected.has(String(item.listing_url)), updated_at: new Date().toISOString() })));
    if (updateError) throw new Error("Unable to update comparable selections.");
  }

  async loadComparison(publicReference: string): Promise<StoredComparison | undefined> {
    const { data: run, error } = await this.client.from("str_comparison_runs").select("id,public_reference,status,stage,summary,completed_at,canonical_property_id").eq("public_reference", publicReference).maybeSingle();
    if (error) throw new Error("Unable to load STR comparison.");
    if (!run) return undefined;
    const targetMapping = await this.client.from("property_source_ids").select("external_url").eq("canonical_property_id", run.canonical_property_id).limit(1).maybeSingle();
    const target = targetMapping.data?.external_url ? await this.resolveTarget(String(targetMapping.data.external_url)) : undefined;
    if (!target) return undefined;
    const { data: rows, error: rowsError } = await this.client.from("str_comparison_candidates").select("*,str_comparable_selections(included),str_rate_observations(nightly_rate_usd,observed_at),str_calendar_snapshots(available_nights,unavailable_nights,unknown_nights,unavailability_rate,observed_at)").eq("comparison_run_id", run.id).order("similarity_score", { ascending: false });
    if (rowsError) throw new Error("Unable to load comparable evidence.");
    const targetCoordinates = { latitude: target.latitude, longitude: target.longitude };
    const candidates = (rows ?? []).map(rowToStoredComparable).map((candidate) => Object.freeze({
      ...candidate,
      distanceMiles: Math.round(haversineDistanceKm(targetCoordinates, { latitude: candidate.latitude, longitude: candidate.longitude }) * 0.621371 * 100) / 100,
    }));
    return Object.freeze({ publicReference: String(run.public_reference), status: String(run.status), stage: String(run.stage), completedAt: optionalText(run.completed_at), target, summary: run.summary, candidates: Object.freeze(candidates) });
  }

  async listComparableLibrary(limit = 200): Promise<readonly StoredComparableLibraryItem[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const { data, error } = await this.client.from("str_comparison_candidates")
      .select("*,comparison_run:str_comparison_runs!str_comparison_candidates_comparison_run_id_fkey!inner(status,canonical_property_id,canonical_properties(address_line1,city,state)),str_rate_observations(nightly_rate_usd,observed_at),str_calendar_snapshots(available_nights,unavailable_nights,unknown_nights,unavailability_rate,observed_at)")
      .in("comparison_run.status", ["discovered", "enriched", "partial"])
      .order("observed_at", { ascending: false })
      .limit(boundedLimit);
    if (error) throw new Error("Unable to load the STR comparable library.");

    const grouped = new Map<string, Record<string, any>[]>();
    for (const row of data ?? []) {
      const key = optionalText(row.provider_listing_key) ?? optionalText(row.listing_url);
      if (!key) continue;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }

    return Object.freeze([...grouped.values()].map((rows) => {
      const latest = rows[0]!;
      const comparable = rowToStoredComparable(latest);
      const closestDistance = Math.min(...rows.map((row) => optionalNumber(row.distance_miles)).filter((value): value is number => value !== undefined && value >= 0));
      const propertyLabels = new Map<string, string>();
      for (const row of rows) {
        const run = firstRecord(row.comparison_run);
        const property = firstRecord(run.canonical_properties);
        const propertyId = optionalText(run.canonical_property_id);
        if (propertyId) propertyLabels.set(propertyId, [optionalText(property.address_line1), optionalText(property.city), optionalText(property.state)].filter(Boolean).join(", ") || "Associated Zillow property");
      }
      const observed = rows.map((row) => optionalText(row.observed_at)).filter((value): value is string => Boolean(value)).sort();
      return Object.freeze({
        comparable: Object.freeze({ ...comparable, distanceMiles: Number.isFinite(closestDistance) ? closestDistance : comparable.distanceMiles }),
        associatedPropertyCount: propertyLabels.size,
        associatedProperties: Object.freeze([...propertyLabels.values()]),
        firstObservedAt: observed[0] ?? comparable.observedAt,
        latestObservedAt: observed.at(-1) ?? comparable.observedAt,
      });
    }).sort((left, right) => right.latestObservedAt.localeCompare(left.latestObservedAt)));
  }
}

export function rowToStoredComparable(row: Record<string, any>): StoredComparison["candidates"][number] {
  const latestRateObservation = [...(row.str_rate_observations ?? [])].sort((left: any, right: any) => String(right.observed_at).localeCompare(String(left.observed_at)))[0]?.observed_at;
  const rates = (row.str_rate_observations ?? []).filter((item: any) => item.observed_at === latestRateObservation).map((item: any) => optionalNumber(item.nightly_rate_usd)).filter((item: number | undefined): item is number => item !== undefined && item > 0);
  const calendar = [...(row.str_calendar_snapshots ?? [])].sort((left: any, right: any) => String(right.observed_at).localeCompare(String(left.observed_at)))[0];
  const availableNights = optionalNumber(calendar?.available_nights);
  const unavailableNights = optionalNumber(calendar?.unavailable_nights);
  const unknownNights = optionalNumber(calendar?.unknown_nights);
  const calendarObservationCount = [availableNights, unavailableNights, unknownNights].every((value) => value !== undefined)
    ? availableNights! + unavailableNights! + unknownNights!
    : undefined;
  return Object.freeze({ providerListingKey: String(row.provider_listing_key), listingUrl: String(row.listing_url), title: optionalText(row.title), imageUrl: optionalText(row.image_url), latitude: Number(row.latitude), longitude: Number(row.longitude), distanceMiles: Number(row.distance_miles), propertyType: optionalText(row.property_type), roomType: optionalText(row.room_type), bedrooms: optionalNumber(row.bedrooms), bathrooms: optionalNumber(row.bathrooms), guestCapacity: optionalNumber(row.guest_capacity), rating: optionalNumber(row.rating), reviewCount: optionalNumber(row.review_count), isSuperhost: typeof row.is_superhost === "boolean" ? row.is_superhost : undefined, amenities: Object.freeze(Array.isArray(row.amenities) ? row.amenities.filter((item: unknown): item is string => typeof item === "string") : []), observedNightlyPriceUsd: Number(row.observed_nightly_price_usd), observedCheckIn: String(row.observed_check_in), observedCheckOut: String(row.observed_check_out), similarityScore: Number(row.similarity_score), matchReasons: Object.freeze(Array.isArray(row.match_reasons) ? row.match_reasons.filter((item: unknown): item is string => typeof item === "string") : []), observedAt: String(row.observed_at), rawPayload: row.raw_payload, included: row.str_comparable_selections?.[0]?.included !== false, estimatedAdrUsd: rates.length ? mean(rates) : undefined, rateMinimumUsd: rates.length ? Math.min(...rates) : undefined, rateMaximumUsd: rates.length ? Math.max(...rates) : undefined, rateObservationCount: rates.length, calendarUnavailablePercentage: optionalNumber(calendar?.unavailability_rate) !== undefined ? optionalNumber(calendar.unavailability_rate)! * 100 : undefined, calendarUnavailableNights: unavailableNights, calendarObservationCount });
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function firstRecord(value: unknown): Record<string, unknown> { return Array.isArray(value) ? asRecord(value[0]) : asRecord(value); }
export function resolveTargetCoordinates(property: Record<string, unknown>, snapshot: Record<string, unknown>) {
  const providerRaw = asRecord(snapshot.raw);
  const latLong = asRecord(providerRaw.latLong);
  const coordinates = asRecord(providerRaw.coordinates);
  const homeInfo = asRecord(asRecord(providerRaw.hdpData).homeInfo);
  const pairs = [[property.lat, property.lng], [snapshot.latitude, snapshot.longitude], [latLong.latitude, latLong.longitude], [coordinates.latitude, coordinates.longitude], [homeInfo.latitude, homeInfo.longitude]];
  for (const [rawLatitude, rawLongitude] of pairs) {
    const latitude = optionalNumber(rawLatitude);
    const longitude = optionalNumber(rawLongitude);
    if (latitude !== undefined && longitude !== undefined && !(latitude === 0 && longitude === 0)) return Object.freeze({ latitude, longitude });
  }
  return undefined;
}
function optionalText(value: unknown) { return typeof value === "string" && value ? value : undefined; }
function optionalNumber(value: unknown) { const number = Number(value); return value !== null && value !== undefined && Number.isFinite(number) ? number : undefined; }
function mean(values: readonly number[]) { return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100; }
function nextDate(date: string) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }
