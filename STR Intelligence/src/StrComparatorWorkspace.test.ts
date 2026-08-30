import { strict as assert } from "node:assert";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StrComparatorWorkspace } from "./StrComparatorWorkspace.js";
import {
  analyzeStrComparableEvidence,
  discoverStrComparables,
  updateStrComparableSelections,
  type StrComparableDto,
  type StrComparisonDto,
} from "./str-comparator-client.js";
import { formatComparatorCurrency, formatComparatorPercent } from "./str-comparator-format.js";

const candidate = (index: number, overrides: Partial<StrComparableDto> = {}): StrComparableDto => ({
  providerListingKey: `airbnb-${index}`,
  listingUrl: `https://example.com/rooms/${index}`,
  title: `Pine cabin ${index}`,
  distanceMiles: index / 2,
  roomType: "Entire home",
  bedrooms: 2,
  bathrooms: 1,
  guestCapacity: 4,
  amenities: ["Kitchen"],
  observedNightlyPriceUsd: 180 + index,
  observedCheckIn: "2026-09-10",
  observedCheckOut: "2026-09-12",
  similarityScore: 0.9,
  matchReasons: ["Similar capacity", "Nearby"],
  observedAt: "2026-08-30T12:00:00.000Z",
  included: true,
  ...overrides,
});

const comparison = (withEvidence = false): StrComparisonDto => ({
  publicReference: "cmp_public_123",
  status: withEvidence ? "complete" : "sparse_evidence",
  stage: withEvidence ? "complete" : "discovery",
  completedAt: "2026-08-30T12:00:00.000Z",
  target: {
    listingUrl: "https://example.com/target",
    address: "412 Cedar Lane",
    city: "Oakhurst",
    state: "CA",
    price: 399000,
    bedrooms: 2,
    bathrooms: 2,
    imageUrl: "https://images.example.com/target.jpg",
  },
  candidates: Array.from({ length: 6 }, (_, index) => candidate(index + 1, withEvidence ? {
    estimatedAdrUsd: 210 + index,
    rateObservationCount: 14,
    calendarUnavailablePercentage: 62 + index,
    calendarUnavailableNights: 38 + index,
    calendarObservationCount: 90,
  } : {})),
  ...(withEvidence ? { summary: {
    reasonText: "Five comparables ranked with complete rate and calendar evidence.",
    evidenceConfidence: "high",
    market: {
      estimatedAdrMedianUsd: 212,
      estimatedAdrRangeUsd: { minimum: 205, maximum: 224 },
      calendarUnavailableMedianPercentage: 64,
      calendarUnavailableRangePercentage: { minimum: 59, maximum: 70 },
    },
  } } : {}),
});

test("renders an accessible explicit discovery state", () => {
  const markup = renderToStaticMarkup(createElement(StrComparatorWorkspace, {
    listingUrl: "https://example.com/target",
    propertyLabel: "Cedar Lane",
    onBack: () => undefined,
  }));
  assert.match(markup, /Find comparables/);
  assert.match(markup, /aria-label="Back to attention screen"/);
  assert.match(markup, /aria-busy="false"/);
  assert.equal(markup.includes("Stage 2"), false);
});

test("renders only five concise linked comparable cards", () => {
  const markup = renderToStaticMarkup(createElement(StrComparatorWorkspace, {
    listingUrl: "https://example.com/target",
    initialComparison: comparison(),
    onBack: () => undefined,
  }));
  assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 0);
  assert.equal((markup.match(/<article/g) ?? []).length, 5);
  assert.match(markup, /Current rate/);
  assert.match(markup, /\/night/);
  assert.equal(markup.includes("Price shown during the comparable search"), false);
  assert.equal(markup.includes("2026-09-10 to 2026-09-12"), false);
  assert.match(markup, /Distance/);
  assert.match(markup, /Guests/);
  assert.match(markup, /Rating/);
  assert.match(markup, /<details/);
  assert.match(markup, /Why this match/);
  assert.match(markup, /Cached Aug 30, 2026/);
  assert.match(markup, /STR comparables/);
  assert.equal(markup.includes("Include"), false);
  assert.match(markup, /aria-label="Open Zillow listing for 412 Cedar Lane"/);
  assert.match(markup, /href="https:\/\/example.com\/target"/);
});

