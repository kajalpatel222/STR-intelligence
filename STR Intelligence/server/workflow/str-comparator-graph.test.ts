import { strict as assert } from "node:assert";
import test from "node:test";
import { createStrComparatorGraph, initializeStrComparatorWorkflowState, toPersistedEvidence } from "./str-comparator-graph.js";
import type { StrComparatorProvider } from "../sources/str-comparator/provider.js";
import type { ComparisonCacheLookup, ComparatorTargetRecord, PersistedComparable, PersistedEvidence, StoredComparison, StrComparisonRepositoryPort } from "../str-comparator/repository.js";

const target: ComparatorTargetRecord = Object.freeze({ canonicalPropertyId: "private-property", listingSnapshotId: "private-snapshot", listingUrl: "https://www.zillow.com/homedetails/target", city: "Oakhurst", state: "CA", bedrooms: 3, bathrooms: 2, latitude: 37.33, longitude: -119.65 });

function fixtures(count = 7) { return Array.from({ length: count }, (_, index) => ({ provider: "airbnb" as const, listingId: `stay-${index}`, url: `https://www.airbnb.com/rooms/${index}`, title: `Stay ${index}`, roomType: "Entire home", latitude: 37.33 + index * .001, longitude: -119.65, bedrooms: 3, bathrooms: 2, maxGuests: 6, nightlyRate: 200 + index, scrapedAt: "2026-08-30T00:00:00.000Z" })); }

class MemoryRepository implements StrComparisonRepositoryPort {
  saved: PersistedComparable[] = []; evidence: PersistedEvidence[] = []; target = { ...target }; runId = "private-run"; reference?: string; cacheStatus: ComparisonCacheLookup["status"] = "missing";
  async resolveTarget() { return this.target; }
  async findComparisonCache() { return this.cacheStatus === "missing" ? { status: "missing" as const } : { status: this.cacheStatus, publicReference: this.reference!, expiresAt: "2026-09-06T00:00:00.000Z" }; }
  async createRun(params: { publicReference: string }) { this.reference = params.publicReference; return this.runId; }
  async resolveRunId() { return this.runId; }
  async saveDiscovery(_runId: string, candidates: readonly PersistedComparable[]) { this.saved = [...candidates]; }
  async saveEvidence(_runId: string, evidence: readonly PersistedEvidence[]) { this.evidence = [...evidence]; }
  async updateSelections() {}
  async loadComparison(): Promise<StoredComparison | undefined> { return undefined; }
}

function provider(records = fixtures()): StrComparatorProvider & { calls: number } {
  return { calls: 0, async discover() { this.calls += 1; return { records, errors: [] }; }, async collectCalendars() { this.calls += 1; return { records: [], errors: [] }; } };
}

test("database discovery persists every eligible stay within five miles", async () => {
  const repository = new MemoryRepository(); const source = provider();
  const result = await createStrComparatorGraph({ provider: source, repository }).invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: "wf", intent: "discover", listingUrl: target.listingUrl }) });
  assert.equal(result.workflowState.status, "completed");
  assert.equal(source.calls, 1);
  assert.equal(repository.saved.length, 7);
  assert.ok(result.workflowState.comparisonReference);
});

test("uses the requested radius for deterministic discovery and persistence", async () => {
  const repository = new MemoryRepository();
  const source = provider([
    { ...fixtures(1)[0]!, latitude: 37.337, listingId: "inside", url: "https://www.airbnb.com/rooms/inside" },
    { ...fixtures(1)[0]!, latitude: 37.36, listingId: "outside", url: "https://www.airbnb.com/rooms/outside" },
  ]);
  const result = await createStrComparatorGraph({ provider: source, repository }).invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: "wf", intent: "discover", listingUrl: target.listingUrl, radiusMiles: 1 }) });
  assert.equal(result.workflowState.radiusMiles, 1);
  assert.deepEqual(repository.saved.map((item) => item.providerListingKey), ["inside"]);
});

test("fresh cache bypasses provider", async () => {
  const repository = new MemoryRepository(); repository.reference = "4e14ec72-fdf3-45e7-8e5f-04835a476dde"; repository.cacheStatus = "fresh";
  const source = provider();
  const result = await createStrComparatorGraph({ provider: source, repository }).invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: "wf", intent: "discover", listingUrl: target.listingUrl }) });
  assert.equal(result.workflowState.comparisonReference, repository.reference);
  assert.equal(source.calls, 0);
  assert.equal(result.workflowState.dataOrigin, "fresh_cache");
});

test("stale cache refreshes through the provider and persists a new immutable run", async () => {
  const repository = new MemoryRepository(); repository.reference = "4e14ec72-fdf3-45e7-8e5f-04835a476dde"; repository.cacheStatus = "stale";
  const source = provider();
  const result = await createStrComparatorGraph({ provider: source, repository }).invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: "wf", intent: "discover", listingUrl: target.listingUrl }) });
  assert.equal(source.calls, 1);
  assert.equal(repository.saved.length, 7);
  assert.equal(result.workflowState.dataOrigin, "market_database");
  assert.notEqual(result.workflowState.comparisonReference, "4e14ec72-fdf3-45e7-8e5f-04835a476dde");
});

