import { strict as assert } from "node:assert";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatLandArea } from "./listing-format.js";
import { DEFAULT_INVESTMENT_CRITERIA, formatCriteriaCurrency } from "../shared/investment-criteria.js";
import { InvestmentCriteriaPanel } from "./InvestmentCriteriaPanel.js";
import App, { canAnalyzeListing, ParsedSearchChips, QUICK_SEARCHES, rankListingIndexes } from "./App.js";
import { parsePropertySearchQuery } from "../shared/property-search-query.js";
import type { PublicAttentionEvaluation } from "../shared/attention-api.js";

test("formats source acreage without losing parcel precision", () => {
  assert.equal(formatLandArea({ lotAcres: 5, lotSqft: 217800 }), "5 acres");
  assert.equal(formatLandArea({ lotAcres: 8.14, lotSqft: 354578 }), "8.14 acres");
});

test("does not present zero or missing parcel size", () => {
  assert.equal(formatLandArea({ lotSqft: 0 }), undefined);
  assert.equal(formatLandArea({}), undefined);
});

test("initializes editable attention criteria around the current preference", () => {
  assert.deepEqual(DEFAULT_INVESTMENT_CRITERIA, {
    minimumPurchaseBudgetUsd: 0,
    maximumPurchaseBudgetUsd: 400000,
    maximumImprovementReserveUsd: 40000,
    mode: "flexible",
  });
  assert.equal(formatCriteriaCurrency(DEFAULT_INVESTMENT_CRITERIA.maximumImprovementReserveUsd), "$40,000");
});

test("renders only the approved accessible investment criteria controls", () => {
  const markup = renderToStaticMarkup(createElement(InvestmentCriteriaPanel));
  assert.equal((markup.match(/type="number"/g) ?? []).length, 2);
  assert.equal((markup.match(/type="radio"/g) ?? []).length, 2);
  assert.equal(markup.includes("type=\"range\""), false);
  assert.equal(markup.includes("STR appeal"), false);
  assert.match(markup, /Maximum purchase budget/);
  assert.equal(markup.includes(">Minimum<"), false);
  assert.match(markup, /Maximum improvement reserve/);
  assert.match(markup, /apply them to the current homes/);
  assert.match(markup, /role="tooltip"/);
  assert.match(markup, /aria-describedby="criteria-mode-tooltip"/);
  assert.match(markup, /aria-label="About Strict and Flexible modes"/);
  assert.equal(markup.includes("Save defaults"), false);
  assert.match(markup, /value="400000"/);
  assert.match(markup, /value="40000"/);
  assert.match(markup, /checked="" value="flexible"/);
  assert.match(markup, /Flexible keeps near-misses with a proportional penalty/);
});

test("renders the Apply Criteria action only when evaluation is connected", () => {
  const withoutApply = renderToStaticMarkup(createElement(InvestmentCriteriaPanel));
  const withApply = renderToStaticMarkup(createElement(InvestmentCriteriaPanel, { onApply: async () => undefined }));
  assert.equal(withoutApply.includes("Apply Criteria"), false);
  assert.equal(withApply.includes("Apply Criteria"), true);
});

test("ranks evaluated homes by Attention then Confidence while preserving stable ties", () => {
  const evaluation = (listingIndex: number, attentionScore: number | null, confidenceScore: number | null) => ({
    listingIndex,
    result: { attentionScore, confidenceScore },
  }) as PublicAttentionEvaluation;
  assert.deepEqual(rankListingIndexes(4, []), [0, 1, 2, 3]);
  assert.deepEqual(rankListingIndexes(4, [
    evaluation(0, 55, 90),
    evaluation(1, 82, 60),
    evaluation(2, 82, 78),
    evaluation(3, null, 100),
  ]), [2, 1, 0, 3]);
  assert.deepEqual(rankListingIndexes(3, [evaluation(0, 70, 70), evaluation(1, 70, 70)]), [0, 1, 2]);
});

test("offers financial analysis only when a listing has a usable purchase price", () => {
  assert.equal(canAnalyzeListing({ price: 327000 }), true);
  assert.equal(canAnalyzeListing({ price: 0 }), false);
  assert.equal(canAnalyzeListing({ price: Number.NaN }), false);
  assert.equal(canAnalyzeListing({}), false);
});

test("renders one prominent natural-language property search without duplicate controls", () => {
  const markup = renderToStaticMarkup(createElement(App));
  assert.equal((markup.match(/<input/g) ?? []).length, 2);
  assert.match(markup, /Find your next STR investment/);
  assert.match(markup, /3\+ bedroom homes under \$350k in Oakhurst/);
  assert.equal(markup.includes("Property type"), false);
  assert.equal(markup.includes("Search location"), false);
  assert.equal(markup.includes("No properties to show yet"), false);
  for (const query of QUICK_SEARCHES) assert.equal(markup.includes(query), true);
  assert.match(markup, /Already have a listing in mind/);
  assert.match(markup, /Share its Zillow URL/);
  assert.match(markup, /Review listing/);
});

test("renders concise parsed feedback for a supported search", () => {
  const parsed = parsePropertySearchQuery("3+ bedroom homes under $350k in Oakhurst");
  const markup = renderToStaticMarkup(createElement(ParsedSearchChips, { parsed, id: "parsed-search" }));
  assert.match(markup, /Search understood/);
  assert.match(markup, /Homes/);
  assert.match(markup, /Oakhurst, CA/);
  assert.match(markup, /≤ \$350k/);
  assert.match(markup, /3\+ beds/);
});
