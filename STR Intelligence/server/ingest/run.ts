import type { ListingQuery, NormalizedSourceRecordUnion } from "../sources/listing-source.js";
import type { IngestionRepositoryPort, IngestionResult, IngestionTimings } from "./types.js";
import { normalizeSourceRecords } from "./normalize.js";
import { IngestionRepository } from "./repository.js";
import type { SourceAdapterTransport } from "./types.js";

function dedupeRecords(records: NormalizedSourceRecordUnion[]) {
  const seen = new Set<string>();
  const unique: NormalizedSourceRecordUnion[] = [];
  const duplicates: Extract<NormalizedSourceRecordUnion, { kind: "listing" }>[] = [];

  for (const record of records) {
    if (record.kind !== "listing") {
      unique.push(record);
      continue;
    }
    const key = `${record.externalId}::${record.address ?? record.title ?? ""}`;
    if (seen.has(key)) {
      duplicates.push(record);
      continue;
    }
    seen.add(key);
    unique.push(record);
  }

  return { unique, duplicates };
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function runListingIngestion(params: {
  query: ListingQuery;
  transport: SourceAdapterTransport;
  repository?: IngestionRepositoryPort;
  pollUntilReady?: boolean;
  pollTimeoutMs?: number;
  onTiming?: (timings: IngestionTimings) => void;
}): Promise<IngestionResult> {
  const totalStartedAt = performance.now();
  const setupPersistenceStartedAt = performance.now();
  const repository = params.repository ?? new IngestionRepository();
  const market = await repository.getMarket(params.query.location);
  const sourceKey = params.transport.sourceIdentity?.key ?? params.query.source;
  const sourceName = params.transport.sourceIdentity?.name ?? params.query.source;
  const sourceKind = params.transport.sourceIdentity?.kind ?? params.query.source;
  const source = await repository.ensureSource(sourceKey, sourceName, sourceKind);
  const created = await repository.createSourceRun({
    sourceId: source.id,
    marketId: market.id,
    lookbackDays: params.query.lookbackDays,
    notes: `limit=${params.query.recordLimit}; location=${params.query.location}`,
  });
  let supabasePersistenceMs = performance.now() - setupPersistenceStartedAt;

  let sourceRun;
  let rawResults;
  try {
    const triggerStartedAt = performance.now();
    sourceRun = await params.transport.submit(params.query);
    var triggerMs = performance.now() - triggerStartedAt;
    const collectionStartedAt = performance.now();
    if (params.pollUntilReady ?? true) {
      const pollStartedAt = Date.now();
      for (;;) {
        const current = await params.transport.status(sourceRun.externalRunId);
        if (current.status === "succeeded") break;
        if (current.status === "failed") throw new Error(current.notes ?? "Source collection failed");
        if (Date.now() - pollStartedAt >= (params.pollTimeoutMs ?? 300_000)) {
          throw new Error("Source collection timed out");
        }
        await wait(5_000);
      }
    }
    var collectionMs = performance.now() - collectionStartedAt;
    var downloadAndProcessingStartedAt = performance.now();
    rawResults = await params.transport.results(sourceRun.externalRunId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repository.finishSourceRun(created.id, "failed", message);
    throw error;
  }
  const normalized = normalizeSourceRecords(rawResults as unknown[], params.query);
  const { unique: deduped, duplicates } = dedupeRecords(normalized);
  const listingRecords = deduped.filter((record): record is Extract<NormalizedSourceRecordUnion, { kind: "listing" }> => record.kind === "listing");
  const providerErrors = deduped.filter((record) => record.kind === "provider_error");
  const downloadAndProcessingMs = performance.now() - downloadAndProcessingStartedAt;

  const canonicalPropertyIds: string[] = [];
  const snapshotIds: string[] = [];

  const finalPersistenceStartedAt = performance.now();
  for (const record of listingRecords) {
    const canonical = await repository.upsertCanonicalProperty(record, market.id);
    canonicalPropertyIds.push(canonical.id);
    await repository.upsertPropertySourceId({
      sourceId: source.id,
      canonicalPropertyId: canonical.id,
      record,
    });
    const snapshot = await repository.insertListingSnapshot({
      sourceRunId: created.id,
      sourceId: source.id,
      canonicalPropertyId: canonical.id,
      record,
    });
    snapshotIds.push(snapshot.id);
  }

  const runStatus = providerErrors.length && listingRecords.length ? "partial" : providerErrors.length ? "failed" : "succeeded";
  await repository.finishSourceRun(created.id, runStatus === "failed" ? "failed" : runStatus === "partial" ? "partial" : "succeeded", providerErrors.length ? `${providerErrors.length} provider errors` : undefined);
  supabasePersistenceMs += performance.now() - finalPersistenceStartedAt;
  const timings = {
    triggerMs,
    collectionMs,
    downloadAndProcessingMs,
    supabasePersistenceMs,
    totalMs: performance.now() - totalStartedAt,
  };
  params.onTiming?.(timings);

  return {
    sourceRunId: created.id,
    sourceRun,
    totalRecords: normalized.length,
    listingRecords: listingRecords.length,
    providerErrorRecords: providerErrors.length,
    deduplicatedRecords: deduped.length,
    runStatus,
    rawProviderRecords: rawResults,
    normalizedListings: listingRecords,
    duplicateListings: duplicates,
    providerErrors,
    snapshotIds,
    canonicalPropertyIds,
    timings,
  };
}
