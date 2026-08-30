import { strict as assert } from "node:assert";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatLandArea } from "./listing-format.js";
import { DEFAULT_INVESTMENT_CRITERIA, formatCriteriaCurrency } from "../shared/investment-criteria.js";
import { InvestmentCriteriaPanel } from "./InvestmentCriteriaPanel.js";
import { canOpenStrComparator, rankListingIndexes } from "./App.js";
import type { PublicAttentionEvaluation } from "../shared/attention-api.js";
import { ListingReviewControls } from "./ListingReviewControls.js";

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
  assert.match(markup, /Save defaults/);
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

test("renders accessible native radio review choices without note controls", () => {
  const baseProps = { propertyLabel: "123 Pine Street", groupName: "review-1", onDecision: () => undefined };
  const emptyMarkup = renderToStaticMarkup(createElement(ListingReviewControls, baseProps));
  assert.match(emptyMarkup, /Your decision/);
  assert.equal((emptyMarkup.match(/type="radio"/g) ?? []).length, 3);
  assert.equal((emptyMarkup.match(/name="review-1"/g) ?? []).length, 3);
  assert.equal(emptyMarkup.includes("Optional note"), false);
  assert.equal(emptyMarkup.includes("Add a short reason"), false);

  const promotedMarkup = renderToStaticMarkup(createElement(ListingReviewControls, { ...baseProps, decision: "promote" }));
  assert.match(promotedMarkup, /checked="" value="promote"/);
  const savingMarkup = renderToStaticMarkup(createElement(ListingReviewControls, { ...baseProps, decision: "promote", isSaving: true, feedback: "Saving…" }));
  assert.equal((savingMarkup.match(/disabled=""/g) ?? []).length, 3);
  assert.match(savingMarkup, /role="status">Saving/);
});

test("unlocks the comparator only after a Promote decision is safely persisted", () => {
  assert.equal(canOpenStrComparator("promote", "saved"), true);
  assert.equal(canOpenStrComparator("promote", "saving"), false);
  assert.equal(canOpenStrComparator("hold", "saved"), false);
  assert.equal(canOpenStrComparator(undefined, undefined), false);
});
