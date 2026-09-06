import type { AirbticsBounds } from "../sources/airbtics/market-listings.js";
import type { MarketListingCollection } from "../../shared/market-listing.js";

export const ARCH_ROCK_PILOT = Object.freeze({
  label: "Arch Rock / Mariposa pilot",
  gateway: "arch_rock" as const,
  // This bounded pilot validates collection and storage; final gateway coverage will use versioned drive-time boundaries.
  bounds: Object.freeze({ ne_lat: 37.66, ne_lng: -119.78, sw_lat: 37.34, sw_lng: -120.10 }) satisfies AirbticsBounds,
});

export function createMarketListingsHandler(repository: Readonly<{ loadLatest(): Promise<MarketListingCollection | undefined> }>) {
  return async function handleMarketListings() {
    const collection = await repository.loadLatest();
    return collection ? { statusCode: 200, body: { status: "available", collection } } : { statusCode: 200, body: { status: "empty", message: "No market listings have been collected yet." } };
  };
}
