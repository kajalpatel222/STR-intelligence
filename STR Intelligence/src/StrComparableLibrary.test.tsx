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
    matchReasons: ["Nearby"], included: true, comparisonReference: "8d08bc34-e6a2-4f41-a95d-1ccda64b2afe", associatedPropertyCount: 1, associatedProperties: [{ listingUrl: "https://www.zillow.com/homedetails/target", address: "49832 Pierce Dr, Oakhurst, CA" }], firstObservedAt: "2026-08-20T00:00:00Z", latestObservedAt: "2026-08-30T00:00:00Z", ...values };
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

test("shared comparable card presents its own booking window and refresh context", () => {
  const markup = renderToStaticMarkup(createElement(StrComparableCard, { candidate: item("123", { rating: 4.9, calendarObservedAt: "2026-08-30T10:00:00Z", calendarWindows: [{ days: 15, unavailablePercentage: 40, unavailableNights: 6, observationCount: 15 }] }), rank: 1, context: "2 associated Zillow properties", onRefreshCalendar: async () => undefined }));
  assert.match(markup, /2 associated Zillow properties/);
  assert.match(markup, /Booked or blocked/);
  assert.match(markup, /checked="" value="15"/);
  assert.match(markup, /40%/);
  assert.match(markup, /Based on 15 nights/);
  assert.match(markup, /Current rate/);
  assert.match(markup, /Checked Aug 30, 2026/);
  assert.match(markup, />Refresh</);
});

test("library renders associated Zillow properties as address links", async () => {
  const markup = renderToStaticMarkup(createElement(StrComparableLibrary, {
    onNavigate: () => undefined,
    loader: async () => [item("123")],
  }));
  assert.doesNotMatch(markup, /Target home/);

  const loadedMarkup = renderToStaticMarkup(createElement(StrComparableCard, {
    candidate: item("123"), rank: 1,
    footer: createElement("div", { className: "str-library__property-links" },
      createElement("a", { href: "https://www.zillow.com/homedetails/target" }, "49832 Pierce Dr, Oakhurst, CA")),
  }));
  assert.match(loadedMarkup, /href="https:\/\/www\.zillow\.com\/homedetails\/target"/);
  assert.match(loadedMarkup, /49832 Pierce Dr, Oakhurst, CA/);
});

test("places the associated-property area after comparable pricing evidence", () => {
  const markup = renderToStaticMarkup(createElement(StrComparableCard, {
    candidate: item("123", { calendarWindows: [{ days: 15, unavailablePercentage: 40, unavailableNights: 6, observationCount: 15 }] }),
    rank: 1,
    footer: createElement("div", null, "Matched properties"),
  }));
  assert.ok(markup.indexOf("Current rate") < markup.indexOf("Matched properties"));
  assert.ok(markup.indexOf("Booked or blocked") < markup.indexOf("Matched properties"));
});
