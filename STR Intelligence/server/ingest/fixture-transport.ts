import { readFile } from "node:fs/promises";
import type { ListingQuery, NormalizedSourceRecordUnion, SourceRun } from "../sources/listing-source.js";

export class FixtureTransport {
  constructor(private readonly fixturePath: string) {}

  async submit(query: ListingQuery): Promise<SourceRun> {
    return {
      source: query.source,
      externalRunId: `fixture_${query.source}`,
      status: "succeeded",
      notes: `Loaded from ${this.fixturePath}`,
    };
  }

  async status(externalRunId: string): Promise<SourceRun> {
    return { source: "zillow_existing_home", externalRunId, status: "succeeded" };
  }

  async results(): Promise<NormalizedSourceRecordUnion[]> {
    const raw = await readFile(this.fixturePath, "utf8");
    return JSON.parse(raw) as NormalizedSourceRecordUnion[];
  }
}
