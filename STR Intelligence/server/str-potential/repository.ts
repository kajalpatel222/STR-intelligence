import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedStrPotentialEvaluation, StrPotentialEvaluation, StrPotentialEvidence } from "../../shared/str-potential.js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";
import { assembleStrPotentialEvidence } from "./evidence.js";

type Row = Record<string, unknown>;
export type ResolvedStrPotentialSource = Readonly<{
  canonicalPropertyId: string;
  listingSnapshotId: string;
  financialAnalysisRunId?: string;
  listingUrl: string;
  property: Row;
  snapshot: Row;
  financialAnalysis?: Row;
  comparables: readonly Row[];
}>;

export interface StrPotentialStore {
  resolve(listingUrl: string): Promise<ResolvedStrPotentialSource | undefined>;
  findLatest(canonicalPropertyId: string): Promise<Row | undefined>;
  nextVersion(canonicalPropertyId: string): Promise<number>;
  insert(row: Row): Promise<Row>;
}

export class StrPotentialRepository {
  constructor(private readonly store: StrPotentialStore = new SupabaseStrPotentialStore()) {}

  async assembleEvidence(listingUrl: string): Promise<Readonly<{ source: ResolvedStrPotentialSource; evidence: StrPotentialEvidence }>> {
    if (!isPublicZillowUrl(listingUrl)) throw new Error("A valid Zillow listing URL is required.");
    const source = await this.store.resolve(listingUrl);
    if (!source) throw new Error("This property is not available for STR evaluation.");
    return Object.freeze({ source, evidence: assembleStrPotentialEvidence({
      listingUrl: source.listingUrl, property: source.property, snapshot: source.snapshot,
      financialAnalysis: source.financialAnalysis, comparableRows: source.comparables,
    }) });
  }

  async findFresh(listingUrl: string, now = new Date()): Promise<SavedStrPotentialEvaluation | undefined> {
    const { source } = await this.assembleEvidence(listingUrl);
    const row = await this.store.findLatest(source.canonicalPropertyId);
    if (!row || Date.parse(String(row.expires_at ?? "")) <= now.getTime()) return undefined;
    return savedFromRow(row, true);
  }

  async save(params: Readonly<{ source: ResolvedStrPotentialSource; evidence: StrPotentialEvidence; evaluation: StrPotentialEvaluation }>): Promise<SavedStrPotentialEvaluation> {
    const version = await this.store.nextVersion(params.source.canonicalPropertyId);
    const evaluatedAt = params.evaluation.evaluatedAt;
    const expiresAt = new Date(Date.parse(evaluatedAt) + 30 * 86_400_000).toISOString();
    const row = await this.store.insert({
      canonical_property_id: params.source.canonicalPropertyId,
      listing_snapshot_id: params.source.listingSnapshotId,
      financial_analysis_run_id: params.source.financialAnalysisRunId ?? null,
      evaluation_version: version,
      status: params.evaluation.status,
      evidence_snapshot: params.evidence,
      evaluation_snapshot: params.evaluation,
      provider: params.evaluation.model.provider,
      model: params.evaluation.model.model,
      prompt_version: params.evaluation.model.promptVersion,
      evaluated_at: evaluatedAt,
      expires_at: expiresAt,
    });
    return savedFromRow(row, true) ?? Object.freeze({ property: params.evidence.property, evaluation: params.evaluation, savedAt: evaluatedAt, isFresh: true });
  }
}

export class SupabaseStrPotentialStore implements StrPotentialStore {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async resolve(listingUrl: string): Promise<ResolvedStrPotentialSource | undefined> {
    const { data: mapping, error } = await this.client.from("property_source_ids").select("canonical_property_id").eq("external_url", listingUrl).limit(1).maybeSingle();
    if (error) throw new Error("Unable to resolve the selected property.");
    if (!mapping) return undefined;
    const canonicalPropertyId = String(mapping.canonical_property_id);
    const [{ data: property, error: propertyError }, { data: snapshot, error: snapshotError }, { data: financial, error: financialError }, { data: run, error: runError }] = await Promise.all([
      this.client.from("canonical_properties").select("address_line1,city,state,zip_code,current_use,beds,baths,building_sqft,lot_sqft").eq("id", canonicalPropertyId).single(),
      this.client.from("listing_snapshots").select("*").eq("canonical_property_id", canonicalPropertyId).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
      this.client.from("str_analysis_runs").select("id,renovation_budget,assumptions_snapshot").eq("canonical_property_id", canonicalPropertyId).order("analysis_version", { ascending: false }).limit(1).maybeSingle(),
      this.client.from("str_comparison_runs").select("id").eq("canonical_property_id", canonicalPropertyId).in("status", ["discovered", "enriched", "partial"]).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (propertyError || snapshotError || financialError || runError) throw new Error("Unable to assemble property evidence.");
    if (!property || !snapshot) return undefined;
    let comparables: Row[] = [];
    if (run?.id) {
      const { data, error: comparableError } = await this.client.from("str_comparison_candidates").select("property_type,room_type,bedrooms,guest_capacity,amenities").eq("comparison_run_id", run.id).order("similarity_score", { ascending: false }).limit(5);
      if (comparableError) throw new Error("Unable to load comparable characteristics.");
      comparables = data ?? [];
    }
    return Object.freeze({ canonicalPropertyId, listingSnapshotId: String(snapshot.id), ...(financial?.id ? { financialAnalysisRunId: String(financial.id) } : {}), listingUrl: String(snapshot.listing_url ?? listingUrl), property, snapshot, ...(financial ? { financialAnalysis: financial } : {}), comparables });
  }

  async findLatest(canonicalPropertyId: string): Promise<Row | undefined> { const { data, error } = await this.client.from("str_potential_evaluations").select("*").eq("canonical_property_id", canonicalPropertyId).order("evaluation_version", { ascending: false }).limit(1).maybeSingle(); if (error) throw new Error("Unable to load the saved STR evaluation."); return data ?? undefined; }
  async nextVersion(canonicalPropertyId: string): Promise<number> { const row = await this.findLatest(canonicalPropertyId); return Number(row?.evaluation_version ?? 0) + 1; }
  async insert(row: Row): Promise<Row> { const { data, error } = await this.client.from("str_potential_evaluations").insert(row).select("*").single(); if (error || !data) throw new Error("Unable to save the STR evaluation."); return data; }
}

function savedFromRow(row: Row, isFresh: boolean): SavedStrPotentialEvaluation | undefined {
  const evidence = object(row.evidence_snapshot) as unknown as StrPotentialEvidence;
  const evaluation = object(row.evaluation_snapshot) as unknown as StrPotentialEvaluation;
  const savedAt = typeof row.created_at === "string" ? row.created_at : typeof row.evaluated_at === "string" ? row.evaluated_at : undefined;
  if (!savedAt || !isPublicZillowUrl(evidence.property?.listingUrl) || !["completed", "insufficient_evidence"].includes(evaluation.status)) return undefined;
  return Object.freeze({ property: structuredClone(evidence.property), evaluation: structuredClone(evaluation), savedAt, isFresh });
}
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function isPublicZillowUrl(value: unknown): value is string { try { const url = new URL(String(value)); return url.protocol === "https:" && (url.hostname === "zillow.com" || url.hostname.endsWith(".zillow.com")); } catch { return false; } }
