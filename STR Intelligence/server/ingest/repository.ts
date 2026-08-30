import type { SupabaseClient } from "@supabase/supabase-js";
import type { Market, IngestionResult } from "./types.js";
import type { ListingQuery, NormalizedSourceRecord } from "../sources/listing-source.js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";
import type { SourceRun } from "../sources/listing-source.js";
import { normalizeSupportedLocation, SUPPORTED_MARKETS } from "../markets/supported-markets.js";

type SourceRow = { id: string };
type CanonicalPropertyRow = { id: string };
type ListingSnapshotRow = { id: string };

function normalizeKey(value: string | undefined): string | undefined {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || undefined;
}

function buildNormalizedAddress(record: NormalizedSourceRecord): string | undefined {
  return normalizeKey(record.address ?? record.title);
}

export class IngestionRepository {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async getMarket(location: string): Promise<Market> {
    const supportedLocation = normalizeSupportedLocation(location);
    if (!supportedLocation) throw new Error(`Unsupported market: ${location}`);
    const market = SUPPORTED_MARKETS[supportedLocation];
    const { data, error } = await this.client
      .from("markets")
      .select("id,name,state,zip_code,county,default_lookback_days,max_lookback_days")
      .eq("name", market.name)
      .eq("state", market.state)
      .single();

    if (error || !data) throw new Error(`Unable to load ${supportedLocation} market: ${error?.message ?? "not found"}`);
    return data as Market;
  }

  async ensureSource(sourceKey: string, sourceName: string, sourceKind: string): Promise<SourceRow> {
    const { data, error } = await this.client
      .from("sources")
      .upsert({ source_key: sourceKey, source_name: sourceName, source_kind: sourceKind }, { onConflict: "source_key" })
      .select("id")
      .single();

    if (error || !data) throw new Error(`Unable to upsert source ${sourceKey}: ${error?.message ?? "unknown error"}`);
    return data as SourceRow;
  }

  async createSourceRun(params: {
    sourceId: string;
    marketId: string;
    lookbackDays: number;
    notes?: string;
  }): Promise<{ id: string; sourceRun: SourceRun }> {
    const scheduledFor = new Date().toISOString().slice(0, 10);
    const { data, error } = await this.client
      .from("source_runs")
      .upsert({
        source_id: params.sourceId,
        market_id: params.marketId,
        scheduled_for: scheduledFor,
        started_at: new Date().toISOString(),
        finished_at: null,
        status: "running",
        lookback_days: params.lookbackDays,
        run_mode: "manual",
        notes: params.notes ?? null,
      }, { onConflict: "source_id,market_id,scheduled_for,run_mode" })
      .select("id")
      .single();

    if (error || !data) throw new Error(`Unable to create source run: ${error?.message ?? "unknown error"}`);

    return {
      id: data.id,
      sourceRun: { source: "zillow_existing_home", externalRunId: data.id, status: "running" },
    };
  }

  async finishSourceRun(id: string, status: "succeeded" | "failed" | "partial", notes?: string) {
    const { error } = await this.client
      .from("source_runs")
      .update({ status, finished_at: new Date().toISOString(), notes: notes ?? null })
      .eq("id", id);

    if (error) throw new Error(`Unable to update source run ${id}: ${error.message}`);
  }

  async upsertCanonicalProperty(record: NormalizedSourceRecord, marketId: string): Promise<CanonicalPropertyRow> {
    const normalizedAddress = buildNormalizedAddress(record);
    const payload = {
      market_id: marketId,
      property_kind: record.source === "zillow_land" || record.source === "land_parcel" ? "parcel" : "existing_home",
      normalized_address: normalizedAddress,
      address_line1: record.address ?? record.title ?? null,
      city: record.city ?? null,
      state: record.state ?? null,
      zip_code: record.postalCode ?? null,
      county: record.county ?? null,
      lat: record.latitude ?? null,
      lng: record.longitude ?? null,
      lot_sqft: record.lotSqft ?? null,
      building_sqft: record.sqft ?? null,
      beds: record.beds ?? null,
      baths: record.baths ?? null,
      current_use: record.propertyType ?? null,
      zoning_text: record.zoningText ?? null,
    };

    const { data, error } = await this.client
      .from("canonical_properties")
      .upsert(payload, { onConflict: normalizedAddress ? "market_id,normalized_address" : "market_id,parcel_apn" })
      .select("id")
      .single();

    if (error || !data) throw new Error(`Unable to upsert canonical property: ${error?.message ?? "unknown error"}`);
    return data as CanonicalPropertyRow;
  }

  async upsertPropertySourceId(params: {
    sourceId: string;
    canonicalPropertyId: string;
    record: NormalizedSourceRecord;
  }): Promise<void> {
    const { error } = await this.client.from("property_source_ids").upsert(
      {
        source_id: params.sourceId,
        canonical_property_id: params.canonicalPropertyId,
        external_id: params.record.externalId,
        external_url: params.record.url,
        raw_identifier: params.record.raw,
      },
      { onConflict: "source_id,external_id" },
    );

    if (error) throw new Error(`Unable to upsert property source id: ${error.message}`);
  }

  async insertListingSnapshot(params: {
    sourceRunId: string;
    sourceId: string;
    canonicalPropertyId: string;
    record: NormalizedSourceRecord;
  }): Promise<ListingSnapshotRow> {
    const { data, error } = await this.client
      .from("listing_snapshots")
      .insert({
        source_run_id: params.sourceRunId,
        source_id: params.sourceId,
        canonical_property_id: params.canonicalPropertyId,
        external_id: params.record.externalId,
        observed_at: params.record.discoveredAt,
        listing_url: params.record.url,
        status_text: params.record.statusText ?? null,
        list_price: params.record.price ?? null,
        beds: params.record.beds ?? null,
        baths: params.record.baths ?? null,
        sqft: params.record.sqft ?? null,
        lot_sqft: params.record.lotSqft ?? null,
        description: params.record.description ?? null,
        amenities: params.record.amenities ?? [],
        raw_payload: params.record.raw,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(`Unable to insert listing snapshot: ${error?.message ?? "unknown error"}`);
    return data as ListingSnapshotRow;
  }
}

export type Repository = IngestionRepository;
