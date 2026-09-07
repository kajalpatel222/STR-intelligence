import assert from "node:assert/strict";
import test from "node:test";
import { selectNearbyAirbticsListings } from "./airbtics-database-provider.js";

const target = { latitude: 37.486, longitude: -119.966, radiusMiles: 5 } as const;

test("selects, deduplicates, and orders saved Airbtics listings within five miles", () => {
  const rows = [
    marketRow({ listing_url: "https://www.airbnb.com/rooms/near", name: "Near cabin", latitude: 37.49, longitude: -119.97, collected_at: "2026-09-06T12:00:00Z" }),
    marketRow({ listing_url: "https://www.airbnb.com/rooms/far", name: "Outside radius", latitude: 37.60, longitude: -119.97 }),
    marketRow({ listing_url: "https://www.airbnb.com/rooms/near", name: "Older duplicate", latitude: 37.50, longitude: -119.98, collected_at: "2026-09-05T12:00:00Z" }),
  ];

  const result = selectNearbyAirbticsListings(rows, target);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "Near cabin");
  assert.equal(result[0]?.dataSource, "airbtics_market");
  assert.equal(result[0]?.adrLtmUsd, 248.5);
  assert.equal(result[0]?.occupancyLtmPercent, 72.4);
  assert.equal(result[0]?.annualRevenueLtmUsd, 54_000);
  assert.equal(result[0]?.rating, 4.8);
  assert.deepEqual(result[0]?.amenities, ["HotTub", "Wifi"]);
});

test("does not invent unavailable market metrics", () => {
  const result = selectNearbyAirbticsListings([marketRow({ adr_usd: null, occupancy_percent: null, annual_revenue_usd: null })], target);
  assert.equal(result[0]?.adrLtmUsd, undefined);
  assert.equal(result[0]?.occupancyLtmPercent, undefined);
  assert.equal(result[0]?.annualRevenueLtmUsd, undefined);
});

function marketRow(overrides: Record<string, unknown> = {}) {
  return {
    listing_url: "https://www.airbnb.com/rooms/123",
    name: "Yosemite cabin",
    latitude: 37.49123,
    longitude: -119.97123,
    property_type: "Cabin",
    room_type: "Entire home/apt",
    bedrooms: "2",
    bathrooms: 1,
    accommodates: 4,
    adr_usd: 248.5,
    occupancy_percent: 72.4,
    annual_revenue_usd: 54_000,
    rating_percent: 96,
    review_count: 84,
    image_url: "https://images.example/cabin.jpg",
    amenities: { HotTub: true, Pool: false, Wifi: true },
    collected_at: "2026-09-06T12:00:00Z",
    ...overrides,
  };
}
