import { strict as assert } from "node:assert";
import test from "node:test";
import { createFinancialAssumptions } from "./financial-assumptions.js";
import {
  FINANCIAL_CALCULATOR_METHODOLOGY_VERSION,
  InvalidFinancialAssumptionsError,
  calculateBaseCaseFinancials,
} from "./financial-calculator.js";

const STANDARD_ASSUMPTIONS = createFinancialAssumptions({
  purchasePriceUsd: 400_000,
  downPaymentPercent: 20,
  annualInterestRatePercent: 6,
  loanTermYears: 30,
  closingCostsUsd: 12_000,
  improvementBudgetUsd: 40_000,
  furnishingSetupCostUsd: 10_000,
  expectedAdrUsd: 250,
  expectedOccupancyPercent: 50,
  averageStayNights: 3.65,
  cleaningFeeChargedUsd: 150,
  cleaningCostUsd: 120,
  guestPlatformFeePercent: 3,
  transientOccupancyTaxPercent: 9,
  managementFeePercent: 20,
  maintenanceReservePercent: 5,
  propertyTaxRatePercent: 1,
  annualInsuranceUsd: 1_800,
  monthlyMiscUtilitiesUsd: 500,
  annualHoaUsd: 0,
  annualOtherOperatingCostsUsd: 1_000,
});

test("calculates the standard financed base case without early rounding", () => {
  const result = calculateBaseCaseFinancials(STANDARD_ASSUMPTIONS);

  assert.equal(result.methodologyVersion, FINANCIAL_CALCULATOR_METHODOLOGY_VERSION);
  assert.equal(result.acquisition.downPaymentUsd, 80_000);
  assert.equal(result.financing.loanPrincipalUsd, 320_000);
  closeTo(result.financing.monthlyMortgagePaymentUsd, 1_918.5616804888);
  closeTo(result.financing.annualMortgagePaymentsUsd, 23_022.7401658659);
  assert.equal(result.acquisition.totalCashInvestedUsd, 142_000);
  assert.equal(result.revenue.occupiedNights, 182.5);
  assert.equal(result.revenue.guestStays, 50);
  assert.equal(result.revenue.roomRevenueUsd, 45_625);
  assert.equal(result.revenue.cleaningFeeRevenueUsd, 7_500);
  assert.equal(result.revenue.grossBookingRevenueUsd, 53_125);
  assert.equal(result.guestCharges.cleaningFeesChargedUsd, 7_500);
  assert.equal(result.guestCharges.guestPlatformFeesUsd, 1_593.75);
  assert.equal(result.guestCharges.transientOccupancyTaxUsd, 4_781.25);
  assert.equal(result.guestCharges.totalGuestPaidChargesUsd, 13_875);
  closeTo(result.guestCharges.nightlyEstimate.roomAdrUsd, 250);
  closeTo(result.guestCharges.nightlyEstimate.cleaningFeeAllocationUsd, 150 / 3.65);
  closeTo(result.guestCharges.nightlyEstimate.bookingSubtotalUsd, 250 + 150 / 3.65);
  closeTo(result.guestCharges.nightlyEstimate.guestPlatformFeeUsd, (250 + 150 / 3.65) * 0.03);
  closeTo(result.guestCharges.nightlyEstimate.transientOccupancyTaxUsd, (250 + 150 / 3.65) * 0.09);
  closeTo(result.guestCharges.nightlyEstimate.estimatedGuestPaidTotalUsd, (250 + 150 / 3.65) * 1.12);
  assert.equal(result.expenses.propertyTaxExpenseUsd, 4_000);
  assert.equal(result.expenses.homeInsuranceExpenseUsd, 1_800);
  assert.equal(result.expenses.miscellaneousUtilitiesExpenseUsd, 6_000);
  assert.equal(result.expenses.annualHoaExpenseUsd, 0);
  assert.equal(result.expenses.otherOperatingExpensesUsd, 1_000);
  assert.equal(result.expenses.fixedOperatingExpensesUsd, 12_800);
  assert.equal(result.expenses.variableOperatingExpensesUsd, 19_281.25);
  assert.equal(result.expenses.totalOperatingExpensesUsd, 32_081.25);
  assert.equal(result.returns.netOperatingIncomeUsd, 21_043.75);
  closeTo(result.returns.annualPreTaxCashFlowUsd, -1_978.9901658659);
  closeTo(result.returns.cashOnCashReturnRatio, -0.013936550463844366);
  closeTo(result.returns.capRateRatio, 0.052609375);
  closeTo(result.returns.debtServiceCoverageRatio, 0.9140419362939268);
  closeTo(result.returns.breakEvenOccupancyRatio, 0.5292371584984799);
  assert.equal(result.returns.breakEvenOccupancyUnachievable, false);
});