test("provider failure returns stale stored comparables instead of failing the request", async () => {
  const repository = new MemoryRepository(); repository.reference = "4e14ec72-fdf3-45e7-8e5f-04835a476dde"; repository.cacheStatus = "stale";
  const source = provider(); source.discover = async () => { source.calls += 1; throw new Error("provider unavailable"); };
  const result = await createStrComparatorGraph({ provider: source, repository }).invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: "wf", intent: "discover", listingUrl: target.listingUrl }) });
  assert.equal(result.workflowState.status, "partial");
  assert.equal(result.workflowState.dataOrigin, "saved_fallback");
  assert.equal(result.workflowState.comparisonReference, repository.reference);
  assert.equal(repository.saved.length, 0);
});

test("contained provider errors with no usable records also fall back to stale comparables", async () => {
  const repository = new MemoryRepository(); repository.reference = "4e14ec72-fdf3-45e7-8e5f-04835a476dde"; repository.cacheStatus = "stale";
  const source = provider(); source.discover = async () => ({ records: [], errors: [{ stage: "discovery", code: "provider_failure", message: "contained" }] });
  const result = await createStrComparatorGraph({ provider: source, repository }).invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: "wf", intent: "discover", listingUrl: target.listingUrl }) });
  assert.equal(result.workflowState.dataOrigin, "saved_fallback");
  assert.equal(result.workflowState.comparisonReference, repository.reference);
});

test("provider failure without stored comparables reports provider unavailable", async () => {
  const repository = new MemoryRepository();
  const source = provider(); source.discover = async () => { source.calls += 1; throw new Error("provider unavailable"); };
  const result = await createStrComparatorGraph({ provider: source, repository }).invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: "wf", intent: "discover", listingUrl: target.listingUrl }) });
  assert.equal(result.workflowState.failureCode, "provider_unavailable");
  assert.equal(result.workflowState.comparisonReference, undefined);
});

test("explicit refresh bypasses a fresh cache", async () => {
  const repository = new MemoryRepository(); repository.reference = "4e14ec72-fdf3-45e7-8e5f-04835a476dde"; repository.cacheStatus = "fresh";
  const source = provider();
  const result = await createStrComparatorGraph({ provider: source, repository }).invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: "wf", intent: "discover", listingUrl: target.listingUrl, bypassCache: true }) });
  assert.equal(source.calls, 1);
  assert.equal(result.workflowState.dataOrigin, "market_database");
});

test("sorts and deduplicates calendar dates before the 90-day signal", () => {
  const evidence = toPersistedEvidence({ provider: "airbnb", listingId: "stay", days: [
    { date: "2026-09-03", available: false, nightlyRate: 240 },
    { date: "2026-09-01", available: true, nightlyRate: 200 },
    { date: "2026-09-03", available: true, nightlyRate: 250 },
    { date: "not-a-date", available: false, nightlyRate: 999 },
  ], scrapedAt: "2026-09-01T12:00:00Z" })[0]!;
  assert.equal(evidence.calendar.windowStart, "2026-09-01");
  assert.equal(evidence.calendar.windowEnd, "2026-09-03");
  assert.equal(evidence.calendar.availableNights, 2);
  assert.equal(evidence.rates.length, 2);
});

test("persists selected calendar evidence without a manual decision gate", async () => {
  const repository = new MemoryRepository();
  repository.loadComparison = async () => ({ publicReference: "4e14ec72-fdf3-45e7-8e5f-04835a476dde", status: "discovered", stage: "discovery", target: repository.target, candidates: repository.saved.map((item) => ({ ...item, included: true })) });
  repository.saved = [{ providerListingKey: "stay-1", listingUrl: "https://www.airbnb.com/rooms/1", latitude: 37.33, longitude: -119.65, distanceMiles: 1, bedrooms: 3, bathrooms: 2, guestCapacity: 6, amenities: [], observedNightlyPriceUsd: 200, observedCheckIn: "2026-09-11", observedCheckOut: "2026-09-13", similarityScore: 90, matchReasons: [], observedAt: "2026-08-30T00:00:00Z", rawPayload: {} }];
  const source: StrComparatorProvider = { async discover() { return { records: [], errors: [] }; }, async collectCalendars() { return { records: [{ provider: "airbnb", listingId: "stay-1", days: [{ date: "2026-09-01", available: true, nightlyRate: 210 }], scrapedAt: "2026-09-01T12:00:00Z" }], errors: [] }; } };
  const result = await createStrComparatorGraph({ provider: source, repository }).invoke({ workflowState: initializeStrComparatorWorkflowState({ workflowId: "wf", intent: "enrich", listingUrl: target.listingUrl, comparisonReference: "4e14ec72-fdf3-45e7-8e5f-04835a476dde", selectedListingUrls: ["https://www.airbnb.com/rooms/1"] }) });
  assert.equal(result.workflowState.status, "completed");
  assert.equal(repository.evidence.length, 1);
});
