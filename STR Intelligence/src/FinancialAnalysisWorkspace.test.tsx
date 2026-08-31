import { strict as assert } from "node:assert";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFinancialAssumptions } from "../shared/financial-assumptions.js";
import { calculateBaseCaseFinancials } from "../shared/financial-calculator.js";
import { FinancialAnalysisWorkspace } from "./FinancialAnalysisWorkspace.js";
import {
  formatFinancialCurrency,
  formatFinancialDscr,
  formatFinancialRatio,
} from "./financial-analysis-state.js";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const LISTING = {
  title: "Pine Ridge Cabin",
  address: "123 Pine Road",
  location: "Oakhurst, CA",
  priceUsd: 327_000,
  beds: 3,
  baths: 2,
  livingAreaSqft: 1_500,
  sourceUrl: "https://example.com/listing",
} as const;

function renderWorkspace(priceUsd: number = LISTING.priceUsd): string {
  return renderToStaticMarkup(React.createElement(FinancialAnalysisWorkspace, {
    listing: { ...LISTING, priceUsd },
    onBack: () => undefined,
  }));
}

test("renders a semantic, accessible workspace with all 21 grouped assumptions", () => {
  const markup = renderWorkspace();

  assert.match(markup, /<main class="financial-workspace">/);
  assert.match(markup, /<h1>Pine Ridge Cabin<\/h1>/);
  assert.match(markup, /<h2 id="financial-summary-title">Investment snapshot<\/h2>/);
  assert.match(markup, /<h2 id="financial-assumptions-title">Assumptions<\/h2>/);
  assert.match(markup, /<h2 id="financial-details-title">How the base case adds up<\/h2>/);
  assert.equal((markup.match(/type="number"/g) ?? []).length, 21);
  assert.equal((markup.match(/<details/g) ?? []).length, 4);
  assert.equal((markup.match(/<fieldset>/g) ?? []).length, 4);
  assert.equal((markup.match(/<legend/g) ?? []).length, 4);
  assert.match(markup, /aria-labelledby="financial-summary-title"/);
  assert.match(markup, /aria-labelledby="financial-assumptions-title"/);
  assert.match(markup, /aria-labelledby="financial-details-title"/);
});

test("renders property context, source link, and listing-price prefill", () => {
  const markup = renderWorkspace();

  assert.match(markup, /123 Pine Road · Oakhurst, CA/);
  assert.match(markup, /\$327,000 · 3 beds · 2 baths · 1,500 sq ft/);
  assert.match(markup, /href="https:\/\/example.com\/listing"[^>]*>View source listing<\/a>/);
  assert.match(markup, /id="financial-purchasePriceUsd"[^>]*value="327000"/);
  assert.match(markup, />Save to dashboard<\/button>/);
});

test("restores saved assumptions when a dashboard analysis is reopened", () => {
  const markup = renderToStaticMarkup(React.createElement(FinancialAnalysisWorkspace, {
    listing: LISTING,
    initialAssumptions: createFinancialAssumptions({ purchasePriceUsd: LISTING.priceUsd, expectedAdrUsd: 333 }),
    onBack: () => undefined,
  }));
  assert.match(markup, /id="financial-expectedAdrUsd"[^>]*value="333"/);
});

test("renders summary and detail values from the deterministic calculator", () => {
  const assumptions = createFinancialAssumptions({ purchasePriceUsd: LISTING.priceUsd });
  const result = calculateBaseCaseFinancials(assumptions);
  const markup = renderWorkspace();

  for (const expected of [
    formatFinancialCurrency(result.returns.monthlyPreTaxCashFlowUsd),
    formatFinancialRatio(result.returns.cashOnCashReturnRatio),
    formatFinancialCurrency(result.acquisition.totalCashInvestedUsd),
    formatFinancialRatio(result.returns.breakEvenOccupancyRatio),
    formatFinancialCurrency(result.returns.netOperatingIncomeUsd),
    formatFinancialRatio(result.returns.capRateRatio),
    formatFinancialDscr(result.returns.debtServiceCoverageRatio),
    formatFinancialCurrency(result.financing.monthlyMortgagePaymentUsd, 2),
  ]) {
    assert.equal(markup.includes(expected), true, expected);
  }
  assert.equal(markup.includes("NaN"), false);
  assert.equal(markup.includes("Infinity"), false);
});

