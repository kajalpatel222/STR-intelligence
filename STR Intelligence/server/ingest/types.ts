import type {
  ListingQuery,
  NormalizedSourceRecordUnion,
  ProviderErrorRecord,
  SourceRun,
} from "../sources/listing-source.js";

export type Market = Readonly<{
  id: string;
  name: string;
  state: string;
  zip_code: string;
  county: string;
  default_lookback_days: number;
  max_lookback_days: number;
}>;

export type IngestionResult = Readonly<{
  sourceRunId: string;
  sourceRun: SourceRun;
  totalRecords: number;
  listingRecords: number;
  providerErrorRecords: number;
  deduplicatedRecords: number;
  runStatus: SourceRun["status"];
  rawProviderRecords: unknown[];
  normalizedListings: NormalizedListingRecord[];
  duplicateListings: NormalizedListingRecord[];
  providerErrors: ProviderErrorRecord[];
  snapshotIds: string[];
  canonicalPropertyIds: string[];
  timings: IngestionTimings;
}>;

export type IngestionTimings = Readonly<{
  triggerMs: number;
  collectionMs: number;
  downloadAndProcessingMs: number;
  supabasePersistenceMs: number;
  totalMs: number;
}>;

export type IngestionRepositoryPort = Readonly<
  Pick<
    import("./repository.js").IngestionRepository,
    | "getMarket"
    | "ensureSource"
    | "createSourceRun"
    | "finishSourceRun"
    | "upsertCanonicalProperty"
    | "upsertPropertySourceId"
    | "insertListingSnapshot"
  >
>;

export type SourceAdapterTransport = Readonly<{
  sourceIdentity?: Readonly<{ key: string; name: string; kind: string }>;
  submit(query: ListingQuery): Promise<SourceRun>;
  status(externalRunId: string): Promise<SourceRun>;
  results(externalRunId: string): Promise<NormalizedSourceRecordUnion[]>;
}>;

export type NormalizedListingRecord = Extract<NormalizedSourceRecordUnion, { kind: "listing" }>;
export type ProviderErrorListingRecord = ProviderErrorRecord;
