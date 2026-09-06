import { MarketListingRepository } from "./repository.js";

const collection = await new MarketListingRepository().loadLatest();
if (!collection) throw new Error("No saved market collection was found.");

console.log(JSON.stringify({
  label: collection.label,
  savedCount: collection.savedCount,
  loadedCount: collection.listings.length,
  providerTotalCount: collection.providerTotalCount,
  defaultTopListing: [...collection.listings].sort((a, b) => (b.annualRevenueUsd ?? -1) - (a.annualRevenueUsd ?? -1))[0]?.name,
  defaultTopPropertyType: [...collection.listings].sort((a, b) => (b.annualRevenueUsd ?? -1) - (a.annualRevenueUsd ?? -1))[0]?.propertyType ?? null,
}));