test("handles an all-cash purchase with unavailable DSCR", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions({ downPaymentPercent: 100 }));
  assert.equal(result.financing.loanPrincipalUsd, 0);
  assert.equal(result.financing.monthlyMortgagePaymentUsd, 0);
  assert.equal(result.financing.annualMortgagePaymentsUsd, 0);
  assert.equal(result.returns.debtServiceCoverageRatio, null);
});

test("derives property tax from purchase price and editable rate", () => {
  const base = calculateBaseCaseFinancials(createFinancialAssumptions({
    purchasePriceUsd: 327_000,
    propertyTaxRatePercent: 1,
  }));
  const higherRate = calculateBaseCaseFinancials(createFinancialAssumptions({
    purchasePriceUsd: 327_000,
    propertyTaxRatePercent: 1.25,
  }));

  assert.equal(base.expenses.propertyTaxExpenseUsd, 3_270);
  assert.equal(higherRate.expenses.propertyTaxExpenseUsd, 4_087.5);
});

test("annualizes monthly miscellaneous utilities and sums the fixed breakdown exactly", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions({
    purchasePriceUsd: 327_000,
    propertyTaxRatePercent: 1,
    annualInsuranceUsd: 2_400,
    monthlyMiscUtilitiesUsd: 725,
    annualHoaUsd: 600,
    annualOtherOperatingCostsUsd: 900,
  }));

  assert.equal(result.expenses.miscellaneousUtilitiesExpenseUsd, 8_700);
  assert.equal(result.expenses.fixedOperatingExpensesUsd, 3_270 + 2_400 + 8_700 + 600 + 900);
});

test("amortizes zero-interest financing evenly", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions({
    purchasePriceUsd: 120_000,
    downPaymentPercent: 0,
    annualInterestRatePercent: 0,
    loanTermYears: 10,
  }));
  assert.equal(result.financing.loanPrincipalUsd, 120_000);
  assert.equal(result.financing.monthlyMortgagePaymentUsd, 1_000);
});

test("zero occupancy produces no booking revenue or variable expenses", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions({ expectedOccupancyPercent: 0 }));
  assert.equal(result.revenue.occupiedNights, 0);
  assert.equal(result.revenue.guestStays, 0);
  assert.equal(result.revenue.grossBookingRevenueUsd, 0);
  assert.equal(result.expenses.variableOperatingExpensesUsd, 0);
  assert.equal(result.returns.netOperatingIncomeUsd, -result.expenses.fixedOperatingExpensesUsd);
});

test("keeps cleaning revenue and a larger cleaning expense separate", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions({
    expectedOccupancyPercent: 10,
    averageStayNights: 3.65,
    cleaningFeeChargedUsd: 100,
    cleaningCostUsd: 140,
  }));
  assert.equal(result.revenue.guestStays, 10);
  assert.equal(result.revenue.cleaningFeeRevenueUsd, 1_000);
  assert.equal(result.expenses.cleaningExpenseUsd, 1_400);
});

test("keeps guest-paid platform fees and TOT outside owner financials", () => {
  const noGuestSurcharges = calculateBaseCaseFinancials(createFinancialAssumptions({
    guestPlatformFeePercent: 0,
    transientOccupancyTaxPercent: 0,
  }));
  const withGuestSurcharges = calculateBaseCaseFinancials(createFinancialAssumptions({
    guestPlatformFeePercent: 14.2,
    transientOccupancyTaxPercent: 12,
  }));

  assert.deepEqual(withGuestSurcharges.revenue, noGuestSurcharges.revenue);
  assert.deepEqual(withGuestSurcharges.expenses, noGuestSurcharges.expenses);
  assert.deepEqual(withGuestSurcharges.returns, noGuestSurcharges.returns);
  assert.notDeepEqual(withGuestSurcharges.guestCharges, noGuestSurcharges.guestCharges);
  assert.equal("platformExpenseUsd" in withGuestSurcharges.expenses, false);
});

