import type { SupabaseClient } from "@supabase/supabase-js";
import type { StrRevenueEstimate } from "../../shared/str-revenue-estimate.js";
import type { AirbticsPropertyInput } from "../sources/airbtics/provider.js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";

type PropertyTarget = Readonly<{ canonicalPropertyId: string; listingSnapshotId: string; input: AirbticsPropertyInput }>;
type EstimateRow = Record<string, unknown>;
export type RevenueEstimateJob = Readonly<{ id: string; providerReference: string; status: "pending" | "completed" | "failed"; startedAt: string }>;

export interface RevenueEstimateStore {
  resolveProperty(listingUrl: string): Promise<PropertyTarget | undefined>;
  latest(canonicalPropertyId: string): Promise<EstimateRow | undefined>;
  insert(row: EstimateRow): Promise<EstimateRow>;
  latestJob(canonicalPropertyId: string): Promise<EstimateRow | undefined>;
  insertJob(row: EstimateRow): Promise<EstimateRow>;
  updateJob(id: string, row: EstimateRow): Promise<void>;
}

export class RevenueEstimateRepository {
  constructor(private readonly store: RevenueEstimateStore = new SupabaseRevenueEstimateStore()) {}
  async resolve(listingUrl: string) { return this.store.resolveProperty(listingUrl); }
  async latest(canonicalPropertyId: string): Promise<StrRevenueEstimate | undefined> { const row = await this.store.latest(canonicalPropertyId); return row ? toEstimate(row) : undefined; }
  async latestJob(canonicalPropertyId: string): Promise<RevenueEstimateJob | undefined> { const row = await this.store.latestJob(canonicalPropertyId); return row ? toJob(row) : undefined; }
  async startJob(target: PropertyTarget, providerReference: string) { return toJob(await this.store.insertJob({ canonical_property_id: target.canonicalPropertyId, listing_snapshot_id: target.listingSnapshotId, provider: "airbtics", provider_report_reference: providerReference, status: "pending" }))!; }
  async completeJob(id: string) { await this.store.updateJob(id, { status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }); }
  async failJob(id: string, failureCode: string) { await this.store.updateJob(id, { status: "failed", failure_code: failureCode, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }); }
  async save(target: PropertyTarget, providerResult: Readonly<{ estimate: Omit<StrRevenueEstimate, "collectedAt" | "expiresAt" | "freshness">; providerReference: string; rawPayload: unknown }>) {
    const collectedAt = new Date();
    const expiresAt = new Date(collectedAt.getTime() + 30 * 86_400_000);
    const row = await this.store.insert({ canonical_property_id: target.canonicalPropertyId, listing_snapshot_id: target.listingSnapshotId, provider: "airbtics", provider_report_reference: providerResult.providerReference, estimated_adr_usd: providerResult.estimate.estimatedAdrUsd, estimated_occupancy_percent: providerResult.estimate.estimatedOccupancyPercent, estimated_annual_revenue_usd: providerResult.estimate.estimatedAnnualRevenueUsd, comparable_count: providerResult.estimate.comparableCount ?? null, input_snapshot: target.input, raw_payload: providerResult.rawPayload, collected_at: collectedAt.toISOString(), expires_at: expiresAt.toISOString() });
    const estimate = toEstimate(row);
    if (!estimate) throw new Error("Saved STR estimate was incomplete.");
    return estimate;
  }
}

