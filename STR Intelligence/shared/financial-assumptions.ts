export type FinancialAssumptions = Readonly<{
  purchasePriceUsd: number;
  improvementBudgetUsd: number;
  furnishingSetupCostUsd: number;
  closingCostsUsd: number;
  downPaymentPercent: number;
  annualInterestRatePercent: number;
  loanTermYears: number;
  expectedAdrUsd: number;
  expectedOccupancyPercent: number;
  averageStayNights: number;
  cleaningFeeChargedUsd: number;
  cleaningCostUsd: number;
  guestPlatformFeePercent: number;
  transientOccupancyTaxPercent: number;
  propertyTaxRatePercent: number;
  annualInsuranceUsd: number;
  monthlyMiscUtilitiesUsd: number;
  annualHoaUsd: number;
  maintenanceReservePercent: number;
  managementFeePercent: number;
  annualOtherOperatingCostsUsd: number;
}>;

export type FinancialAssumptionsField = keyof FinancialAssumptions;

export type FinancialAssumptionsValidationError = Readonly<{
  field: FinancialAssumptionsField | "assumptions";
  message: string;
}>;

export type FinancialAssumptionsValidationResult =
  | Readonly<{ ok: true; value: FinancialAssumptions }>
  | Readonly<{ ok: false; errors: readonly FinancialAssumptionsValidationError[] }>;

// These are editable starting points, not market claims or underwriting conclusions.
export const DEFAULT_FINANCIAL_ASSUMPTIONS: FinancialAssumptions = Object.freeze({
  purchasePriceUsd: 400_000,
  improvementBudgetUsd: 40_000,
  furnishingSetupCostUsd: 10_000,
  closingCostsUsd: 12_000,
  downPaymentPercent: 30,
  annualInterestRatePercent: 7,
  loanTermYears: 30,
  expectedAdrUsd: 250,
  expectedOccupancyPercent: 50,
  averageStayNights: 3,
  cleaningFeeChargedUsd: 150,
  cleaningCostUsd: 150,
  guestPlatformFeePercent: 15,
  transientOccupancyTaxPercent: 9,
  propertyTaxRatePercent: 1.1,
  annualInsuranceUsd: 8_000,
  monthlyMiscUtilitiesUsd: 800,
  annualHoaUsd: 0,
  maintenanceReservePercent: 5,
  managementFeePercent: 0,
  annualOtherOperatingCostsUsd: 0,
});

const MONEY_FIELDS = {
  improvementBudgetUsd: "Improvement budget",
  furnishingSetupCostUsd: "Furnishing and setup cost",
  closingCostsUsd: "Closing costs",
  cleaningFeeChargedUsd: "Cleaning fee charged",
  cleaningCostUsd: "Cleaning cost",
  annualInsuranceUsd: "Annual insurance",
  monthlyMiscUtilitiesUsd: "Monthly miscellaneous utilities",
  annualHoaUsd: "Annual HOA cost",
  annualOtherOperatingCostsUsd: "Annual other operating costs",
} as const satisfies Partial<Record<FinancialAssumptionsField, string>>;

const PERCENT_FIELDS = {
  downPaymentPercent: "Down payment",
  annualInterestRatePercent: "Annual interest rate",
  expectedOccupancyPercent: "Expected occupancy",
  guestPlatformFeePercent: "Guest platform fee",
  transientOccupancyTaxPercent: "Transient occupancy tax",
  propertyTaxRatePercent: "Property tax rate",
  maintenanceReservePercent: "Maintenance reserve",
  managementFeePercent: "Management fee",
} as const satisfies Partial<Record<FinancialAssumptionsField, string>>;

export function validateFinancialAssumptions(input: unknown): FinancialAssumptionsValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      errors: Object.freeze([{ field: "assumptions", message: "Financial assumptions are required." }]),
    };
  }

  const candidate = input as Record<string, unknown>;
  const errors: FinancialAssumptionsValidationError[] = [];

  positiveMoney(candidate.purchasePriceUsd, "purchasePriceUsd", "Purchase price", errors);
  positiveMoney(candidate.expectedAdrUsd, "expectedAdrUsd", "Expected ADR", errors);

  for (const [field, label] of Object.entries(MONEY_FIELDS) as [keyof typeof MONEY_FIELDS, string][]) {
    nonNegativeMoney(candidate[field], field, label, errors);
  }
  for (const [field, label] of Object.entries(PERCENT_FIELDS) as [keyof typeof PERCENT_FIELDS, string][]) {
    percentage(candidate[field], field, label, errors);
  }

  positiveWholeNumber(candidate.loanTermYears, "loanTermYears", "Loan term", 50, errors);
  positiveNumber(candidate.averageStayNights, "averageStayNights", "Average stay", 365, errors);

  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze(errors.map((error) => Object.freeze(error))) };
  }

  return { ok: true, value: freezeSnapshot(candidate as FinancialAssumptions) };
}