test("calculates guest-paid charges from the documented booking subtotal", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions({
    expectedOccupancyPercent: 10,
    expectedAdrUsd: 200,
    averageStayNights: 3.65,
    cleaningFeeChargedUsd: 100,
    guestPlatformFeePercent: 5,
    transientOccupancyTaxPercent: 10,
  }));

  assert.equal(result.revenue.roomRevenueUsd, 7_300);
  assert.equal(result.revenue.cleaningFeeRevenueUsd, 1_000);
  assert.equal(result.revenue.grossBookingRevenueUsd, 8_300);
  assert.equal(result.guestCharges.cleaningFeesChargedUsd, 1_000);
  assert.equal(result.guestCharges.guestPlatformFeesUsd, 415);
  assert.equal(result.guestCharges.transientOccupancyTaxUsd, 830);
  assert.equal(result.guestCharges.totalGuestPaidChargesUsd, 2_245);
  closeTo(result.guestCharges.nightlyEstimate.estimatedGuestPaidTotalUsd, (200 + 100 / 3.65) * 1.15);
});

test("calculates the default estimated guest-paid nightly total with a 15% platform fee", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions());

  assert.equal(result.guestCharges.nightlyEstimate.roomAdrUsd, 250);
  assert.equal(result.guestCharges.nightlyEstimate.averageStayNights, 3);
  assert.equal(result.guestCharges.nightlyEstimate.cleaningFeeAllocationUsd, 50);
  assert.equal(result.guestCharges.nightlyEstimate.bookingSubtotalUsd, 300);
  assert.equal(result.guestCharges.nightlyEstimate.guestPlatformFeeUsd, 45);
  assert.equal(result.guestCharges.nightlyEstimate.transientOccupancyTaxUsd, 27);
  assert.equal(result.guestCharges.nightlyEstimate.estimatedGuestPaidTotalUsd, 372);
});

test("returns null cash-on-cash when no cash is invested", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions({
    downPaymentPercent: 0,
    closingCostsUsd: 0,
    improvementBudgetUsd: 0,
    furnishingSetupCostUsd: 0,
  }));
  assert.equal(result.acquisition.totalCashInvestedUsd, 0);
  assert.equal(result.returns.cashOnCashReturnRatio, null);
});

test("returns unavailable break-even occupancy for nonpositive contribution", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions({
    managementFeePercent: 100,
    maintenanceReservePercent: 100,
  }));
  assert.equal(result.returns.breakEvenOccupancyRatio, null);
  assert.equal(result.returns.breakEvenOccupancyUnachievable, false);
});

test("preserves break-even ratios above capacity and flags them", () => {
  const result = calculateBaseCaseFinancials(createFinancialAssumptions({
    expectedAdrUsd: 50,
    annualOtherOperatingCostsUsd: 100_000,
  }));
  assert.ok(result.returns.breakEvenOccupancyRatio !== null);
  assert.ok(result.returns.breakEvenOccupancyRatio > 1);
  assert.equal(result.returns.breakEvenOccupancyUnachievable, true);
});

test("validates assumptions and exposes only safe validation details", () => {
  const invalid = { ...STANDARD_ASSUMPTIONS, purchasePriceUsd: 0 };
  assert.throws(
    () => calculateBaseCaseFinancials(invalid),
    (error) => error instanceof InvalidFinancialAssumptionsError
      && error.message === "Purchase price must be greater than $0."
      && error.validationErrors[0]?.field === "purchasePriceUsd",
  );
});

test("does not mutate inputs and deeply freezes each result", () => {
  const input = { ...STANDARD_ASSUMPTIONS };
  const before = { ...input };
  const first = calculateBaseCaseFinancials(input);
  const second = calculateBaseCaseFinancials(input);

  assert.deepEqual(input, before);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.revenue, second.revenue);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.acquisition), true);
  assert.equal(Object.isFrozen(first.financing), true);
  assert.equal(Object.isFrozen(first.revenue), true);
  assert.equal(Object.isFrozen(first.guestCharges), true);
  assert.equal(Object.isFrozen(first.guestCharges.nightlyEstimate), true);
  assert.equal(Object.isFrozen(first.expenses), true);
  assert.equal(Object.isFrozen(first.returns), true);
});

function closeTo(actual: number | null, expected: number, tolerance = 1e-10) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) <= tolerance, `${actual} is not close to ${expected}`);
}
