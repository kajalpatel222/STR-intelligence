import type { SupabaseClient } from "@supabase/supabase-js";
import type { AirbticsListingPage, AirbticsBounds } from "../sources/airbtics/market-listings.js";
import type { MarketListingCollection, YosemiteGateway } from "../../shared/market-listing.js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";

export class MarketListingRepository {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async savePage(input: Readonly<{ label: string; gateway: YosemiteGateway; bounds: AirbticsBounds; page: number; result: AirbticsListingPage }>) {
    const collectedAt = input.result.listings[0]?.collectedAt ?? new Date().toISOString();
    const { data: run, error: runError } = await this.client.from("str_market_collections").insert({
      provider: "airbtics", label: input.label, gateway: input.gateway, boundary_definition: input.bounds,
      page_number: input.page, provider_total_count: input.result.providerTotalCount, saved_count: input.result.listings.length,
      status: "complete", raw_payload: input.result.rawPayload, collected_at: collectedAt,
    }).select("id").single();
    if (runError || !run) throw new Error("Unable to save the market collection.");
    if (input.result.listings.length) {
      const { error } = await this.client.from("str_market_listing_snapshots").insert(input.result.listings.map((listing) => ({
        collection_id: run.id, listing_url: listing.listingUrl, name: listing.name, gateway: listing.gateway,
        latitude: listing.latitude ?? null, longitude: listing.longitude ?? null,
        property_type: listing.propertyType ?? null, room_type: listing.roomType ?? null, bedrooms: listing.bedrooms ?? null,
        bathrooms: listing.bathrooms ?? null, accommodates: listing.accommodates ?? null, adr_usd: listing.adrUsd ?? null,
        occupancy_percent: listing.occupancyPercent ?? null, annual_revenue_usd: listing.annualRevenueUsd ?? null,
        revenue_potential_usd: listing.revenuePotentialUsd ?? null, bookings_ltm: listing.bookingsLtm ?? null,
        active_days_ltm: listing.activeDaysLtm ?? null, rating_percent: listing.ratingPercent ?? null,
        review_count: listing.reviewCount ?? null, cleaning_fee_usd: listing.cleaningFeeUsd ?? null,
        minimum_nights: listing.minimumNights ?? null, image_url: listing.imageUrl ?? null, amenities: listing.amenities,
        last_seen: listing.lastSeen ?? null, collected_at: listing.collectedAt,
      })));
      if (error) throw new Error("Unable to save market listings.");
    }
  }

  async loadLatest(): Promise<MarketListingCollection | undefined> {
    const { data: latest, error } = await this.client.from("str_market_collections").select("id,label,gateway,status,page_number,provider_total_count,saved_count,collected_at").eq("status", "complete").order("collected_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Unable to load the market collection.");
    if (!latest) return undefined;
    const { data: runs, error: runsError } = await this.client.from("str_market_collections").select("id,label,gateway,status,page_number,provider_total_count,saved_count,collected_at").eq("status", "complete").order("collected_at", { ascending: false });
    if (runsError) throw new Error("Unable to load market collection pages.");
    // Each gateway is independently paginated; retain only its newest immutable snapshot per page.
    const latestByGatewayPage = new Map<string, NonNullable<typeof runs>[number]>();
    for (const run of runs ?? []) {
      const key = `${run.gateway}:${run.page_number}`;
      if (!latestByGatewayPage.has(key)) latestByGatewayPage.set(key, run);
    }
    const selectedRuns = [...latestByGatewayPage.values()];
    const rows: Record<string, any>[] = [];
    const pageSize = 1_000;
    for (let from = 0; ; from += pageSize) {
      const { data, error: listingError } = await this.client.from("str_market_listing_snapshots").select("listing_url,name,latitude,longitude,gateway,property_type,room_type,bedrooms,bathrooms,accommodates,adr_usd,occupancy_percent,annual_revenue_usd,revenue_potential_usd,bookings_ltm,active_days_ltm,rating_percent,review_count,cleaning_fee_usd,minimum_nights,image_url,amenities,last_seen,collected_at").in("collection_id", selectedRuns.map((run) => run.id)).range(from, from + pageSize - 1);
      if (listingError) throw new Error("Unable to load market listings.");
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < pageSize) break;
    }
    const uniqueRows = new Map<string, { row: (typeof rows)[number]; gateways: Set<YosemiteGateway> }>();
    for (const row of rows) {
      const existing = uniqueRows.get(row.listing_url);
      if (existing) existing.gateways.add(row.gateway);
      else uniqueRows.set(row.listing_url, { row, gateways: new Set([row.gateway]) });
    }
    const collectedPages = [...new Set(selectedRuns.map((run) => run.page_number))].sort((a, b) => a - b);
    const gateways = [...new Set(selectedRuns.map((run) => run.gateway))];
    const newestByGateway = new Map<string, NonNullable<typeof selectedRuns>[number]>();
    for (const run of selectedRuns) if (!newestByGateway.has(run.gateway)) newestByGateway.set(run.gateway, run);
    const providerTotalCount = [...newestByGateway.values()].reduce((total, run) => total + Number(run.provider_total_count), 0);
    return Object.freeze({ label: "Yosemite gateway coverage", gateway: latest.gateway, gateways: Object.freeze(gateways), status: "complete", page: Math.max(...collectedPages), collectedPages: Object.freeze(collectedPages), providerTotalCount, savedCount: uniqueRows.size, collectedAt: latest.collected_at, listings: Object.freeze([...uniqueRows.values()].map(({ row, gateways: matchedGateways }) => Object.freeze({
      listingUrl: row.listing_url, name: row.name, gateway: row.gateway, gateways: Object.freeze([...matchedGateways]), propertyType: row.property_type ?? undefined,
      latitude: row.latitude ?? undefined, longitude: row.longitude ?? undefined,
      roomType: row.room_type ?? undefined, bedrooms: row.bedrooms ?? undefined, bathrooms: row.bathrooms ?? undefined,
      accommodates: row.accommodates ?? undefined, adrUsd: row.adr_usd ?? undefined, occupancyPercent: row.occupancy_percent ?? undefined,
      annualRevenueUsd: row.annual_revenue_usd ?? undefined, revenuePotentialUsd: row.revenue_potential_usd ?? undefined,
      bookingsLtm: row.bookings_ltm ?? undefined, activeDaysLtm: row.active_days_ltm ?? undefined,
      ratingPercent: row.rating_percent ?? undefined, reviewCount: row.review_count ?? undefined,
      cleaningFeeUsd: row.cleaning_fee_usd ?? undefined, minimumNights: row.minimum_nights ?? undefined,
      imageUrl: row.image_url ?? undefined, amenities: row.amenities ?? {}, lastSeen: row.last_seen ?? undefined, collectedAt: row.collected_at,
    })))});
  }
}
