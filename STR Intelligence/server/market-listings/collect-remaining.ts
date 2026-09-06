import { getServerEnvironment } from "../config/env.js";
import { ARCH_ROCK_PILOT } from "../api/market-listings.js";
import { AirbticsMarketListingProvider } from "../sources/airbtics/market-listings.js";
import { MarketListingRepository } from "./repository.js";

const repository = new MarketListingRepository();
const existing = await repository.loadLatest();
if (!existing) throw new Error("Collect page 1 before requesting remaining pages.");

const apiKey = getServerEnvironment().airbticsApiKey;
if (!apiKey) throw new Error("AIRBTICS_API_KEY is required for market collection.");
const provider = new AirbticsMarketListingProvider({ apiKey });
const totalPages = Math.ceil(existing.providerTotalCount / 50);
const missingPages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((page) => !existing.collectedPages.includes(page));

for (const page of missingPages) {
  const result = await provider.fetchPage({ gateway: ARCH_ROCK_PILOT.gateway, bounds: ARCH_ROCK_PILOT.bounds, page });
  await repository.savePage({ ...ARCH_ROCK_PILOT, page, result });
  console.log(`Saved provider page ${page} with ${result.listings.length} listings.`);
}

console.log(missingPages.length ? `Completed ${missingPages.length} remaining provider page(s).` : "All provider pages were already saved.");
