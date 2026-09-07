import assert from "node:assert/strict";
import test from "node:test";
import { AirbticsMarketListingProvider, normalizeAirbticsListingPage } from "./market-listings.js";

const providerPayload = {
  message: {
    total_count: 149,
    listings: JSON.stringify({ message: [{
      listingID: "12345",
      name: "Yosemite cabin",
      latitude: 37.49123,
      longitude: -119.97123,
      property_type: "Cabin",
      room_type: "Entire home/apt",
      bedrooms: "2",
      bathrooms: 1,
      accommodates: 4,
      avg_booked_daily_rate_ltm: 248.5,
      avg_occupancy_rate_ltm: 72.4,
      annual_revenue_ltm: 54000,
      revenue_potential: 61000,
      no_of_bookings_ltm: 37,
      active_days_count_ltm: 340,
      reveiw_scores_rating: 96,
      visible_review_count: 84,
      cleaning_fee: 125,
      minimum_nights: 2,
      thumbnail_url: "https://images.example/cabin.jpg",
      amenities: { HotTub: true, Pool: false },
      last_seen: "2026-09-05T00:00:00Z",
    }] }),
  },
};

test("normalizes a market page into the safe listing contract", () => {
  const result = normalizeAirbticsListingPage(providerPayload, "arch_rock", "2026-09-06T12:00:00Z");
  assert.equal(result.providerTotalCount, 149);
  assert.deepEqual(result.listings[0], {
    listingUrl: "https://www.airbnb.com/rooms/12345", name: "Yosemite cabin", gateway: "arch_rock",
    latitude: 37.49123, longitude: -119.97123,
    propertyType: "Cabin", roomType: "Entire home/apt", bedrooms: "2", bathrooms: 1, accommodates: 4,
    adrUsd: 248.5, occupancyPercent: 72.4, annualRevenueUsd: 54000, revenuePotentialUsd: 61000,
    bookingsLtm: 37, activeDaysLtm: 340, ratingPercent: 96, reviewCount: 84, cleaningFeeUsd: 125,
    minimumNights: 2, imageUrl: "https://images.example/cabin.jpg", amenities: { HotTub: true, Pool: false },
    lastSeen: "2026-09-05T00:00:00Z", collectedAt: "2026-09-06T12:00:00Z",
  });
});

test("keeps the Airbtics key in the server-side request header", async () => {
  let request: RequestInit | undefined;
  const provider = new AirbticsMarketListingProvider({ apiKey: "private-test-key", fetcher: async (_url, init) => {
    request = init;
    return new Response(JSON.stringify(providerPayload), { status: 200, headers: { "Content-Type": "application/json" } });
  }});
  await provider.fetchPage({ gateway: "arch_rock", bounds: { ne_lat: 2, ne_lng: 2, sw_lat: 1, sw_lng: 1 }, page: 1 });
  assert.equal((request?.headers as Record<string, string>)["x-api-key"], "private-test-key");
  assert.doesNotMatch(String(request?.body), /private-test-key/);
});

test("treats provider -1 sentinels as unavailable", () => {
  const payload = { message: { listings: JSON.stringify({ message: [{ listingID: "2", name: "Sparse cabin", property_type: -1, room_type: "-1", bedrooms: -1, latitude: 200, longitude: -300 }] }) } };
  const listing = normalizeAirbticsListingPage(payload, "arch_rock", "2026-09-06T12:00:00Z").listings[0];
  assert.equal(listing?.propertyType, undefined);
  assert.equal(listing?.roomType, undefined);
  assert.equal(listing?.bedrooms, undefined);
  assert.equal(listing?.latitude, undefined);
  assert.equal(listing?.longitude, undefined);
});
