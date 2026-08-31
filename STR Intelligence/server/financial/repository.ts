import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FinancialPropertySnapshot,
  SaveFinancialAnalysisRequest,
  SavedFinancialAnalysis,
} from "../../shared/financial-analysis.js";
import {
  createFinancialAssumptionsSnapshot,
  validateFinancialAssumptions,
} from "../../shared/financial-assumptions.js";
import {
  calculateBaseCaseFinancials,
  type FinancialCalculationResult,
} from "../../shared/financial-calculator.js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";

type FinancialAnalysisRow = Record<string, unknown>;

export interface FinancialAnalysisStore {
  resolveProperty(listingUrl: string): Promise<Readonly<{
    canonicalPropertyId: string;
    listingSnapshotId?: string;
  }> | undefined>;
  nextVersion(canonicalPropertyId: string): Promise<number>;
  insert(row: FinancialAnalysisRow): Promise<FinancialAnalysisRow>;
  list(limit: number): Promise<readonly FinancialAnalysisRow[]>;
}

export interface FinancialAnalysisRepositoryPort {
  save(request: SaveFinancialAnalysisRequest): Promise<SavedFinancialAnalysis>;
  listLatest(limit?: number): Promise<readonly SavedFinancialAnalysis[]>;
}

export class FinancialAnalysisRepository implements FinancialAnalysisRepositoryPort {
  constructor(private readonly store: FinancialAnalysisStore = new SupabaseFinancialAnalysisStore()) {}

  async save(request: SaveFinancialAnalysisRequest): Promise<SavedFinancialAnalysis> {
    const target = await this.store.resolveProperty(request.property.listingUrl);
    if (!target) throw new Error("This property is not available for financial analysis.");

    const assumptions = createFinancialAssumptionsSnapshot(request.assumptions);
    const result = calculateBaseCaseFinancials(assumptions);
    const property = freezeProperty(request.property);
    const savedAt = new Date().toISOString();
    const version = await this.store.nextVersion(target.canonicalPropertyId);

    const row = await this.store.insert({
      canonical_property_id: target.canonicalPropertyId,
      listing_snapshot_id: target.listingSnapshotId ?? null,
      analysis_version: version,
      model_version: result.methodologyVersion,
      methodology_version: result.methodologyVersion,
      purchase_price: result.acquisition.purchasePriceUsd,
      renovation_budget: result.acquisition.improvementBudgetUsd,
      reserve_budget: 0,
      all_in_cost: result.acquisition.purchasePriceUsd
        + result.acquisition.closingCostsUsd
        + result.acquisition.improvementBudgetUsd
        + result.acquisition.furnishingSetupCostUsd,
      down_payment_pct: assumptions.downPaymentPercent / 100,
      interest_rate: assumptions.annualInterestRatePercent / 100,
      loan_term_years: assumptions.loanTermYears,
      monthly_piti: result.financing.monthlyMortgagePaymentUsd,
      annual_revenue: result.revenue.grossBookingRevenueUsd,
      annual_expenses: result.expenses.totalOperatingExpensesUsd,
      annual_management_expense: result.expenses.managementExpenseUsd,
      cash_on_cash_return: result.returns.cashOnCashReturnRatio,
      monthly_pre_tax_cash_flow: result.returns.monthlyPreTaxCashFlowUsd,
      annual_pre_tax_cash_flow: result.returns.annualPreTaxCashFlowUsd,
      net_operating_income: result.returns.netOperatingIncomeUsd,
      cap_rate: result.returns.capRateRatio,
      break_even_occupancy: result.returns.breakEvenOccupancyRatio,
      total_cash_invested: result.acquisition.totalCashInvestedUsd,
      expected_adr: assumptions.expectedAdrUsd,
      expected_occupancy: assumptions.expectedOccupancyPercent / 100,
      property_snapshot: property,
      assumptions_snapshot: assumptions,
      result_snapshot: result,
      explanation: "Deterministic base-case analysis using user-edited assumptions.",
      source_rationale: "Saved from the STR Intelligence financial workspace.",
      human_review_status: "draft",
      created_at: savedAt,
      updated_at: savedAt,
    });

    return rowToSavedAnalysis(row) ?? freezeSaved({ property, assumptions, result, savedAt });
  }

  async listLatest(limit = 200): Promise<readonly SavedFinancialAnalysis[]> {
    const rows = await this.store.list(Math.min(Math.max(Math.trunc(limit), 1), 500));
    const latest = new Map<string, SavedFinancialAnalysis>();
    for (const row of rows) {
      const propertyId = text(row.canonical_property_id);
      if (!propertyId || latest.has(propertyId)) continue;
      const analysis = rowToSavedAnalysis(row);
      if (analysis) latest.set(propertyId, analysis);
    }
    return Object.freeze([...latest.values()]);
  }
}

