import { strict as assert } from "node:assert";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatLandArea } from "./listing-format.js";
import { DEFAULT_INVESTMENT_CRITERIA, formatCriteriaCurrency } from "../shared/investment-criteria.js";
import { InvestmentCriteriaPanel } from "./InvestmentCriteriaPanel.js";

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
    minimumPurchaseBudgetUsd: 350000,
    maximumPurchaseBudgetUsd: 400000,
    maximumImprovementReserveUsd: 40000,
    mode: "flexible",
  });
  assert.equal(formatCriteriaCurrency(DEFAULT_INVESTMENT_CRITERIA.maximumImprovementReserveUsd), "$40,000");
});

test("renders only the approved accessible investment criteria controls", () => {
  const markup = renderToStaticMarkup(createElement(InvestmentCriteriaPanel));
  assert.equal((markup.match(/type="number"/g) ?? []).length, 3);
  assert.equal((markup.match(/type="radio"/g) ?? []).length, 2);
  assert.equal(markup.includes("type=\"range\""), false);
  assert.equal(markup.includes("STR appeal"), false);
  assert.match(markup, /Purchase budget/);
  assert.match(markup, /Maximum improvement reserve/);
  assert.match(markup, /apply them to the current homes/);
  assert.match(markup, /role="tooltip"/);
  assert.match(markup, /aria-describedby="criteria-mode-tooltip"/);
  assert.match(markup, /aria-label="About Strict and Flexible modes"/);
  assert.match(markup, /Save defaults/);
  assert.match(markup, /Flexible keeps near-misses with a proportional penalty/);
});

test("renders the Apply Criteria action only when evaluation is connected", () => {
  const withoutApply = renderToStaticMarkup(createElement(InvestmentCriteriaPanel));
  const withApply = renderToStaticMarkup(createElement(InvestmentCriteriaPanel, { onApply: async () => undefined }));
  assert.equal(withoutApply.includes("Apply Criteria"), false);
  assert.equal(withApply.includes("Apply Criteria"), true);
});
