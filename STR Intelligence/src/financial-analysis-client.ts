import type {
  SaveFinancialAnalysisRequest,
  SavedFinancialAnalysis,
} from "../shared/financial-analysis.js";
import { validateFinancialAssumptions } from "../shared/financial-assumptions.js";

export async function saveFinancialAnalysis(
  request: SaveFinancialAnalysisRequest,
  fetcher: typeof fetch = fetch,
): Promise<SavedFinancialAnalysis> {
  const response = await fetcher("/api/financial-analyses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
  });
  const body = await response.json() as { analysis?: unknown; message?: string };
  const analysis = normalizeAnalysis(body.analysis);
  if (!response.ok || !analysis) throw new Error(body.message ?? "The financial analysis could not be saved.");
  return analysis;
}

export async function loadFinancialAnalyses(
  fetcher: typeof fetch = fetch,
): Promise<readonly SavedFinancialAnalysis[]> {
  const response = await fetcher("/api/financial-analyses", { headers: { Accept: "application/json" } });
  const body = await response.json() as { analyses?: unknown; message?: string };
  if (!response.ok) throw new Error(body.message ?? "Saved financial analyses could not be loaded.");
  if (!Array.isArray(body.analyses)) throw new Error("The financial dashboard returned an incomplete response.");
  const analyses = body.analyses.flatMap((value) => {
    const analysis = normalizeAnalysis(value);
    return analysis ? [analysis] : [];
  });
  if (analyses.length !== body.analyses.length) throw new Error("The financial dashboard returned an incomplete response.");
  return Object.freeze(analyses);
}

function normalizeAnalysis(value: unknown): SavedFinancialAnalysis | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const property = record(item.property);
  const result = record(item.result);
  const returns = record(result.returns);
  const acquisition = record(result.acquisition);
  const validation = validateFinancialAssumptions(item.assumptions);
  if (!validation.ok
    || !isHttpsUrl(property.listingUrl)
    || typeof property.title !== "string"
    || typeof item.savedAt !== "string"
    || typeof result.methodologyVersion !== "string"
    || !finiteOrNull(returns.cashOnCashReturnRatio)
    || !finite(returns.monthlyPreTaxCashFlowUsd)
    || !finite(acquisition.totalCashInvestedUsd)) return undefined;
  return deepFreezeCopy(item) as SavedFinancialAnalysis;
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
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function finiteOrNull(value: unknown) { return value === null || finite(value); }
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
