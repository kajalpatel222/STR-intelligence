import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineDistanceKm } from "../../../shared/str-comparator-ranking.js";
import { getSupabaseAdminClient } from "../../lib/supabase-admin.js";
import type {
  CalendarRequest,
  DiscoveredListing,
  DiscoveryRequest,
  ListingCalendar,
  ProviderBatch,
  StrComparatorProvider,
} from "./provider.js";

const MILES_PER_KILOMETER = 0.621371;
const DEFAULT_RADIUS_MILES = 1;
const MAX_RESULTS = 500;

type MarketSnapshotRow = Readonly<Record<string, unknown>>;

/**
 * Database-backed comparator discovery. This adapter never contacts Airbnb or
 * Airbtics; it reads the immutable market snapshots collected by an explicit
 * paid market refresh.
 */
export class AirbticsDatabaseComparatorProvider implements StrComparatorProvider {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async discover(request: DiscoveryRequest): Promise<ProviderBatch<DiscoveredListing>> {
    if (!coordinate(request.latitude, -90, 90) || !coordinate(request.longitude, -180, 180)) {
      return failure("Comparator target coordinates are unavailable.");
    }
    const radiusMiles = positive(request.radiusMiles) ? Math.min(request.radiusMiles, 25) : DEFAULT_RADIUS_MILES;
    const bounds = boundingBox(request.latitude, request.longitude, radiusMiles);
    const rows: MarketSnapshotRow[] = [];
    const pageSize = 1_000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client.from("str_market_listing_snapshots")
        .select("listing_url,name,latitude,longitude,property_type,room_type,bedrooms,bathrooms,accommodates,adr_usd,occupancy_percent,annual_revenue_usd,rating_percent,review_count,image_url,amenities,collected_at")
        .gte("latitude", bounds.minimumLatitude).lte("latitude", bounds.maximumLatitude)
        .gte("longitude", bounds.minimumLongitude).lte("longitude", bounds.maximumLongitude)
        .order("collected_at", { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw new Error("Unable to load saved STR market listings.");
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < pageSize) break;
    }
    return Object.freeze({
      records: selectNearbyAirbticsListings(rows, {
        latitude: request.latitude,
        longitude: request.longitude,
        radiusMiles,
        limit: Math.min(Math.max(Math.trunc(request.limit ?? MAX_RESULTS), 1), MAX_RESULTS),
      }),
      errors: Object.freeze([]),
    });
  }

  async collectCalendars(_request: CalendarRequest): Promise<ProviderBatch<ListingCalendar>> {
    return Object.freeze({
      records: Object.freeze([]),
      errors: Object.freeze([{ stage: "calendar" as const, code: "invalid_request" as const, message: "Saved Airbtics market snapshots do not include daily calendar evidence." }]),
    });
  }
}

export function selectNearbyAirbticsListings(
  rows: readonly MarketSnapshotRow[],
  target: Readonly<{ latitude: number; longitude: number; radiusMiles: number; limit?: number }>,
): readonly DiscoveredListing[] {
  const newestByUrl = new Map<string, MarketSnapshotRow>();
  for (const row of rows) {
    const listingUrl = text(row.listing_url);
    if (!listingUrl || newestByUrl.has(listingUrl)) continue;
    newestByUrl.set(listingUrl, row);
  }
  return Object.freeze([...newestByUrl.values()].flatMap((row) => {
    const latitude = numeric(row.latitude);
    const longitude = numeric(row.longitude);
    const url = text(row.listing_url);
    const listingId = url ? airbnbListingId(url) : undefined;
    if (!coordinate(latitude, -90, 90) || !coordinate(longitude, -180, 180) || !url || !listingId) return [];
    const distanceMiles = haversineDistanceKm(target, { latitude, longitude }) * MILES_PER_KILOMETER;
    if (distanceMiles > target.radiusMiles) return [];
    const ratingPercent = numeric(row.rating_percent);
    return [Object.freeze({
      provider: "airbnb" as const,
      dataSource: "airbtics_market" as const,
      listingId,
      url,
      title: text(row.name),
      propertyType: text(row.property_type),
      roomType: text(row.room_type),
      latitude,
      longitude,
      bedrooms: numericText(row.bedrooms),
      bathrooms: numeric(row.bathrooms),
      maxGuests: numeric(row.accommodates),
      adrLtmUsd: positive(row.adr_usd) ? numeric(row.adr_usd) : undefined,
      occupancyLtmPercent: percentage(row.occupancy_percent),
      annualRevenueLtmUsd: nonNegative(row.annual_revenue_usd),
      rating: ratingPercent === undefined ? undefined : ratingPercent > 5 ? ratingPercent / 20 : ratingPercent,
      reviewCount: nonNegative(row.review_count),
      imageUrl: httpsUrl(row.image_url),
      amenities: enabledAmenities(row.amenities),
      scrapedAt: text(row.collected_at),
      marketCollectedAt: text(row.collected_at),
    })];
  }).sort((left, right) => {
    const leftDistance = haversineDistanceKm(target, { latitude: left.latitude!, longitude: left.longitude! });
    const rightDistance = haversineDistanceKm(target, { latitude: right.latitude!, longitude: right.longitude! });
    return leftDistance - rightDistance || left.listingId.localeCompare(right.listingId);
  }).slice(0, target.limit ?? MAX_RESULTS));
}

function boundingBox(latitude: number, longitude: number, radiusMiles: number) {
  const latitudeDelta = radiusMiles / 69;
  const longitudeDelta = radiusMiles / Math.max(1, 69 * Math.cos(latitude * Math.PI / 180));
  return {
    minimumLatitude: latitude - latitudeDelta,
    maximumLatitude: latitude + latitudeDelta,
    minimumLongitude: longitude - longitudeDelta,
    maximumLongitude: longitude + longitudeDelta,
  };
}

function failure(message: string): ProviderBatch<DiscoveredListing> {
  return Object.freeze({ records: Object.freeze([]), errors: Object.freeze([{ stage: "discovery" as const, code: "invalid_request" as const, message }]) });
}
function airbnbListingId(url: string) { try { return new URL(url).pathname.match(/^\/rooms\/([^/]+)/)?.[1]; } catch { return undefined; } }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function numeric(value: unknown) { const candidate = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN; return Number.isFinite(candidate) ? candidate : undefined; }
function numericText(value: unknown) { const candidate = numeric(value); return candidate !== undefined && candidate >= 0 ? candidate : undefined; }
function positive(value: unknown): value is number { const candidate = numeric(value); return candidate !== undefined && candidate > 0; }
function nonNegative(value: unknown) { const candidate = numeric(value); return candidate !== undefined && candidate >= 0 ? candidate : undefined; }
function percentage(value: unknown) { const candidate = numeric(value); return candidate !== undefined && candidate >= 0 && candidate <= 100 ? candidate : undefined; }
function coordinate(value: unknown, minimum: number, maximum: number): value is number { const candidate = numeric(value); return candidate !== undefined && candidate >= minimum && candidate <= maximum; }
function httpsUrl(value: unknown) { const candidate = text(value); if (!candidate) return undefined; try { const url = new URL(candidate); return url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; } }
function enabledAmenities(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze([]); return Object.freeze(Object.entries(value).flatMap(([name, enabled]) => enabled === true ? [name] : [])); }
