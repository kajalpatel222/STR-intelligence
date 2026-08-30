export const ATTENTION_MODES = ["strict", "flexible"] as const;
export type AttentionMode = (typeof ATTENTION_MODES)[number];

export type InvestmentCriteria = Readonly<{
  minimumPurchaseBudgetUsd: number;
  maximumPurchaseBudgetUsd: number;
  maximumImprovementReserveUsd: number;
  mode: AttentionMode;
}>;

export type InvestmentCriteriaValidationError = Readonly<{
  field: keyof InvestmentCriteria | "criteria";
  message: string;
}>;

export const DEFAULT_INVESTMENT_CRITERIA: InvestmentCriteria = Object.freeze({
  minimumPurchaseBudgetUsd: 0,
  maximumPurchaseBudgetUsd: 400_000,
  maximumImprovementReserveUsd: 40_000,
  mode: "flexible",
});

export function validateInvestmentCriteria(input: unknown):
  | { ok: true; value: InvestmentCriteria }
  | { ok: false; errors: InvestmentCriteriaValidationError[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: [{ field: "criteria", message: "Investment criteria are required." }] };
  }

  const candidate = input as Record<string, unknown>;
  const errors: InvestmentCriteriaValidationError[] = [];
  const minimum = money(candidate.minimumPurchaseBudgetUsd, "minimumPurchaseBudgetUsd", "Minimum purchase budget", errors);
  const maximum = money(candidate.maximumPurchaseBudgetUsd, "maximumPurchaseBudgetUsd", "Maximum purchase budget", errors);
  const reserve = money(candidate.maximumImprovementReserveUsd, "maximumImprovementReserveUsd", "Maximum improvement reserve", errors);
  const mode = candidate.mode;

  if (!ATTENTION_MODES.includes(mode as AttentionMode)) {
    errors.push({ field: "mode", message: "Choose Strict or Flexible." });
  }
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    errors.push({ field: "maximumPurchaseBudgetUsd", message: "Maximum purchase budget must be at least the minimum." });
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: Object.freeze({
      minimumPurchaseBudgetUsd: minimum!,
      maximumPurchaseBudgetUsd: maximum!,
      maximumImprovementReserveUsd: reserve!,
      mode: mode as AttentionMode,
    }),
  };
}

export function createInvestmentCriteriaSnapshot(input: InvestmentCriteria): InvestmentCriteria {
  const result = validateInvestmentCriteria(input);
  if (!result.ok) throw new Error(result.errors[0]?.message ?? "Investment criteria are invalid.");
  return result.value;
}

export function formatCriteriaCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function money(
  value: unknown,
  field: keyof InvestmentCriteria,
  label: string,
  errors: InvestmentCriteriaValidationError[],
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push({ field, message: `${label} must be a non-negative amount.` });
    return undefined;
  }
  return value;
}
