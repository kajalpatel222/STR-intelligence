import { AIRBTICS_SUMMARY_COST_USD, type StrRevenueEstimate, type StrRevenueEstimateLookup } from "../shared/str-revenue-estimate.js";

export async function lookupStrRevenueEstimate(listingUrl: string, fetcher: typeof fetch = fetch): Promise<StrRevenueEstimateLookup> {
  return request({ listingUrl, action: "lookup" }, fetcher);
}

export async function purchaseStrRevenueEstimate(listingUrl: string, fetcher: typeof fetch = fetch): Promise<StrRevenueEstimateLookup> {
  return request({ listingUrl, action: "purchase", confirmedCostUsd: AIRBTICS_SUMMARY_COST_USD }, fetcher);
}

export async function checkStrRevenueEstimate(listingUrl: string, fetcher: typeof fetch = fetch): Promise<StrRevenueEstimateLookup> {
  return request({ listingUrl, action: "status" }, fetcher);
}

async function request(body: Record<string, unknown>, fetcher: typeof fetch) {
  const response = await fetcher("/api/str-revenue-estimate", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "The STR estimate is temporarily unavailable.");
  if (payload.status === "not_requested") return Object.freeze({ status: "not_requested" as const });
  if (payload.status === "preparing") return Object.freeze({ status: "preparing" as const });
  if (payload.status === "failed") return Object.freeze({ status: "failed" as const, message: typeof payload.message === "string" ? payload.message : undefined });
  const estimate = normalizeEstimate(payload.estimate);
  if (payload.status !== "available" || !estimate) throw new Error("The STR estimate response was incomplete.");
  return Object.freeze({ status: "available" as const, estimate });
}

function normalizeEstimate(value: unknown): StrRevenueEstimate | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (![item.estimatedAdrUsd, item.estimatedOccupancyPercent, item.estimatedAnnualRevenueUsd].every((entry) => typeof entry === "number" && Number.isFinite(entry))) return undefined;
  if (typeof item.collectedAt !== "string" || typeof item.expiresAt !== "string" || (item.freshness !== "fresh" && item.freshness !== "stale")) return undefined;
  return Object.freeze({ estimatedAdrUsd: item.estimatedAdrUsd as number, estimatedOccupancyPercent: item.estimatedOccupancyPercent as number, estimatedAnnualRevenueUsd: item.estimatedAnnualRevenueUsd as number, ...(typeof item.comparableCount === "number" ? { comparableCount: item.comparableCount } : {}), collectedAt: item.collectedAt, expiresAt: item.expiresAt, freshness: item.freshness });
}
