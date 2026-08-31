import { strict as assert } from "node:assert";
import test from "node:test";
import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFinancialAssumptions } from "../shared/financial-assumptions.js";
import { calculateBaseCaseFinancials } from "../shared/financial-calculator.js";
import type { SavedFinancialAnalysis } from "../shared/financial-analysis.js";
import { FinancialDashboard, FinancialDashboardCard, sortFinancialAnalyses } from "./FinancialDashboard.js";
import { ProductHeader } from "./ProductHeader.js";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function analysis(id: string, values: Readonly<{
  cashOnCash?: number | null;
  monthlyCashFlow?: number;
  savedAt?: string;
}> = {}): SavedFinancialAnalysis {
  const assumptions = createFinancialAssumptions({ purchasePriceUsd: 300_000 + Number(id) * 10_000 });
  const calculated = calculateBaseCaseFinancials(assumptions);
  return Object.freeze({
    property: Object.freeze({
      listingUrl: `https://www.zillow.com/homedetails/${id}`,
      title: `Cabin ${id}`,
      address: `${id} Pine Road`,
      location: "Oakhurst, CA",
      imageUrl: "https://example.com/home.jpg",
      priceUsd: assumptions.purchasePriceUsd,
      beds: 3,
      baths: 2,
      livingAreaSqft: 1_500,
    }),
    assumptions,
    result: Object.freeze({
      ...calculated,
      returns: Object.freeze({
        ...calculated.returns,
        cashOnCashReturnRatio: values.cashOnCash ?? calculated.returns.cashOnCashReturnRatio,
        monthlyPreTaxCashFlowUsd: values.monthlyCashFlow ?? calculated.returns.monthlyPreTaxCashFlowUsd,
      }),
    }),
    savedAt: values.savedAt ?? `2026-08-${20 + Number(id)}T20:00:00Z`,
  });
}

test("defaults the dashboard to highest cash-on-cash return", () => {
  const items = [analysis("1", { cashOnCash: 0.04, monthlyCashFlow: 900 }), analysis("2", { cashOnCash: 0.08, monthlyCashFlow: 500 }), analysis("3", { cashOnCash: null, monthlyCashFlow: 2_000 })];
  assert.equal(sortFinancialAnalyses(items, "cash-on-cash")[0]!.property.title, "Cabin 2");
  assert.equal(sortFinancialAnalyses(items, "cash-flow")[0]!.property.title, "Cabin 3");
  assert.equal(sortFinancialAnalyses(items, "recent")[0]!.property.title, "Cabin 3");
});

test("renders a compact saved-property card with financial and on-demand STR actions", () => {
  const markup = renderToStaticMarkup(createElement(FinancialDashboardCard, { analysis: analysis("1", { cashOnCash: 0.072, monthlyCashFlow: 840 }), onOpen: () => undefined, onEvaluate: () => undefined }));
  for (const text of ["Cabin 1", "Cash-on-cash return", "7.2%", "$840 monthly cash flow", "Purchase price", "Total cash required", "Net operating income", "ADR / occupancy", "View financial analysis", "Evaluate STR potential"])
    assert.equal(markup.includes(text), true, text);
  assert.match(markup, /alt="Property at 1 Pine Road"/);
});

test("renders the financial dashboard navigation and loading state accessibly", () => {
  const header = renderToStaticMarkup(createElement(ProductHeader, { activeView: "financials", onNavigate: () => undefined }));
  const dashboard = renderToStaticMarkup(createElement(FinancialDashboard, { onNavigate: () => undefined }));
  assert.match(header, /Financial Dashboard/);
  assert.match(header, /aria-current="page"/);
  assert.match(dashboard, /aria-busy="true"/);
  assert.match(dashboard, /Loading saved analyses/);
});
