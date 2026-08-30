import { strict as assert } from "node:assert";
import test from "node:test";
import { resolveTargetCoordinates, rowToStoredComparable } from "./repository.js";

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

test("recovers target coordinates from a legacy snapshot instead of accepting zero", () => {
  assert.deepEqual(resolveTargetCoordinates(
    { lat: 0, lng: 0 },
    { latitude: 0, longitude: 0, raw: { latLong: { latitude: 37.326977, longitude: -119.63836 } } },
  ), { latitude: 37.326977, longitude: -119.63836 });
});
