import { strict as assert } from "node:assert";
import test from "node:test";
import { createStrComparisonLinksHandler, createStrComparisonsHandler, toPublicComparison } from "./str-comparisons.js";
import type { StoredComparison, StrComparisonRepositoryPort } from "../str-comparator/repository.js";

const reference = "4e14ec72-fdf3-45e7-8e5f-04835a476dde";
const stored: StoredComparison = { publicReference: reference, status: "discovered", stage: "discovery", target: { canonicalPropertyId: "secret-property", listingSnapshotId: "secret-snapshot", listingUrl: "https://www.zillow.com/homedetails/target", latitude: 37, longitude: -119, address: "Target home" }, candidates: [{ providerListingKey: "secret-provider-key", listingUrl: "https://www.airbnb.com/rooms/123", title: "Cabin", latitude: 37, longitude: -119, distanceMiles: 2, amenities: ["Wifi"], adrLtmUsd: 250, occupancyLtmPercent: 72, annualRevenueLtmUsd: 54_000, marketCollectedAt: "2026-09-06T00:00:00.000Z", similarityScore: 90, matchReasons: ["Nearby location"], observedAt: "2026-08-30T00:00:00.000Z", rawPayload: { secret: true }, included: true }] };

function repository(): StrComparisonRepositoryPort { return { async resolveTarget() { return stored.target; }, async findComparisonCache() { return { status: "missing" }; }, async createRun() { return "secret-run"; }, async resolveRunId() { return "secret-run"; }, async saveDiscovery() {}, async saveEvidence() {}, async updateSelections() {}, async loadComparison(value) { return value === reference ? stored : undefined; } }; }

test("public DTO excludes provider, database and raw evidence identifiers", () => {
  const serialized = JSON.stringify(toPublicComparison(stored));
  assert.doesNotMatch(serialized, /secret-property|secret-snapshot|secret-provider-key|rawPayload|canonicalProperty/i);
  assert.match(serialized, /Cabin/);
  assert.match(serialized, /250/);
  assert.match(serialized, /54000/);
  assert.match(serialized, /occupancyLtmPercent/);
  assert.match(serialized, /radiusMiles/);
});

test("API validates references, provider URLs, and retains one selection", async () => {
  let invoked = 0;
  let radiusMiles = 0;
  const handler = createStrComparisonsHandler({ async invoke({ workflowState }) { invoked += 1; radiusMiles = workflowState.radiusMiles; return { workflowState: { ...workflowState, comparisonReference: reference, status: "completed" } }; } }, repository());
  assert.equal((await handler.create({ listingUrl: "javascript:alert(1)" })).statusCode, 400);
  assert.equal((await handler.create({ listingUrl: stored.target.listingUrl, radiusMiles: 3 })).statusCode, 400);
  assert.equal((await handler.create({ listingUrl: stored.target.listingUrl, radiusMiles: 10 })).statusCode, 200);
  assert.equal(radiusMiles, 10);
  assert.equal((await handler.create({ listingUrl: stored.target.listingUrl })).statusCode, 200);
  assert.equal(radiusMiles, 1);
  assert.equal((await handler.get("not-a-reference")).statusCode, 400);
  assert.equal((await handler.select(reference, { listingUrls: [] })).statusCode, 400);
  assert.equal((await handler.select(reference, { listingUrls: ["https://evil.example/123"] })).statusCode, 400);
  assert.equal(invoked, 2);
});

test("coalesces concurrent database discovery requests", async () => {
  let calls = 0;
  const graph = { async invoke({ workflowState }: any) { calls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { workflowState: { ...workflowState, comparisonReference: reference, status: "completed" } }; } };
  const handler = createStrComparisonsHandler(graph, repository());
  const [first, second] = await Promise.all([handler.create({ listingUrl: stored.target.listingUrl }), handler.create({ listingUrl: stored.target.listingUrl })]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 1);
});

test("rejects selections that do not belong to the comparison", async () => {
  let selectionWrites = 0;
  const store = { ...repository(), async updateSelections() { selectionWrites += 1; } };
  const handler = createStrComparisonsHandler({ async invoke({ workflowState }) { return { workflowState }; } }, store);
  const result = await handler.select(reference, { listingUrls: ["https://www.airbnb.com/rooms/unrelated"] });
  assert.equal(result.statusCode, 400);
  assert.equal(selectionWrites, 0);
});

test("refreshes one saved calendar without changing comparable selections", async () => {
  let selectionWrites = 0;
  let selectedUrls: readonly string[] = [];
  const store = { ...repository(), async updateSelections() { selectionWrites += 1; } };
  const handler = createStrComparisonsHandler({ async invoke({ workflowState }) { selectedUrls = workflowState.selectedListingUrls; return { workflowState: { ...workflowState, status: "completed" } }; } }, store);
  const result = await handler.refreshCalendar({ reference, listingUrl: stored.candidates[0]!.listingUrl });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(selectedUrls, [stored.candidates[0]!.listingUrl]);
  assert.equal(selectionWrites, 0);
  assert.equal((await handler.refreshCalendar({ reference, listingUrl: "https://www.airbnb.com/rooms/unrelated" })).statusCode, 400);
});

test("returns only existing saved comparison links without invoking discovery", async () => {
  const listingUrl = stored.target.listingUrl;
  const handler = createStrComparisonLinksHandler({ async findSavedComparisons(urls) {
    assert.deepEqual(urls, [listingUrl]);
    return { [listingUrl]: reference };
  } });
  const result = await handler({ listingUrls: [listingUrl] });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.comparisons, { [listingUrl]: reference });
  assert.equal((await handler({ listingUrls: ["https://evil.example/home"] })).statusCode, 400);
});
