export const AIRBTICS_SUMMARY_COST_USD = 0.10;

export type StrRevenueEstimate = Readonly<{
  estimatedAdrUsd: number;
  estimatedOccupancyPercent: number;
  estimatedAnnualRevenueUsd: number;
  comparableCount?: number;
  collectedAt: string;
  expiresAt: string;
  freshness: "fresh" | "stale";
}>;

export type StrRevenueEstimateLookup = Readonly<{
  status: "not_requested" | "preparing" | "available" | "failed";
  estimate?: StrRevenueEstimate;
  message?: string;
}>;

export type StrRevenueEstimateRequest = Readonly<{
  listingUrl: string;
  action: "lookup" | "purchase" | "status";
  confirmedCostUsd?: number;
}>;

export function isUsableEstimate(value: unknown): value is Pick<StrRevenueEstimate, "estimatedAdrUsd" | "estimatedOccupancyPercent" | "estimatedAnnualRevenueUsd"> {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return positive(item.estimatedAdrUsd)
    && finiteBetween(item.estimatedOccupancyPercent, 0, 100)
    && positive(item.estimatedAnnualRevenueUsd);
}

function positive(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function finiteBetween(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