export class SupabaseRevenueEstimateStore implements RevenueEstimateStore {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}
  async resolveProperty(listingUrl: string) {
    const { data: mapping, error } = await this.client.from("property_source_ids").select("canonical_property_id").eq("external_url", listingUrl).limit(1).maybeSingle();
    if (error || !mapping) return undefined;
    const canonicalPropertyId = String(mapping.canonical_property_id);
    const { data: snapshot, error: snapshotError } = await this.client.from("listing_snapshots").select("id,beds,baths,raw_payload").eq("canonical_property_id", canonicalPropertyId).order("observed_at", { ascending: false }).limit(1).maybeSingle();
    if (snapshotError || !snapshot) return undefined;
    const raw = record(snapshot.raw_payload);
    const latitude = number(raw.latitude ?? raw.lat);
    const longitude = number(raw.longitude ?? raw.lng ?? raw.lon);
    const bedrooms = integer(snapshot.beds ?? raw.bedrooms ?? raw.beds);
    const bathrooms = integer(snapshot.baths ?? raw.bathrooms ?? raw.baths);
    if (latitude === undefined || longitude === undefined || bedrooms === undefined || bathrooms === undefined) return undefined;
    return Object.freeze({ canonicalPropertyId, listingSnapshotId: String(snapshot.id), input: Object.freeze({ latitude, longitude, bedrooms, bathrooms, accommodates: Math.max(2, bedrooms * 2) }) });
  }
  async latest(canonicalPropertyId: string) { const { data, error } = await this.client.from("str_revenue_estimates").select("*").eq("canonical_property_id", canonicalPropertyId).order("collected_at", { ascending: false }).limit(1).maybeSingle(); if (error) throw new Error("Unable to load the STR estimate."); return data ?? undefined; }
  async insert(row: EstimateRow) { const { data, error } = await this.client.from("str_revenue_estimates").insert(row).select("*").single(); if (error || !data) throw new Error("Unable to save the STR estimate."); return data; }
  async latestJob(canonicalPropertyId: string) { const { data, error } = await this.client.from("str_revenue_estimate_jobs").select("*").eq("canonical_property_id", canonicalPropertyId).order("started_at", { ascending: false }).limit(1).maybeSingle(); if (error) throw new Error("Unable to load the STR estimate job."); return data ?? undefined; }
  async insertJob(row: EstimateRow) { const { data, error } = await this.client.from("str_revenue_estimate_jobs").insert(row).select("*").single(); if (error || !data) throw new Error("Unable to save the STR estimate job."); return data; }
  async updateJob(id: string, row: EstimateRow) { const { error } = await this.client.from("str_revenue_estimate_jobs").update(row).eq("id", id); if (error) throw new Error("Unable to update the STR estimate job."); }
}

function toEstimate(row: EstimateRow): StrRevenueEstimate | undefined {
  const estimatedAdrUsd = number(row.estimated_adr_usd), estimatedOccupancyPercent = number(row.estimated_occupancy_percent), estimatedAnnualRevenueUsd = number(row.estimated_annual_revenue_usd);
  const collectedAt = text(row.collected_at), expiresAt = text(row.expires_at);
  if (!estimatedAdrUsd || estimatedOccupancyPercent === undefined || !estimatedAnnualRevenueUsd || !collectedAt || !expiresAt) return undefined;
  const comparableCount = integer(row.comparable_count);
  return Object.freeze({ estimatedAdrUsd, estimatedOccupancyPercent, estimatedAnnualRevenueUsd, ...(comparableCount !== undefined ? { comparableCount } : {}), collectedAt, expiresAt, freshness: Date.parse(expiresAt) > Date.now() ? "fresh" : "stale" });
}
function toJob(row: EstimateRow): RevenueEstimateJob | undefined {
  const id = text(row.id), providerReference = text(row.provider_report_reference), startedAt = text(row.started_at);
  const status = row.status;
  if (!id || !providerReference || !startedAt || (status !== "pending" && status !== "completed" && status !== "failed")) return undefined;
  return Object.freeze({ id, providerReference, status, startedAt });
}
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function number(value: unknown) { const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN; return Number.isFinite(parsed) ? parsed : undefined; }
function integer(value: unknown) { const parsed = number(value); return parsed !== undefined && parsed >= 0 ? Math.trunc(parsed) : undefined; }
function text(value: unknown) { return typeof value === "string" && value ? value : undefined; }
