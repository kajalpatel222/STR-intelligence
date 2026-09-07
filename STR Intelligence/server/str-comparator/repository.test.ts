import { strict as assert } from "node:assert";
import test from "node:test";
import { calculateCalendarWindows, StrComparisonRepository, resolveTargetCoordinates, rowToStoredComparable } from "./repository.js";

function cacheClient(row: Record<string, unknown> | null, error: unknown = null) {
  const filters: Array<readonly [string, unknown]> = [];
  const query = {
    select() { return this; },
    eq(column: string, value: unknown) { filters.push([column, value]); return this; },
    in() { return this; },
    contains(column: string, value: unknown) { filters.push([column, value]); return this; },
    order() { return this; },
    limit() { return this; },
    async maybeSingle() { return { data: row, error }; },
  };
  return {
    filters,
    client: { from(table: string) { assert.equal(table, "str_comparison_runs"); return query; } },
  };
}

test("classifies the latest canonical-property comparison as fresh", async () => {
  const fake = cacheClient({
    public_reference: "comparison-public-reference",
    completed_at: "2026-08-29T12:00:00.000Z",
    expires_at: "2026-09-05T12:00:00.000Z",
  });
  const repository = new StrComparisonRepository(fake.client as never);

  const result = await repository.findComparisonCache("canonical-property-1", 2, new Date("2026-08-30T12:00:00.000Z"));

  assert.deepEqual(result, {
    status: "fresh",
    publicReference: "comparison-public-reference",
    completedAt: "2026-08-29T12:00:00.000Z",
    expiresAt: "2026-09-05T12:00:00.000Z",
  });
  assert.deepEqual(fake.filters, [["canonical_property_id", "canonical-property-1"], ["request_snapshot", { source: "airbtics_market", radiusMiles: 2 }]]);
});

test("returns stale comparison evidence instead of treating it as missing", async () => {
  const fake = cacheClient({
    public_reference: "stale-comparison-reference",
    completed_at: "2026-08-20T12:00:00.000Z",
    expires_at: "2026-08-27T12:00:00.000Z",
  });
  const repository = new StrComparisonRepository(fake.client as never);

  const result = await repository.findComparisonCache("canonical-property-2", 5, new Date("2026-08-30T12:00:00.000Z"));

  assert.equal(result.status, "stale");
  assert.equal(result.status === "stale" && result.publicReference, "stale-comparison-reference");
});

test("returns missing when a canonical property has no saved comparison", async () => {
  const fake = cacheClient(null);
  const repository = new StrComparisonRepository(fake.client as never);

  assert.deepEqual(
    await repository.findComparisonCache("canonical-property-3", 10, new Date("2026-08-30T12:00:00.000Z")),
    { status: "missing" },
  );
});

test("resolves the newest saved comparison reference for each Zillow URL", async () => {
  const listingUrl = "https://www.zillow.com/homedetails/123";
  const queries = {
    property_source_ids: { select() { return this; }, in() { return Promise.resolve({ data: [{ canonical_property_id: "property-1", external_url: listingUrl }], error: null }); } },
    str_comparison_runs: { select() { return this; }, in() { return this; }, contains() { return this; }, order() { return Promise.resolve({ data: [{ canonical_property_id: "property-1", public_reference: "newest-reference" }, { canonical_property_id: "property-1", public_reference: "older-reference" }], error: null }); } },
  };
  const repository = new StrComparisonRepository({ from(table: keyof typeof queries) { return queries[table]; } } as never);
  assert.deepEqual(await repository.findSavedComparisons([listingUrl]), { [listingUrl]: "newest-reference" });
});

test("maps only the latest immutable evidence batch into the comparable card", () => {
  const comparable = rowToStoredComparable({
    provider_listing_key: "private-key", listing_url: "https://www.airbnb.com/rooms/1", latitude: 37, longitude: -119,
    distance_miles: 2, amenities: ["Wifi"], observed_nightly_price_usd: 200, observed_check_in: "2026-09-11",
    observed_check_out: "2026-09-13", similarity_score: 90, match_reasons: ["Nearby"], observed_at: "2026-08-30T00:00:00Z",
    raw_payload: { private: true }, str_comparable_selections: [{ included: true }],
    str_rate_observations: [
      { nightly_rate_usd: 100, observed_at: "2026-08-29T00:00:00Z" },
      { nightly_rate_usd: 240, observed_at: "2026-08-30T00:00:00Z" },
      { nightly_rate_usd: 260, observed_at: "2026-08-30T00:00:00Z" },
    ],
    str_calendar_snapshots: [
      { available_nights: 60, unavailable_nights: 27, unknown_nights: 3, unavailability_rate: .3, observed_at: "2026-08-30T00:00:00Z" },
      { unavailability_rate: .9, observed_at: "2026-08-29T00:00:00Z" },
    ],
  });
  assert.equal(comparable.estimatedAdrUsd, 250);
  assert.equal(comparable.rateObservationCount, 2);
  assert.equal(comparable.calendarUnavailablePercentage, 30);
  assert.equal(comparable.calendarUnavailableNights, 27);
  assert.equal(comparable.calendarObservationCount, 90);
  assert.equal(comparable.included, true);
});

test("maps absent latest evidence without inventing zero values", () => {
  const comparable = rowToStoredComparable({ provider_listing_key: "key", listing_url: "https://www.airbnb.com/rooms/2", latitude: 37, longitude: -119, distance_miles: 1, amenities: [], observed_nightly_price_usd: 180, observed_check_in: "2026-09-11", observed_check_out: "2026-09-13", similarity_score: 80, match_reasons: [], observed_at: "2026-08-30T00:00:00Z", raw_payload: {}, str_rate_observations: [], str_calendar_snapshots: [] });
  assert.equal(comparable.estimatedAdrUsd, undefined);
  assert.equal(comparable.calendarUnavailablePercentage, undefined);
});

test("derives supported booking windows from real nightly observations", () => {
  const observations = Array.from({ length: 90 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    available: index % 3 !== 0,
  }));
  const windows = calculateCalendarWindows(observations);
  assert.deepEqual(windows.map((item) => item.days), [15, 30, 45, 60, 90]);
  assert.deepEqual(windows[0], { days: 15, unavailableNights: 5, observationCount: 15, unavailablePercentage: 33.3 });
});

test("does not extrapolate a calendar window without enough nightly evidence", () => {
  const observations = Array.from({ length: 29 }, (_, index) => ({ date: `2026-09-${index + 1}`, available: true }));
  assert.deepEqual(calculateCalendarWindows(observations).map((item) => item.days), [15]);
});

test("anchors forward-looking windows to the snapshot observation date", () => {
  const observations = Array.from({ length: 45 }, (_, index) => {
    const date = new Date("2026-08-01T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + index);
    return { date: date.toISOString().slice(0, 10), available: index < 30 };
  });
  const windows = calculateCalendarWindows(observations, "2026-08-30T12:00:00Z");
  assert.deepEqual(windows, [{ days: 15, unavailableNights: 14, observationCount: 15, unavailablePercentage: 93.3 }]);
});

test("recovers target coordinates from a legacy snapshot instead of accepting zero", () => {
  assert.deepEqual(resolveTargetCoordinates(
    { lat: 0, lng: 0 },
    { latitude: 0, longitude: 0, raw: { latLong: { latitude: 37.326977, longitude: -119.63836 } } },
  ), { latitude: 37.326977, longitude: -119.63836 });
});
