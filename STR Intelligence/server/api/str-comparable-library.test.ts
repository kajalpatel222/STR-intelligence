import { strict as assert } from "node:assert";
import test from "node:test";
import { createStrComparableLibraryHandler } from "./str-comparable-library.js";

test("returns a safe deduplicated-library DTO without internal or raw evidence", async () => {
  const handler = createStrComparableLibraryHandler({ async listComparableLibrary() { return [{
    comparisonReference: "8d08bc34-e6a2-4f41-a95d-1ccda64b2afe",
    comparable: {
      providerListingKey: "private-provider-key", listingUrl: "https://www.airbnb.com/rooms/123", title: "Pine stay", latitude: 37, longitude: -119,
      distanceMiles: 1.2, amenities: ["Wifi"], observedNightlyPriceUsd: 248, observedCheckIn: "2026-09-11", observedCheckOut: "2026-09-13",
      similarityScore: 92, matchReasons: ["Nearby location"], observedAt: "2026-08-30T10:00:00Z", rawPayload: { private: true }, included: true,
      rating: 4.92, reviewCount: 346, calendarUnavailablePercentage: 42.2, calendarUnavailableNights: 38, calendarObservationCount: 90,
    },
    associatedPropertyCount: 2,
    associatedProperties: [{ listingUrl: "https://www.zillow.com/homedetails/412", address: "412 Pine St, Oakhurst, CA", imageUrl: "https://photos.example.com/412.jpg" }, { listingUrl: "https://www.zillow.com/homedetails/49832", address: "49832 Pierce Dr, Oakhurst, CA", imageUrl: "https://photos.example.com/49832.jpg" }],
    firstObservedAt: "2026-08-20T10:00:00Z",
    latestObservedAt: "2026-08-30T10:00:00Z",
  }]; } });

  const result = await handler();
  const serialized = JSON.stringify(result.body);
  assert.equal(result.statusCode, 200);
  assert.match(serialized, /Pine stay/);
  assert.match(serialized, /associatedPropertyCount/);
  assert.match(serialized, /49832 Pierce Dr/);
  assert.doesNotMatch(serialized, /photos\.example\.com/);
  assert.doesNotMatch(serialized, /private-provider-key|rawPayload|latitude|longitude|private/);
});
