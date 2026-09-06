import { getServerEnvironment } from "../config/env.js";
import { AirbticsMarketListingProvider } from "../sources/airbtics/market-listings.js";
import { MarketListingRepository } from "./repository.js";
import { YOSEMITE_MARKET_REGIONS } from "./regions.js";
import type { YosemiteGateway } from "../../shared/market-listing.js";

const gateway = process.argv[2] as YosemiteGateway | undefined;
const region = gateway ? YOSEMITE_MARKET_REGIONS[gateway] : undefined;
if (!region || gateway === "arch_rock") throw new Error("Choose big_oak_flat or south.");

const apiKey = getServerEnvironment().airbticsApiKey;
if (!apiKey) throw new Error("AIRBTICS_API_KEY is required for market collection.");

const provider = new AirbticsMarketListingProvider({ apiKey });
const repository = new MarketListingRepository();
const first = await provider.fetchPage({ gateway: region.gateway, bounds: region.bounds, page: 1 });
await repository.savePage({ ...region, page: 1, result: first });
const totalPages = Math.ceil(first.providerTotalCount / 50);
console.log(`${region.label}: saved page 1 of ${totalPages} (${first.providerTotalCount} listings reported).`);

for (let page = 2; page <= totalPages; page += 1) {
  const result = await provider.fetchPage({ gateway: region.gateway, bounds: region.bounds, page });
  await repository.savePage({ ...region, page, result });
  console.log(`${region.label}: saved page ${page} of ${totalPages}.`);
}
