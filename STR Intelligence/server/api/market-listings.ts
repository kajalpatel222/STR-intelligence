import type { MarketListingCollection } from "../../shared/market-listing.js";
import { YOSEMITE_MARKET_REGIONS } from "../market-listings/regions.js";

export const ARCH_ROCK_PILOT = YOSEMITE_MARKET_REGIONS.arch_rock;

export function createMarketListingsHandler(repository: Readonly<{ loadLatest(): Promise<MarketListingCollection | undefined> }>) {
  return async function handleMarketListings() {
    const collection = await repository.loadLatest();
    return collection ? { statusCode: 200, body: { status: "available", collection } } : { statusCode: 200, body: { status: "empty", message: "No market listings have been collected yet." } };
  };
}
