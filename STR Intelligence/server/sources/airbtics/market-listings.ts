import type { MarketListing, YosemiteGateway } from "../../../shared/market-listing.js";

export type AirbticsBounds = Readonly<{ ne_lat: number; ne_lng: number; sw_lat: number; sw_lng: number }>;

export type AirbticsListingPage = Readonly<{
  providerTotalCount: number;
  listings: readonly MarketListing[];
  rawPayload: unknown;
}>;

export class AirbticsMarketListingProvider {
  constructor(private readonly options: Readonly<{ apiKey: string; fetcher?: typeof fetch; baseUrl?: string }>) {}

  async fetchPage(input: Readonly<{ gateway: YosemiteGateway; bounds: AirbticsBounds; page: number; collectedAt?: string }>): Promise<AirbticsListingPage> {
    const response = await (this.options.fetcher ?? fetch)(`${this.options.baseUrl ?? "https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod"}/listings/search/bounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": this.options.apiKey },
      body: JSON.stringify({ page: input.page, bounds: input.bounds }),
    });
    if (!response.ok) throw new Error(`Airbtics market listing request failed with status ${response.status}.`);
    const payload = await response.json() as unknown;
    return normalizeAirbticsListingPage(payload, input.gateway, input.collectedAt ?? new Date().toISOString());
  }
}

export function normalizeAirbticsListingPage(payload: unknown, gateway: YosemiteGateway, collectedAt: string): AirbticsListingPage {
  const root = record(payload);
  const message = record(root.message);
  const encoded = message.listings;
  const decoded = typeof encoded === "string" ? record(JSON.parse(encoded)) : record(encoded);
  const rows = Array.isArray(decoded.message) ? decoded.message : [];
  const listings = rows.flatMap((value) => {
    const row = record(value);
    const listingId = text(row.listingID);
    const name = text(row.name);
    if (!listingId || !name) return [];
    return [Object.freeze({
      listingUrl: `https://www.airbnb.com/rooms/${encodeURIComponent(listingId)}`,
      name,
      gateway,
      propertyType: providerText(row.property_type), roomType: providerText(row.room_type), bedrooms: providerText(row.bedrooms),
      bathrooms: number(row.bathrooms), accommodates: number(row.accommodates),
      adrUsd: number(row.avg_booked_daily_rate_ltm), occupancyPercent: number(row.avg_occupancy_rate_ltm),
      annualRevenueUsd: number(row.annual_revenue_ltm), revenuePotentialUsd: number(row.revenue_potential),
      bookingsLtm: number(row.no_of_bookings_ltm), activeDaysLtm: number(row.active_days_count_ltm),
      ratingPercent: number(row.reveiw_scores_rating), reviewCount: number(row.visible_review_count),
      cleaningFeeUsd: number(row.cleaning_fee), minimumNights: number(row.minimum_nights),
      imageUrl: safeUrl(row.thumbnail_url), amenities: booleanRecord(row.amenities), lastSeen: text(row.last_seen), collectedAt,
    })];
  });
  return Object.freeze({ providerTotalCount: number(message.total_count) ?? listings.length, listings: Object.freeze(listings), rawPayload: payload });
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function providerText(value: unknown) { const candidate = typeof value === "number" ? String(value) : text(value); return candidate && candidate !== "-1" ? candidate : undefined; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function safeUrl(value: unknown) { const candidate = text(value); if (!candidate) return undefined; try { const url = new URL(candidate); return url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; } }
function booleanRecord(value: unknown) { return Object.freeze(Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"))); }
