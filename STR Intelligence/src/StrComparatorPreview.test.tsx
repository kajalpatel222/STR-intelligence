import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StrComparatorPreview } from "./StrComparatorPreview.js";
import type { StrComparisonDto } from "./str-comparator-client.js";

const comparison: StrComparisonDto = {
  publicReference: "comparison-reference",
  radiusMiles: 10,
  status: "discovered",
  stage: "discovery",
  target: { listingUrl: "https://example.com/target" },
  candidates: [
    {
      listingUrl: "https://example.com/stay-one",
      title: "Pine View Retreat",
      imageUrl: "https://images.example.com/stay-one.jpg",
      distanceMiles: 2.4,
      amenities: [],
      observedNightlyPriceUsd: 245,
      observedCheckIn: "2026-09-18",
      observedCheckOut: "2026-09-20",
      similarityScore: 92,
      matchReasons: [],
      included: true,
    },
  ],
};

test("renders a compact linked shortlist and one details action", () => {
  const markup = renderToStaticMarkup(
    <StrComparatorPreview
      comparison={comparison}
      propertyLabel="123 Pine Street"
      detailsButtonId="comparison-details-0"
      onSeeDetails={() => undefined}
    />,
  );

  assert.match(markup, /Nearby short-term rentals/);
  assert.match(markup, /within 10 miles/);
  assert.match(markup, /Pine View Retreat/);
  assert.match(markup, /href="https:\/\/example.com\/stay-one"/);
  assert.match(markup, /src="https:\/\/images.example.com\/stay-one.jpg"/);
  assert.match(markup, /See comparison details/);
  assert.match(markup, /id="comparison-details-0"/);
  assert.match(markup, /<details[^>]*open=""/);
  assert.match(markup, /<summary/);
  assert.equal(markup.includes("↗"), false);
  assert.equal(markup.includes("Include"), false);
  assert.equal(markup.includes("Find comparables"), false);
});

test("renders a neutral empty shortlist without a dead details action", () => {
  const markup = renderToStaticMarkup(
    <StrComparatorPreview comparison={{ ...comparison, candidates: [] }} propertyLabel="123 Pine Street" onSeeDetails={() => undefined} />,
  );
  assert.match(markup, /No eligible nearby stays were found/);
  assert.equal(markup.includes("See comparison details"), false);
});