export function createFinancialAssumptions(
  overrides: Partial<FinancialAssumptions> = {},
): FinancialAssumptions {
  return createFinancialAssumptionsSnapshot({ ...DEFAULT_FINANCIAL_ASSUMPTIONS, ...overrides });
}

export function createFinancialAssumptionsSnapshot(input: FinancialAssumptions): FinancialAssumptions {
  const result = validateFinancialAssumptions(input);
  if ("errors" in result) {
    throw new Error(result.errors[0]?.message ?? "Financial assumptions are invalid.");
  }
  return result.value;
}

function freezeSnapshot(input: FinancialAssumptions): FinancialAssumptions {
  return Object.freeze({
    purchasePriceUsd: input.purchasePriceUsd,
    improvementBudgetUsd: input.improvementBudgetUsd,
    furnishingSetupCostUsd: input.furnishingSetupCostUsd,
    closingCostsUsd: input.closingCostsUsd,
    downPaymentPercent: input.downPaymentPercent,
    annualInterestRatePercent: input.annualInterestRatePercent,
    loanTermYears: input.loanTermYears,
    expectedAdrUsd: input.expectedAdrUsd,
    expectedOccupancyPercent: input.expectedOccupancyPercent,
    averageStayNights: input.averageStayNights,
    cleaningFeeChargedUsd: input.cleaningFeeChargedUsd,
    cleaningCostUsd: input.cleaningCostUsd,
    guestPlatformFeePercent: input.guestPlatformFeePercent,
    transientOccupancyTaxPercent: input.transientOccupancyTaxPercent,
    propertyTaxRatePercent: input.propertyTaxRatePercent,
    annualInsuranceUsd: input.annualInsuranceUsd,
    monthlyMiscUtilitiesUsd: input.monthlyMiscUtilitiesUsd,
    annualHoaUsd: input.annualHoaUsd,
    maintenanceReservePercent: input.maintenanceReservePercent,
    managementFeePercent: input.managementFeePercent,
    annualOtherOperatingCostsUsd: input.annualOtherOperatingCostsUsd,
  });
}

function positiveMoney(
  value: unknown,
  field: FinancialAssumptionsField,
  label: string,
  errors: FinancialAssumptionsValidationError[],
) {
  if (!isFiniteNumber(value) || value <= 0) {
    errors.push({ field, message: `${label} must be greater than $0.` });
  }
}

function nonNegativeMoney(
  value: unknown,
  field: FinancialAssumptionsField,
  label: string,
  errors: FinancialAssumptionsValidationError[],
) {
  if (!isFiniteNumber(value) || value < 0) {
    errors.push({ field, message: `${label} must be a non-negative USD amount.` });
  }
}

function percentage(
  value: unknown,
  field: FinancialAssumptionsField,
  label: string,
  errors: FinancialAssumptionsValidationError[],
) {
  if (!isFiniteNumber(value) || value < 0 || value > 100) {
    errors.push({ field, message: `${label} must be between 0% and 100%.` });
  }
}

function positiveWholeNumber(
  value: unknown,
  field: FinancialAssumptionsField,
  label: string,
  maximum: number,
  errors: FinancialAssumptionsValidationError[],
) {
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 1 || value > maximum) {
    errors.push({ field, message: `${label} must be a whole number from 1 to ${maximum} years.` });
  }
}

function positiveNumber(
  value: unknown,
  field: FinancialAssumptionsField,
  label: string,
  maximum: number,
  errors: FinancialAssumptionsValidationError[],
) {
  if (!isFiniteNumber(value) || value <= 0 || value > maximum) {
    errors.push({ field, message: `${label} must be greater than 0 and no more than ${maximum} nights.` });
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
