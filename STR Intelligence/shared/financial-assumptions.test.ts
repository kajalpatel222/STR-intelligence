import { strict as assert } from "node:assert";
import test from "node:test";
import {
  DEFAULT_FINANCIAL_ASSUMPTIONS,
  createFinancialAssumptions,
  createFinancialAssumptionsSnapshot,
  validateFinancialAssumptions,
} from "./financial-assumptions.js";

test("creates valid recommended financial assumptions", () => {
  const result = validateFinancialAssumptions(DEFAULT_FINANCIAL_ASSUMPTIONS);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, DEFAULT_FINANCIAL_ASSUMPTIONS);
});

test("creates editable defaults with canonical overrides", () => {
  const assumptions = createFinancialAssumptions({
    purchasePriceUsd: 350_000,
    expectedAdrUsd: 225,
    expectedOccupancyPercent: 45,
  });

  assert.equal(assumptions.purchasePriceUsd, 350_000);
  assert.equal(assumptions.expectedAdrUsd, 225);
  assert.equal(assumptions.expectedOccupancyPercent, 45);
  assert.equal(assumptions.downPaymentPercent, 30);
});

test("returns safe field-specific errors for invalid money", () => {
  const result = validateFinancialAssumptions({
    ...DEFAULT_FINANCIAL_ASSUMPTIONS,
    purchasePriceUsd: 0,
    expectedAdrUsd: Number.NaN,
    annualInsuranceUsd: -1,
    monthlyMiscUtilitiesUsd: -1,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors, [
      { field: "purchasePriceUsd", message: "Purchase price must be greater than $0." },
      { field: "expectedAdrUsd", message: "Expected ADR must be greater than $0." },
      { field: "annualInsuranceUsd", message: "Annual insurance must be a non-negative USD amount." },
      { field: "monthlyMiscUtilitiesUsd", message: "Monthly miscellaneous utilities must be a non-negative USD amount." },
    ]);
  }
});

test("accepts percentage boundaries and rejects values outside them", () => {
  assert.equal(validateFinancialAssumptions({
    ...DEFAULT_FINANCIAL_ASSUMPTIONS,
    downPaymentPercent: 0,
    expectedOccupancyPercent: 100,
    propertyTaxRatePercent: 1,
  }).ok, true);

  const result = validateFinancialAssumptions({
    ...DEFAULT_FINANCIAL_ASSUMPTIONS,
    annualInterestRatePercent: 101,
    managementFeePercent: -0.1,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors.map(({ field }) => field), [
      "annualInterestRatePercent",
      "managementFeePercent",
    ]);
  }
});

test("uses editable percentage tax and monthly utility defaults", () => {
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.propertyTaxRatePercent, 1.1);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.monthlyMiscUtilitiesUsd, 800);
  assert.equal("annualPropertyTaxUsd" in DEFAULT_FINANCIAL_ASSUMPTIONS, false);
  assert.equal("annualUtilitiesUsd" in DEFAULT_FINANCIAL_ASSUMPTIONS, false);
  assert.equal("annualInternetUsd" in DEFAULT_FINANCIAL_ASSUMPTIONS, false);
});

test("uses the approved editable underwriting defaults", () => {
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.downPaymentPercent, 30);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.annualInterestRatePercent, 7);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.loanTermYears, 30);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.furnishingSetupCostUsd, 10_000);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.closingCostsUsd, 12_000);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.annualInsuranceUsd, 8_000);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.cleaningCostUsd, 150);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.guestPlatformFeePercent, 15);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.transientOccupancyTaxPercent, 9);
  assert.equal("platformFeePercent" in DEFAULT_FINANCIAL_ASSUMPTIONS, false);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.managementFeePercent, 0);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.maintenanceReservePercent, 5);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.annualHoaUsd, 0);
  assert.equal(DEFAULT_FINANCIAL_ASSUMPTIONS.annualOtherOperatingCostsUsd, 0);
});

test("validates guest-paid percentage boundaries", () => {
  assert.equal(validateFinancialAssumptions({
    ...DEFAULT_FINANCIAL_ASSUMPTIONS,
    guestPlatformFeePercent: 0,
    transientOccupancyTaxPercent: 100,
  }).ok, true);

  const result = validateFinancialAssumptions({
    ...DEFAULT_FINANCIAL_ASSUMPTIONS,
    guestPlatformFeePercent: -0.1,
    transientOccupancyTaxPercent: 100.1,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors.map(({ field }) => field), [
      "guestPlatformFeePercent",
      "transientOccupancyTaxPercent",
    ]);
  }
});

test("validates loan term and average stay units", () => {
  const result = validateFinancialAssumptions({
    ...DEFAULT_FINANCIAL_ASSUMPTIONS,
    loanTermYears: 30.5,
    averageStayNights: 366,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors, [
      { field: "loanTermYears", message: "Loan term must be a whole number from 1 to 50 years." },
      { field: "averageStayNights", message: "Average stay must be greater than 0 and no more than 365 nights." },
    ]);
  }
});

test("rejects absent and non-object inputs safely", () => {
  for (const input of [null, undefined, [], "invalid"]) {
    const result = validateFinancialAssumptions(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.errors, [
        { field: "assumptions", message: "Financial assumptions are required." },
      ]);
    }
  }
});

test("creates frozen snapshots independent of their inputs", () => {
  const input = { ...DEFAULT_FINANCIAL_ASSUMPTIONS };
  const snapshot = createFinancialAssumptionsSnapshot(input);
  input.purchasePriceUsd = 999_000;

  assert.equal(snapshot.purchasePriceUsd, 400_000);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.notStrictEqual(snapshot, input);
});

test("factories never share snapshot instances", () => {
  const first = createFinancialAssumptions();
  const second = createFinancialAssumptions();

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first, DEFAULT_FINANCIAL_ASSUMPTIONS);
  assert.deepEqual(first, second);
});

test("snapshot creation rejects invalid assumptions", () => {
  assert.throws(
    () => createFinancialAssumptionsSnapshot({
      ...DEFAULT_FINANCIAL_ASSUMPTIONS,
      expectedAdrUsd: 0,
    }),
    /Expected ADR must be greater than \$0/,
  );
});
