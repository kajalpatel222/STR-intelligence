import { readFile } from "node:fs/promises";
import { getServerEnvironment } from "../config/env.js";
import { ARCH_ROCK_PILOT } from "../api/market-listings.js";
import { MarketListingRepository } from "./repository.js";
import { AirbticsMarketListingProvider, normalizeAirbticsListingPage } from "../sources/airbtics/market-listings.js";

const fixturePath = process.argv[2];
const collectedAt = new Date().toISOString();
const environment = getServerEnvironment();
if (!fixturePath && !environment.airbticsApiKey) throw new Error("AIRBTICS_API_KEY is required for a live pilot collection.");

const result = fixturePath
  ? normalizeAirbticsListingPage(JSON.parse(await readFile(fixturePath, "utf8")), ARCH_ROCK_PILOT.gateway, collectedAt)
  : await new AirbticsMarketListingProvider({ apiKey: environment.airbticsApiKey! }).fetchPage({
      gateway: ARCH_ROCK_PILOT.gateway,
      bounds: ARCH_ROCK_PILOT.bounds,
      page: 1,
      collectedAt,
    });

await new MarketListingRepository().savePage({ ...ARCH_ROCK_PILOT, page: 1, result });
console.log(`Saved ${result.listings.length} market listings from one provider page (${result.providerTotalCount} reported in the bounded market).`);
