import type { MarketListingCollection } from "../shared/market-listing.js";

export async function loadMarketListings(fetcher: typeof fetch = fetch): Promise<MarketListingCollection | undefined> {
  const response = await fetcher("/api/market-listings", { headers: { Accept: "application/json" } });
  const body = await response.json() as { collection?: MarketListingCollection; message?: string };
  if (!response.ok) throw new Error(body.message ?? "Market listings could not be loaded.");
  return body.collection;
}
