import {
  type FinancialAssumptions,
  type FinancialAssumptionsValidationError,
  validateFinancialAssumptions,
} from "./financial-assumptions.js";

export const FINANCIAL_CALCULATOR_METHODOLOGY_VERSION = "base-case-365-v4";

export class InvalidFinancialAssumptionsError extends Error {
  readonly validationErrors: readonly FinancialAssumptionsValidationError[];

  constructor(validationErrors: readonly FinancialAssumptionsValidationError[]) {
    super(validationErrors[0]?.message ?? "Financial assumptions are invalid.");
    this.name = "InvalidFinancialAssumptionsError";
    this.validationErrors = Object.freeze([...validationErrors]);
  }
}

export type FinancialCalculationResult = Readonly<{
  methodologyVersion: typeof FINANCIAL_CALCULATOR_METHODOLOGY_VERSION;
  acquisition: Readonly<{
    purchasePriceUsd: number;
    downPaymentUsd: number;
    closingCostsUsd: number;
    improvementBudgetUsd: number;
    furnishingSetupCostUsd: number;
    totalCashInvestedUsd: number;
  }>;
  financing: Readonly<{
    loanPrincipalUsd: number;
    monthlyMortgagePaymentUsd: number;
    annualMortgagePaymentsUsd: number;
  }>;
  revenue: Readonly<{
    availableNights: 365;
    occupiedNights: number;
    guestStays: number;
    roomRevenueUsd: number;
    cleaningFeeRevenueUsd: number;
    grossBookingRevenueUsd: number;
  }>;
  guestCharges: Readonly<{
    cleaningFeesChargedUsd: number;
    guestPlatformFeesUsd: number;
    transientOccupancyTaxUsd: number;
    totalGuestPaidChargesUsd: number;
    nightlyEstimate: Readonly<{
      averageStayNights: number;
      roomAdrUsd: number;
      cleaningFeeAllocationUsd: number;
      bookingSubtotalUsd: number;
      guestPlatformFeeUsd: number;
      transientOccupancyTaxUsd: number;
      estimatedGuestPaidTotalUsd: number;
    }>;
  }>;
  expenses: Readonly<{
    propertyTaxExpenseUsd: number;
    homeInsuranceExpenseUsd: number;
    miscellaneousUtilitiesExpenseUsd: number;
    annualHoaExpenseUsd: number;
    otherOperatingExpensesUsd: number;
    fixedOperatingExpensesUsd: number;
    cleaningExpenseUsd: number;
    managementExpenseUsd: number;
    maintenanceReserveExpenseUsd: number;
    variableOperatingExpensesUsd: number;
    totalOperatingExpensesUsd: number;
  }>;
  returns: Readonly<{
    netOperatingIncomeUsd: number;
    monthlyPreTaxCashFlowUsd: number;
    annualPreTaxCashFlowUsd: number;
    cashOnCashReturnRatio: number | null;
    capRateRatio: number | null;
    debtServiceCoverageRatio: number | null;
    breakEvenOccupancyRatio: number | null;
    breakEvenOccupancyUnachievable: boolean;
  }>;
}>;

const AVAILABLE_NIGHTS = 365 as const;

