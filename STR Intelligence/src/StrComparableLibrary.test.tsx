import { strict as assert } from "node:assert";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StrComparableCard } from "./StrComparableCard.js";
import { StrComparableLibrary, sortComparableLibrary } from "./StrComparableLibrary.js";
import { loadStrComparableLibrary, type StrComparableLibraryItem } from "./str-comparable-library-client.js";

function item(id: string, values: Partial<StrComparableLibraryItem> = {}): StrComparableLibraryItem {
  return { listingUrl: `https://www.airbnb.com/rooms/${id}`, title: `Stay ${id}`, distanceMiles: 2, bedrooms: 2, bathrooms: 1, guestCapacity: 4,
    amenities: [], observedNightlyPriceUsd: 200, observedCheckIn: "2026-09-11", observedCheckOut: "2026-09-13", similarityScore: 80,
    matchReasons: ["Nearby"], included: true, associatedPropertyCount: 1, associatedProperties: ["Target home"], firstObservedAt: "2026-08-20T00:00:00Z", latestObservedAt: "2026-08-30T00:00:00Z", ...values };
}

test("sorts stored comparables by rating, closest distance, and highest booked-or-blocked signal", () => {
  const items = [item("a", { rating: 4.8, distanceMiles: 3, calendarUnavailablePercentage: 30 }), item("b", { rating: 4.95, distanceMiles: 1, calendarUnavailablePercentage: 60 })];
  assert.equal(sortComparableLibrary(items, "rating")[0]!.listingUrl.endsWith("/b"), true);
  assert.equal(sortComparableLibrary(items, "distance")[0]!.listingUrl.endsWith("/b"), true);
  assert.equal(sortComparableLibrary(items, "booking")[0]!.listingUrl.endsWith("/b"), true);
});

test("defaults the STR library to highest booked or blocked", () => {
  const markup = renderToStaticMarkup(createElement(StrComparableLibrary, {
    onNavigate: () => undefined,
    loader: async () => [],
  }));
  assert.match(markup, /<option value="booking" selected="">Highest booked or blocked<\/option>/);
});

test("library client reads stored data through the read-only endpoint", async () => {
  let requested = "";
  const result = await loadStrComparableLibrary(async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ comparables: [item("123")] }), { status: 200 });
  });
  assert.equal(requested, "/api/str-comparables");
  assert.equal(result.length, 1);
  assert.equal(result[0]!.included, true);
});

test("shared comparable card presents library context and booking evidence", () => {
  const markup = renderToStaticMarkup(createElement(StrComparableCard, { candidate: item("123", { rating: 4.9, calendarUnavailablePercentage: 42.2, calendarUnavailableNights: 38, calendarObservationCount: 90 }), rank: 1, context: "2 associated Zillow properties" }));
  assert.match(markup, /2 associated Zillow properties/);
  assert.match(markup, /Booked or blocked/);
  assert.match(markup, /42.2%/);
  assert.match(markup, /Current rate/);
});
