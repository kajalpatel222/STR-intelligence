export type AttentionMode = "strict" | "flexible";

export const DEFAULT_INVESTMENT_CRITERIA = {
  minimumPurchaseBudget: 350_000,
  maximumPurchaseBudget: 400_000,
  maximumImprovementReserve: 40_000,
  mode: "flexible" as AttentionMode,
} as const;

export function formatCriteriaCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
