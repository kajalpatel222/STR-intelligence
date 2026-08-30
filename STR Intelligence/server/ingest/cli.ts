import { resolve } from "node:path";
import { runListingIngestion } from "./run.js";
import { FixtureTransport } from "./fixture-transport.js";
import { ApifyTransport } from "../sources/apify/transport.js";

const [, , mode, fixturePath] = process.argv;

const query = {
  source: "zillow_existing_home" as const,
  location: "Oakhurst, CA",
  lookbackDays: Number(process.env.VITE_DEFAULT_LOOKBACK_DAYS ?? 7),
  recordLimit: Number(process.env.STR_INGEST_LIMIT ?? 5),
  listingCategory: "for_sale",
  homeType: "house",
};

async function main() {
  if (mode === "fixture") {
    if (!fixturePath) {
      throw new Error("Usage: npm run ingest:fixture -- <path-to-fixture.json>");
    }

    const repository = {
      async getMarket() {
        return {
          id: "fixture-market",
          name: "Oakhurst",
          state: "CA",
          zip_code: "93644",
          county: "Madera County",
          default_lookback_days: 7,
          max_lookback_days: 30,
        };
      },
      async ensureSource() {
        return { id: "fixture-source" };
      },
      async createSourceRun() {
        return {
          id: "fixture-run",
          sourceRun: { source: "zillow_existing_home", externalRunId: "fixture-run", status: "running" as const },
        };
      },
      async finishSourceRun() {},
      async upsertCanonicalProperty() {
        return { id: "fixture-canonical" };
      },
      async upsertPropertySourceId() {},
      async insertListingSnapshot() {
        return { id: "fixture-snapshot" };
      },
    };

    const result = await runListingIngestion({
      query,
      transport: new FixtureTransport(resolve(fixturePath)),
      repository: repository as never,
      pollUntilReady: false,
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (mode === "live") {
    const result = await runListingIngestion({
      query,
      transport: new ApifyTransport(),
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error("Usage: npm run ingest:fixture -- <fixture> | npm run ingest:live");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