test("shows the supported county and transparent California property-tax estimate", () => {
  const markup = renderWorkspace();

  assert.match(markup, /Estimated property tax/);
  assert.match(markup, /\$3,597 annually/);
  assert.match(markup, /Madera County · 1.1% rate used · Editable planning estimate/);
  assert.match(markup, /Source as of March 2025/);
  assert.match(markup, /href="https:\/\/www\.boe\.ca\.gov\/proptaxes\/pdf\/pub29\.pdf"/);
  assert.match(markup, /statutory base is 1%/);
});

test("uses location-specific TOT profiles and falls back honestly when the county is unavailable", () => {
  const mariposa = renderToStaticMarkup(React.createElement(FinancialAnalysisWorkspace, {
    listing: { ...LISTING, location: "Mariposa, California" }, onBack: () => undefined,
  }));
  const unknown = renderToStaticMarkup(React.createElement(FinancialAnalysisWorkspace, {
    listing: { ...LISTING, address: undefined, location: "Fresno, CA" }, onBack: () => undefined,
  }));
  assert.match(mariposa, /Mariposa County/);
  assert.match(mariposa, /id="financial-transientOccupancyTaxPercent"[^>]*value="12"/);
  assert.match(mariposa, /Current county return/);
  assert.match(mariposa, /href="https:\/\/www\.mariposacounty\.org\/DocumentCenter\/View\/64984\/FORM-Fill-PDF-Version---TOT-BID-Tax-Return"/);
  assert.match(unknown, /California · county unavailable/);
  assert.match(unknown, /id="financial-transientOccupancyTaxPercent"[^>]*value="9"/);
  assert.match(unknown, /County unavailable · planning default/);
});

test("separates guest-paid fields and charges from owner operating expenses", () => {
  const markup = renderWorkspace();

  assert.equal((markup.match(/<summary>Operating expenses/g) ?? []).length, 1);
  assert.equal((markup.match(/>Guest paid<\/small>/g) ?? []).length, 3);
  for (const label of [
    "Property tax rate", "Home insurance", "Miscellaneous utilities", "Cleaning cost paid",
    "Guest platform fee", "Transient occupancy tax", "Property management fee", "Maintenance and replacement reserve",
    "HOA dues", "Other operating costs", "Property tax expense", "Home insurance expense",
    "Cleaning expense", "Property management fees", "Total operating expenses", "Guest-paid charges",
    "Cleaning fees charged", "Guest platform fees", "Total guest-paid charges",
    "Annual mortgage payments", "principal &amp; interest only",
  ]) assert.equal(markup.includes(label), true, label);

  assert.match(markup, /id="financial-guestPlatformFeePercent"[^>]*value="15"/);
  assert.match(markup, /id="financial-transientOccupancyTaxPercent"[^>]*value="9"/);
  assert.match(markup, /href="https:\/\/www\.maderacounty\.com\/government\/treasurer-tax-collector\/hotel-motel-room-tax"/);
  assert.match(markup, /collected from guests and excluded from owner operating expenses/);

  const assumptions = createFinancialAssumptions({ purchasePriceUsd: LISTING.priceUsd });
  const result = calculateBaseCaseFinancials(assumptions);
  for (const amount of [
    result.guestCharges.cleaningFeesChargedUsd,
    result.guestCharges.guestPlatformFeesUsd,
    result.guestCharges.transientOccupancyTaxUsd,
    result.guestCharges.totalGuestPaidChargesUsd,
  ]) assert.equal(markup.includes(formatFinancialCurrency(amount)), true, String(amount));

  assert.match(markup, /Estimated guest-paid nightly total/);
  assert.match(markup, /\$372\.00/);
  assert.match(markup, /Room ADR/);
  assert.match(markup, /Cleaning allocation/);
  assert.match(markup, /Uses the editable 3-night average stay/);

  for (const oldLabel of ["Operating costs", "Annual fixed costs", "Annual debt service", "Booking platform expense", "Projected NOI does not cover annual debt service"])
    assert.equal(markup.includes(oldLabel), false, oldLabel);
});

test("shows an explicit warning when break-even occupancy is unachievable", () => {
  const markup = renderWorkspace(2_000_000);

  assert.match(markup, /Break-even occupancy exceeds 100% and is not achievable in this model/);
});

test("does not imply unsupported apply or provider behavior", () => {
  const markup = renderWorkspace();

  for (const unsupported of [
    "Apply",
    "Supabase",
    "Apify",
    "Airbnb",
    "provider",
  ]) {
    assert.equal(markup.toLowerCase().includes(unsupported.toLowerCase()), false, unsupported);
  }
});
