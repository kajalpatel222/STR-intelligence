import type { StrRevenueEstimate } from "../../../shared/str-revenue-estimate.js";

export type AirbticsPropertyInput = Readonly<{
  latitude: number;
  longitude: number;
  bedrooms: number;
  bathrooms: number;
  accommodates: number;
}>;

export interface StrRevenueEstimateProvider {
  startSummary(input: AirbticsPropertyInput): Promise<string>;
  readSummary(providerReference: string): Promise<AirbticsReportResult>;
}

export type AirbticsReportResult =
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "failed"; reason: "provider_failed" | "unexpected_response" }>
  | Readonly<{ status: "complete"; estimate: Omit<StrRevenueEstimate, "collectedAt" | "expiresAt" | "freshness">; rawPayload: unknown }>;

export class AirbticsProvider implements StrRevenueEstimateProvider {
  constructor(private readonly options: Readonly<{ apiKey: string; fetcher?: typeof fetch; baseUrl?: string; timeoutMs?: number }>) {}

  async startSummary(input: AirbticsPropertyInput) {
    const fetcher = this.options.fetcher ?? fetch;
    const baseUrl = this.options.baseUrl ?? "https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod";
    const created = await request(fetcher, `${baseUrl}/report/summary`, this.options.apiKey, { method: "POST", body: JSON.stringify(input) });
    const providerReference = textAt(created, ["message", "report_id"]);
    if (!providerReference) throw new Error("Airbtics did not return a report reference.");
    return providerReference;
  }

  async readSummary(providerReference: string): Promise<AirbticsReportResult> {
    const fetcher = this.options.fetcher ?? fetch;
    const baseUrl = this.options.baseUrl ?? "https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod";
    const report = await request(fetcher, `${baseUrl}/report?id=${encodeURIComponent(providerReference)}`, this.options.apiKey, { method: "GET" }, true);
    if (!report) return Object.freeze({ status: "pending" });
    const estimate = normalizeReport(report);
    if (estimate) return Object.freeze({ status: "complete", estimate, rawPayload: report });
    const state = providerState(report);
    if (state === "pending") return Object.freeze({ status: "pending" });
    if (state === "failed") return Object.freeze({ status: "failed", reason: "provider_failed" });
    // A successful but unknown payload must not be silently treated as pending forever.
    return Object.freeze({ status: "failed", reason: "unexpected_response" });
  }
}

async function request(fetcher: typeof fetch, url: string, apiKey: string, init: RequestInit, toleratePending = false) {
  const response = await fetcher(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": apiKey } });
  if (!response.ok) {
    if (toleratePending && [404, 409, 425, 429, 500, 502, 503, 504].includes(response.status)) return undefined;
    throw new Error(`Airbtics request failed with status ${response.status}.`);
  }
  return await response.json() as unknown;
}

export function normalizeReport(payload: unknown) {
  const records = collectRecords(payload);
  const adr = firstNumber(records, ["estimated_adr", "estimatedAdr", "adr", "average_daily_rate", "daily_rate", "nightly_rate", "averageDailyRate"]);
  const occupancy = firstNumber(records, ["estimated_occupancy", "estimatedOccupancy", "occupancy", "occupancy_rate", "occupancyRate"]);
  const revenue = firstNumber(records, ["estimated_annual_revenue", "estimatedAnnualRevenue", "annual_revenue", "annualRevenue", "revenue"]);
  if (!positive(adr) || !positive(revenue) || !Number.isFinite(occupancy) || occupancy! < 0) return undefined;
  const occupancyPercent = occupancy! <= 1 ? occupancy! * 100 : occupancy!;
  if (occupancyPercent > 100) return undefined;
  const comparableCount = firstNumber(records, ["comparable_count", "comparableCount", "comps_count", "number_of_comps"]);
  return Object.freeze({ estimatedAdrUsd: adr!, estimatedOccupancyPercent: occupancyPercent, estimatedAnnualRevenueUsd: revenue!, ...(comparableCount !== undefined ? { comparableCount: Math.max(0, Math.trunc(comparableCount)) } : {}) });
}

function collectRecords(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5 || value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectRecords(item, depth + 1));
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap((item) => collectRecords(item, depth + 1))];
}
function providerState(value: unknown): "pending" | "failed" | undefined {
  const records = collectRecords(value);
  for (const record of records) for (const key of ["status", "state", "job_status", "report_status"]) {
    const value = typeof record[key] === "string" ? record[key].toLowerCase() : "";
    if (/pending|processing|queued|running|preparing/.test(value)) return "pending";
    if (/failed|error|cancelled|canceled|invalid/.test(value)) return "failed";
  }
  return undefined;
}
function firstNumber(records: readonly Record<string, unknown>[], keys: readonly string[]) { for (const record of records) for (const key of keys) { const value = numeric(record[key]); if (value !== undefined) return value; } return undefined; }
function numeric(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string") { const parsed = Number(value.replace(/[$,%\s,]/g, "")); return Number.isFinite(parsed) ? parsed : undefined; } return undefined; }
function textAt(value: unknown, path: readonly string[]) { let current: unknown = value; for (const key of path) { if (!current || typeof current !== "object") return undefined; current = (current as Record<string, unknown>)[key]; } return typeof current === "string" && current ? current : undefined; }
function positive(value: number | undefined) { return value !== undefined && Number.isFinite(value) && value > 0; }
