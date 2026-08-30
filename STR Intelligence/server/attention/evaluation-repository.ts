import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvestmentCriteria } from "../../shared/investment-criteria.js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";
import { evaluateStoredHomesBatch, type StoredHomeBatchResult } from "./batch-evaluation.js";
import type { InvestmentCriteriaRepository } from "../criteria/repository.js";
import type { StoredHomeRepositoryPort } from "./stored-home-repository.js";

export type AttentionBatchStatus = "succeeded" | "partial" | "failed";

export type AttentionEvaluationOutcomeRow = Readonly<{
  evaluation_run_id: string;
  canonical_property_id: string;
  listing_snapshot_id: string;
  outcome: "evaluated" | "unscorable" | "failed";
  attention_score: number | null;
  confidence_score: number | null;
  priority_band: "review_now" | "promising" | "low_priority" | "ineligible" | null;
  priority_reason_code: string | null;
  priority_reason: string | null;
  category_breakdown: unknown;
  reasons: unknown;
  risk_deductions: unknown;
  strict_limit_violations: unknown;
  explanation: unknown;
  failure_message: string | null;
}>;

export interface AttentionEvaluationStore {
  createRun(criteria: InvestmentCriteria): Promise<string>;
  insertOutcomes(rows: readonly AttentionEvaluationOutcomeRow[]): Promise<void>;
  finishRun(runId: string, result: StoredHomeBatchResult, status: AttentionBatchStatus): Promise<void>;
}

export class AttentionEvaluationRepository {
  constructor(private readonly store: AttentionEvaluationStore = new SupabaseAttentionEvaluationStore()) {}

  async persist(result: StoredHomeBatchResult): Promise<{ runId: string; status: AttentionBatchStatus }> {
    const runId = await this.store.createRun(result.criteria);
    const status = batchStatus(result);
    const rows = [
      ...result.evaluations.map((item): AttentionEvaluationOutcomeRow => ({
        evaluation_run_id: runId,
        canonical_property_id: item.canonicalPropertyId,
        listing_snapshot_id: item.latestSnapshotId,
        outcome: item.evaluation.result.evaluability.status === "evaluable" ? "evaluated" : "unscorable",
        attention_score: item.evaluation.result.attentionScore,
        confidence_score: item.evaluation.result.confidenceScore,
        priority_band: item.evaluation.priority.band,
        priority_reason_code: item.evaluation.priority.reasonCode,
        priority_reason: item.evaluation.priority.reason,
        category_breakdown: item.evaluation.result.categories,
        reasons: item.evaluation.result.reasons,
        risk_deductions: item.evaluation.result.riskDeductions,
        strict_limit_violations: item.evaluation.result.strictLimitViolations,
        explanation: item.evaluation.explanation,
        failure_message: null,
      })),
      ...result.failures.map((failure): AttentionEvaluationOutcomeRow => ({
        evaluation_run_id: runId,
        canonical_property_id: failure.canonicalPropertyId,
        listing_snapshot_id: failure.latestSnapshotId,
        outcome: "failed",
        attention_score: null,
        confidence_score: null,
        priority_band: null,
        priority_reason_code: null,
        priority_reason: null,
        category_breakdown: {},
        reasons: [],
        risk_deductions: [],
        strict_limit_violations: [],
        explanation: {},
        failure_message: failure.message,
      })),
    ];

    if (rows.length) await this.store.insertOutcomes(Object.freeze(rows));
    await this.store.finishRun(runId, result, status);
    return Object.freeze({ runId, status });
  }
}

export async function evaluateAndPersistStoredHomesBatch(dependencies: {
  homes: StoredHomeRepositoryPort;
  criteria: Pick<InvestmentCriteriaRepository, "getDefaults">;
  evaluations: AttentionEvaluationRepository;
}) {
  const result = await evaluateStoredHomesBatch(dependencies);
  const persistence = await dependencies.evaluations.persist(result);
  return Object.freeze({ result, persistence });
}

export class SupabaseAttentionEvaluationStore implements AttentionEvaluationStore {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async createRun(criteria: InvestmentCriteria): Promise<string> {
    const { data, error } = await this.client
      .from("attention_evaluation_runs")
      .insert({ criteria_snapshot: criteria, status: "running" })
      .select("id")
      .single();
    if (error || !data) throw new Error("Unable to create the Attention evaluation run.");
    return String(data.id);
  }

  async insertOutcomes(rows: readonly AttentionEvaluationOutcomeRow[]): Promise<void> {
    // Outcome rows are insert-only so later criteria changes cannot rewrite prior evaluations.
    const { error } = await this.client.from("attention_evaluations").insert([...rows]);
    if (error) throw new Error("Unable to save Attention evaluation outcomes.");
  }

  async finishRun(runId: string, result: StoredHomeBatchResult, status: AttentionBatchStatus): Promise<void> {
    const { error } = await this.client.from("attention_evaluation_runs").update({
      status,
      total_homes: result.totalHomes,
      evaluated_count: result.evaluatedCount,
      unscorable_count: result.unscorableCount,
      failed_count: result.failedCount,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    if (error) throw new Error("Unable to finish the Attention evaluation run.");
  }
}

function batchStatus(result: StoredHomeBatchResult): AttentionBatchStatus {
  if (result.totalHomes > 0 && result.failedCount === result.totalHomes) return "failed";
  if (result.failedCount > 0) return "partial";
  return "succeeded";
}