test("shows only the concise booking metric while keeping detailed evidence and summaries out", () => {
  const markup = renderToStaticMarkup(createElement(StrComparatorWorkspace, {
    listingUrl: "https://example.com/target",
    initialComparison: comparison(true),
    onBack: () => undefined,
  }));
  assert.match(markup, /Current rate/);
  assert.match(markup, /Booked or blocked/);
  assert.match(markup, /Based on 90 observed calendar nights/);
  assert.equal(markup.includes("Availability summary"), false);
  assert.equal(markup.includes("Comparator summary"), false);
  assert.equal(markup.includes("Evidence confidence"), false);
  assert.equal(markup.includes("Estimated ADR"), false);
  assert.equal(markup.includes("Insufficient data"), false);
  assert.match(markup, /href="https:\/\/example.com\/rooms\/1"/);
});

test("omits the booking metric when the calendar count is unavailable", () => {
  const value = comparison(true);
  const markup = renderToStaticMarkup(createElement(StrComparatorWorkspace, {
    listingUrl: "https://example.com/target",
    initialComparison: { ...value, candidates: [{ ...value.candidates[0]!, calendarObservationCount: undefined }] },
    onBack: () => undefined,
  }));
  assert.equal(markup.includes("Booked or blocked"), false);
});

test("shows Superhost separately and suppresses an implausible cached distance", () => {
  const value = comparison();
  const markup = renderToStaticMarkup(createElement(StrComparatorWorkspace, {
    listingUrl: "https://example.com/target",
    initialComparison: { ...value, candidates: [{ ...value.candidates[0]!, isSuperhost: true, distanceMiles: 7818.1 }] },
    onBack: () => undefined,
  }));
  assert.match(markup, /Superhost/);
  assert.match(markup, /Distance<\/dt><dd>Unavailable/);
  assert.equal(markup.includes("7,818.1 mi"), false);
});

test("formats absent and observed comparator metrics explicitly", () => {
  assert.equal(formatComparatorCurrency(212.4), "$212");
  assert.equal(formatComparatorCurrency(undefined), "Not available");
  assert.equal(formatComparatorPercent(64.25), "64.3%");
});

test("typed client sends stage-specific payloads without external calls", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ comparison: comparison() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  await discoverStrComparables("https://example.com/target", fakeFetch);
  await analyzeStrComparableEvidence("cmp_public_123", ["https://example.com/rooms/1"], fakeFetch);
  await updateStrComparableSelections("cmp_public_123", ["https://example.com/rooms/1"], fakeFetch);
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/str-comparisons",
    "/api/str-comparisons/cmp_public_123/evidence",
    "/api/str-comparisons/cmp_public_123/selections",
  ]);
  assert.deepEqual(JSON.parse(String(calls[0]!.init!.body)), { listingUrl: "https://example.com/target" });
  assert.deepEqual(JSON.parse(String(calls[1]!.init!.body)), {
    listingUrls: ["https://example.com/rooms/1"],
  });
  assert.equal(calls[2]!.init!.method, "PUT");
});

test("normalizes the richer server response into the local UI DTO", async () => {
  const serverResponse = {
    status: "complete",
    comparisonReference: "8d08bc34-e6a2-4f41-a95d-1ccda64b2afe",
    lastCheckedAt: "2026-08-30T12:00:00.000Z",
    target: comparison().target,
    summary: comparison(true).summary,
    comparables: comparison(true).candidates.map(({ providerListingKey: _key, observedAt: _at, ...item }) => item),
  };
  const fakeFetch = async () => new Response(JSON.stringify(serverResponse), { status: 200 });
  const result = await discoverStrComparables("https://www.zillow.com/homedetails/123", fakeFetch);
  assert.equal(result.publicReference, serverResponse.comparisonReference);
  assert.equal(result.completedAt, serverResponse.lastCheckedAt);
  assert.equal(result.stage, "complete");
  assert.equal(result.candidates[0]!.providerListingKey, result.candidates[0]!.listingUrl);
});

test("typed client surfaces server errors and rejects incomplete success responses", async () => {
  const failedFetch = async () => new Response(JSON.stringify({ message: "Provider timed out." }), { status: 503 });
  await assert.rejects(discoverStrComparables("target", failedFetch), /Provider timed out/);
  const incompleteFetch = async () => new Response(JSON.stringify({ status: "complete" }), { status: 200 });
  await assert.rejects(discoverStrComparables("target", incompleteFetch), /incomplete response/);
});
