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
    const { data: runs, error: runsError } = await this.client.from("str_market_collections").select("id,label,gateway,status,page_number,provider_total_count,saved_count,collected_at").eq("status", "complete").eq("label", latest.label).order("collected_at", { ascending: false });
    if (runsError) throw new Error("Unable to load market collection pages.");
    // Reimports remain audit records; the current view uses only the newest snapshot for each provider page.
    const latestByPage = new Map<number, NonNullable<typeof runs>[number]>();
    for (const run of runs ?? []) if (!latestByPage.has(run.page_number)) latestByPage.set(run.page_number, run);
    const selectedRuns = [...latestByPage.values()];
    const { data: rows, error: listingError } = await this.client.from("str_market_listing_snapshots").select("listing_url,name,gateway,property_type,room_type,bedrooms,bathrooms,accommodates,adr_usd,occupancy_percent,annual_revenue_usd,revenue_potential_usd,bookings_ltm,active_days_ltm,rating_percent,review_count,cleaning_fee_usd,minimum_nights,image_url,amenities,last_seen,collected_at").in("collection_id", selectedRuns.map((run) => run.id));
    if (listingError) throw new Error("Unable to load market listings.");
    const uniqueRows = [...new Map((rows ?? []).map((row) => [row.listing_url, row])).values()];
    const collectedPages = [...latestByPage.keys()].sort((a, b) => a - b);
    return Object.freeze({ label: String(latest.label), gateway: latest.gateway, status: "complete", page: Math.max(...collectedPages), collectedPages: Object.freeze(collectedPages), providerTotalCount: latest.provider_total_count, savedCount: uniqueRows.length, collectedAt: latest.collected_at, listings: Object.freeze(uniqueRows.map((row) => Object.freeze({
      listingUrl: row.listing_url, name: row.name, gateway: row.gateway, propertyType: row.property_type ?? undefined,
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