export class SupabaseFinancialAnalysisStore implements FinancialAnalysisStore {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async resolveProperty(listingUrl: string) {
    const { data: mapping, error } = await this.client.from("property_source_ids")
      .select("canonical_property_id")
      .eq("external_url", listingUrl)
      .limit(1)
      .maybeSingle();
    if (error || !mapping) return undefined;
    const canonicalPropertyId = String(mapping.canonical_property_id);
    const { data: snapshot, error: snapshotError } = await this.client.from("listing_snapshots")
      .select("id")
      .eq("canonical_property_id", canonicalPropertyId)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapshotError) throw new Error("Unable to resolve the current property snapshot.");
    return Object.freeze({
      canonicalPropertyId,
      ...(snapshot?.id ? { listingSnapshotId: String(snapshot.id) } : {}),
    });
  }

  async nextVersion(canonicalPropertyId: string): Promise<number> {
    const { data, error } = await this.client.from("str_analysis_runs")
      .select("analysis_version")
      .eq("canonical_property_id", canonicalPropertyId)
      .order("analysis_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Unable to prepare the financial analysis version.");
    return Number(data?.analysis_version ?? 0) + 1;
  }

  async insert(row: FinancialAnalysisRow): Promise<FinancialAnalysisRow> {
    const { data, error } = await this.client.from("str_analysis_runs").insert(row).select("*").single();
    if (error || !data) throw new Error("Unable to save the financial analysis.");
    return data;
  }

  async list(limit: number): Promise<readonly FinancialAnalysisRow[]> {
    const { data, error } = await this.client.from("str_analysis_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error("Unable to load saved financial analyses.");
    return data ?? [];
  }
}

export function rowToSavedAnalysis(row: FinancialAnalysisRow): SavedFinancialAnalysis | undefined {
  const propertyValue = record(row.property_snapshot);
  const assumptionsValidation = validateFinancialAssumptions(row.assumptions_snapshot);
  const resultValue = record(row.result_snapshot);
  const savedAt = text(row.created_at);
  if (!savedAt || !isPropertySnapshot(propertyValue) || !assumptionsValidation.ok || !isCalculationResult(resultValue)) return undefined;
  return freezeSaved({
    property: freezeProperty(propertyValue),
    assumptions: assumptionsValidation.value,
    result: deepFreezeCopy(resultValue) as FinancialCalculationResult,
    savedAt,
  });
}

function isPropertySnapshot(value: Record<string, unknown>): value is FinancialPropertySnapshot {
  return isHttpsUrl(value.listingUrl)
    && typeof value.title === "string"
    && value.title.length > 0;
}

function isCalculationResult(value: Record<string, unknown>): value is FinancialCalculationResult {
  const returns = record(value.returns);
  const acquisition = record(value.acquisition);
  return typeof value.methodologyVersion === "string"
    && finiteOrNull(returns.cashOnCashReturnRatio)
    && typeof returns.monthlyPreTaxCashFlowUsd === "number"
    && Number.isFinite(returns.monthlyPreTaxCashFlowUsd)
    && typeof acquisition.totalCashInvestedUsd === "number"
    && Number.isFinite(acquisition.totalCashInvestedUsd);
}

function freezeProperty(property: FinancialPropertySnapshot): FinancialPropertySnapshot {
  return Object.freeze({
    listingUrl: property.listingUrl,
    title: property.title,
    ...(property.address ? { address: property.address } : {}),
    ...(property.location ? { location: property.location } : {}),
    ...(property.imageUrl ? { imageUrl: property.imageUrl } : {}),
    ...(finite(property.priceUsd) ? { priceUsd: property.priceUsd } : {}),
    ...(finite(property.beds) ? { beds: property.beds } : {}),
    ...(finite(property.baths) ? { baths: property.baths } : {}),
    ...(finite(property.livingAreaSqft) ? { livingAreaSqft: property.livingAreaSqft } : {}),
  });
}

function freezeSaved(value: SavedFinancialAnalysis): SavedFinancialAnalysis {
  return Object.freeze(value);
}

function deepFreezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): unknown => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return item;
    for (const child of Object.values(item)) freeze(child);
    return Object.freeze(item);
  };
  return freeze(copy) as T;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown) { return typeof value === "string" && value.length > 0 ? value : undefined; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function finiteOrNull(value: unknown) { return value === null || finite(value); }
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