export function calculateBaseCaseFinancials(input: FinancialAssumptions): FinancialCalculationResult {
  const validation = validateFinancialAssumptions(input);
  if (!validation.ok) throw new InvalidFinancialAssumptionsError(validation.errors);

  const assumptions = validation.value;
  const downPaymentRatio = assumptions.downPaymentPercent / 100;
  const annualInterestRate = assumptions.annualInterestRatePercent / 100;
  const occupancyRatio = assumptions.expectedOccupancyPercent / 100;
  const guestPlatformFeeRatio = assumptions.guestPlatformFeePercent / 100;
  const transientOccupancyTaxRatio = assumptions.transientOccupancyTaxPercent / 100;
  const managementFeeRatio = assumptions.managementFeePercent / 100;
  const maintenanceReserveRatio = assumptions.maintenanceReservePercent / 100;

  const downPaymentUsd = assumptions.purchasePriceUsd * downPaymentRatio;
  const loanPrincipalUsd = assumptions.purchasePriceUsd - downPaymentUsd;
  const monthlyMortgagePaymentUsd = calculateMonthlyPrincipalAndInterest(
    loanPrincipalUsd,
    annualInterestRate,
    assumptions.loanTermYears,
  );
  const annualMortgagePaymentsUsd = monthlyMortgagePaymentUsd * 12;
  const totalCashInvestedUsd = downPaymentUsd
    + assumptions.closingCostsUsd
    + assumptions.improvementBudgetUsd
    + assumptions.furnishingSetupCostUsd;

  const occupiedNights = AVAILABLE_NIGHTS * occupancyRatio;
  const guestStays = occupiedNights / assumptions.averageStayNights;
  const roomRevenueUsd = occupiedNights * assumptions.expectedAdrUsd;
  const cleaningFeeRevenueUsd = guestStays * assumptions.cleaningFeeChargedUsd;
  const grossBookingRevenueUsd = roomRevenueUsd + cleaningFeeRevenueUsd;

  const cleaningFeeAllocationUsd = assumptions.cleaningFeeChargedUsd / assumptions.averageStayNights;
  const nightlyBookingSubtotalUsd = assumptions.expectedAdrUsd + cleaningFeeAllocationUsd;
  const nightlyGuestPlatformFeeUsd = nightlyBookingSubtotalUsd * guestPlatformFeeRatio;
  const nightlyTransientOccupancyTaxUsd = nightlyBookingSubtotalUsd * transientOccupancyTaxRatio;
  const estimatedGuestPaidNightlyTotalUsd = nightlyBookingSubtotalUsd
    + nightlyGuestPlatformFeeUsd
    + nightlyTransientOccupancyTaxUsd;

  // Guest platform fees and TOT share a deterministic booking subtotal base, but neither is owner revenue or expense.
  const guestPlatformFeesUsd = grossBookingRevenueUsd * guestPlatformFeeRatio;
  const transientOccupancyTaxUsd = grossBookingRevenueUsd * transientOccupancyTaxRatio;
  const totalGuestPaidChargesUsd = cleaningFeeRevenueUsd
    + guestPlatformFeesUsd
    + transientOccupancyTaxUsd;

  const propertyTaxExpenseUsd = assumptions.purchasePriceUsd * assumptions.propertyTaxRatePercent / 100;
  const homeInsuranceExpenseUsd = assumptions.annualInsuranceUsd;
  const miscellaneousUtilitiesExpenseUsd = assumptions.monthlyMiscUtilitiesUsd * 12;
  const annualHoaExpenseUsd = assumptions.annualHoaUsd;
  const otherOperatingExpensesUsd = assumptions.annualOtherOperatingCostsUsd;
  const fixedOperatingExpensesUsd = propertyTaxExpenseUsd
    + homeInsuranceExpenseUsd
    + miscellaneousUtilitiesExpenseUsd
    + annualHoaExpenseUsd
    + otherOperatingExpensesUsd;
  const cleaningExpenseUsd = guestStays * assumptions.cleaningCostUsd;
  const managementExpenseUsd = grossBookingRevenueUsd * managementFeeRatio;
  const maintenanceReserveExpenseUsd = grossBookingRevenueUsd * maintenanceReserveRatio;
  const variableOperatingExpensesUsd = cleaningExpenseUsd
    + managementExpenseUsd
    + maintenanceReserveExpenseUsd;
  const totalOperatingExpensesUsd = fixedOperatingExpensesUsd + variableOperatingExpensesUsd;

  const netOperatingIncomeUsd = grossBookingRevenueUsd - totalOperatingExpensesUsd;
  const annualPreTaxCashFlowUsd = netOperatingIncomeUsd - annualMortgagePaymentsUsd;
  const monthlyPreTaxCashFlowUsd = annualPreTaxCashFlowUsd / 12;
  const cashOnCashReturnRatio = divideOrNull(annualPreTaxCashFlowUsd, totalCashInvestedUsd);
  const capRateRatio = divideOrNull(netOperatingIncomeUsd, assumptions.purchasePriceUsd);
  const debtServiceCoverageRatio = divideOrNull(netOperatingIncomeUsd, annualMortgagePaymentsUsd);

  // This contribution isolates the revenue and variable cost created by one more occupied night.
  const grossRevenuePerOccupiedNight = assumptions.expectedAdrUsd
    + assumptions.cleaningFeeChargedUsd / assumptions.averageStayNights;
  const cleaningCostPerOccupiedNight = assumptions.cleaningCostUsd / assumptions.averageStayNights;
  const contributionPerOccupiedNight = grossRevenuePerOccupiedNight
    * (1 - managementFeeRatio - maintenanceReserveRatio)
    - cleaningCostPerOccupiedNight;
  const breakEvenOccupancyRatio = contributionPerOccupiedNight > 0
      ? (fixedOperatingExpensesUsd + annualMortgagePaymentsUsd)
      / (AVAILABLE_NIGHTS * contributionPerOccupiedNight)
    : null;

  return freezeResult({
    methodologyVersion: FINANCIAL_CALCULATOR_METHODOLOGY_VERSION,
    acquisition: {
      purchasePriceUsd: assumptions.purchasePriceUsd,
      downPaymentUsd,
      closingCostsUsd: assumptions.closingCostsUsd,
      improvementBudgetUsd: assumptions.improvementBudgetUsd,
      furnishingSetupCostUsd: assumptions.furnishingSetupCostUsd,
      totalCashInvestedUsd,
    },
    financing: { loanPrincipalUsd, monthlyMortgagePaymentUsd, annualMortgagePaymentsUsd },
    revenue: {
      availableNights: AVAILABLE_NIGHTS,
      occupiedNights,
      guestStays,
      roomRevenueUsd,
      cleaningFeeRevenueUsd,
      grossBookingRevenueUsd,
    },
    guestCharges: {
      cleaningFeesChargedUsd: cleaningFeeRevenueUsd,
      guestPlatformFeesUsd,
      transientOccupancyTaxUsd,
      totalGuestPaidChargesUsd,
      nightlyEstimate: {
        averageStayNights: assumptions.averageStayNights,
        roomAdrUsd: assumptions.expectedAdrUsd,
        cleaningFeeAllocationUsd,
        bookingSubtotalUsd: nightlyBookingSubtotalUsd,
        guestPlatformFeeUsd: nightlyGuestPlatformFeeUsd,
        transientOccupancyTaxUsd: nightlyTransientOccupancyTaxUsd,
        estimatedGuestPaidTotalUsd: estimatedGuestPaidNightlyTotalUsd,
      },
    },
    expenses: {
      propertyTaxExpenseUsd,
      homeInsuranceExpenseUsd,
      miscellaneousUtilitiesExpenseUsd,
      annualHoaExpenseUsd,
      otherOperatingExpensesUsd,
      fixedOperatingExpensesUsd,
      cleaningExpenseUsd,
      managementExpenseUsd,
      maintenanceReserveExpenseUsd,
      variableOperatingExpensesUsd,
      totalOperatingExpensesUsd,
    },
    returns: {
      netOperatingIncomeUsd,
      monthlyPreTaxCashFlowUsd,
      annualPreTaxCashFlowUsd,
      cashOnCashReturnRatio,
      capRateRatio,
      debtServiceCoverageRatio,
      breakEvenOccupancyRatio,
      breakEvenOccupancyUnachievable: breakEvenOccupancyRatio !== null && breakEvenOccupancyRatio > 1,
    },
  });
}

function calculateMonthlyPrincipalAndInterest(
  principalUsd: number,
  annualInterestRate: number,
  loanTermYears: number,
): number {
  if (principalUsd === 0) return 0;
  const paymentCount = loanTermYears * 12;
  if (annualInterestRate === 0) return principalUsd / paymentCount;

  const monthlyRate = annualInterestRate / 12;
  const growth = (1 + monthlyRate) ** paymentCount;
  return principalUsd * monthlyRate * growth / (growth - 1);
}

function divideOrNull(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function freezeResult(result: FinancialCalculationResult): FinancialCalculationResult {
  Object.freeze(result.acquisition);
  Object.freeze(result.financing);
  Object.freeze(result.revenue);
  Object.freeze(result.guestCharges.nightlyEstimate);
  Object.freeze(result.guestCharges);
  Object.freeze(result.expenses);
  Object.freeze(result.returns);
  return Object.freeze(result);
}
