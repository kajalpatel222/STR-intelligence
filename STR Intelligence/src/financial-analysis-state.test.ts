import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_FINANCIAL_ASSUMPTIONS } from "../shared/financial-assumptions.js";
import {
  createFinancialDraft,
  financialAssumptionsToDraft,
  formatFinancialCurrency,
  formatFinancialDscr,
  formatFinancialRatio,
  getPropertyTaxJurisdiction,
  getTransientOccupancyTaxProfile,
  parseFinancialDraft,
} from "./financial-analysis-state.js";

test("maps supported locations to their property-tax counties", () => {
  assert.deepEqual(getPropertyTaxJurisdiction({ location: "Oakhurst, CA" }), {
    county: "Madera County",
    state: "California",
  });
  assert.deepEqual(getPropertyTaxJurisdiction({ address: "5012 Highway 140, Mariposa, CA" }), {
    county: "Mariposa County",
    state: "California",
  });
  assert.deepEqual(getPropertyTaxJurisdiction({ location: "Fresno, CA" }), {
    county: null,
    state: "California",
  });
});

test("maps supported locations to deterministic transient occupancy tax profiles", () => {
  assert.deepEqual(getTransientOccupancyTaxProfile({ location: "Oakhurst, CA" }), {
    county: "Madera County",
    ratePercent: 9,
    sourceUrl: "https://www.maderacounty.com/government/treasurer-tax-collector/hotel-motel-room-tax",
    sourceLabel: "Madera County hotel/motel room tax",
    statusLabel: "Current county rate · effective 2025",
  });
  assert.deepEqual(getTransientOccupancyTaxProfile({ location: "Mariposa, California" }), {
    county: "Mariposa County",
    ratePercent: 12,
    sourceUrl: "https://www.mariposacounty.org/DocumentCenter/View/64984/FORM-Fill-PDF-Version---TOT-BID-Tax-Return",
    sourceLabel: "Mariposa County TOT/BID tax return",
    statusLabel: "Current county return",
  });
  assert.deepEqual(getTransientOccupancyTaxProfile({ location: "Fresno, CA" }), {
    county: null,
    ratePercent: 9,
    sourceUrl: null,
    sourceLabel: "No county source available",
    statusLabel: "County unavailable · planning default",
  });
});

test("prefills a valid listing price while retaining every non-price default", () => {
  const draft = createFinancialDraft({ title: "Pine Cabin", priceUsd: 327_500 });

  assert.equal(draft.purchasePriceUsd, "327500");
  for (const [field, value] of Object.entries(DEFAULT_FINANCIAL_ASSUMPTIONS)) {
    if (field !== "purchasePriceUsd" && field !== "transientOccupancyTaxPercent") {
      assert.equal(draft[field as keyof typeof draft], String(value), field);
    }
  }
  assert.equal(draft.transientOccupancyTaxPercent, "9");
});

test("prefills location-specific TOT without replacing the listing purchase price", () => {
  const oakhurst = createFinancialDraft({ title: "Oakhurst home", location: "Oakhurst, CA", priceUsd: 327_000 });
  const mariposa = createFinancialDraft({ title: "Mariposa home", location: "Mariposa, CA", priceUsd: 418_500 });
  const unknown = createFinancialDraft({ title: "Unknown county", location: "Fresno, CA", priceUsd: 290_000 });

  assert.deepEqual([oakhurst.purchasePriceUsd, oakhurst.transientOccupancyTaxPercent], ["327000", "9"]);
  assert.deepEqual([mariposa.purchasePriceUsd, mariposa.transientOccupancyTaxPercent], ["418500", "12"]);
  assert.deepEqual([unknown.purchasePriceUsd, unknown.transientOccupancyTaxPercent], ["290000", "9"]);
});

test("falls back to the editable default purchase price for missing or invalid prices", () => {
  for (const priceUsd of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const draft = createFinancialDraft({ title: "Price unavailable", priceUsd });
    assert.equal(draft.purchasePriceUsd, String(DEFAULT_FINANCIAL_ASSUMPTIONS.purchasePriceUsd));
  }
});

test("round-trips decimal string drafts through authoritative validation", () => {
  const draft = financialAssumptionsToDraft({
    ...DEFAULT_FINANCIAL_ASSUMPTIONS,
    purchasePriceUsd: 399_999.95,
    annualInterestRatePercent: 6.75,
    averageStayNights: 3.5,
  });
  const result = parseFinancialDraft(draft);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.purchasePriceUsd, 399_999.95);
    assert.equal(result.value.annualInterestRatePercent, 6.75);
    assert.equal(result.value.averageStayNights, 3.5);
  }
});

test("reports blank and invalid draft values instead of coercing them to zero", () => {
  const blank = parseFinancialDraft({
    ...financialAssumptionsToDraft(DEFAULT_FINANCIAL_ASSUMPTIONS),
    purchasePriceUsd: "   ",
  });
  assert.equal(blank.ok, false);
  if (!blank.ok) {
    assert.deepEqual(blank.errors[0], {
      field: "purchasePriceUsd",
      message: "Purchase price must be greater than $0.",
    });
  }

  const invalid = parseFinancialDraft({
    ...financialAssumptionsToDraft(DEFAULT_FINANCIAL_ASSUMPTIONS),
    annualInterestRatePercent: "not-a-number",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.errors.some((error) => error.field === "annualInterestRatePercent"), true);
  }
});

test("formats currency and financial ratios without leaking invalid display values", () => {
  assert.equal(formatFinancialCurrency(400_000), "$400,000");
  assert.equal(formatFinancialCurrency(-821.45), "-$821");
  assert.equal(formatFinancialCurrency(1_918.561, 2), "$1,918.56");
  assert.equal(formatFinancialRatio(0.1234), "12.3%");
  assert.equal(formatFinancialRatio(-0.067), "-6.7%");
  assert.equal(formatFinancialRatio(null), "Not applicable");
  assert.equal(formatFinancialDscr(0.614), "0.61x");
  assert.equal(formatFinancialDscr(null), "Not applicable · no mortgage payments");
});
