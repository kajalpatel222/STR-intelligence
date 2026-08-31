import assert from "node:assert/strict";
import test from "node:test";
import type { StrPotentialEvaluation } from "../../shared/str-potential.js";
import { StrPotentialRepository, type ResolvedStrPotentialSource, type StrPotentialStore } from "./repository.js";

const listingUrl = "https://www.zillow.com/homedetails/example/123_zpid/";
const source: ResolvedStrPotentialSource = Object.freeze({
  canonicalPropertyId: "property-1", listingSnapshotId: "snapshot-1", financialAnalysisRunId: "financial-1", listingUrl,
  property: { address_line1: "12 Pine Rd", city: "Oakhurst", state: "CA" },
  snapshot: { id: "snapshot-1", listing_url: listingUrl, list_price: 400000, raw_payload: { imgSrc: "https://photos.zillowstatic.com/home.jpg" } },
  financialAnalysis: { id: "financial-1", assumptions_snapshot: { improvementBudgetUsd: 40000 } }, comparables: [],
});

class MemoryStore implements StrPotentialStore {
  rows: Record<string, unknown>[] = [];
  async resolve(url: string) { return url === listingUrl ? source : undefined; }
  async findLatest() { return this.rows.at(-1); }
  async nextVersion() { return this.rows.length + 1; }
  async insert(row: Record<string, unknown>) { const saved = { id: `evaluation-${this.rows.length + 1}`, created_at: row.evaluated_at, ...structuredClone(row) }; this.rows.push(saved); return saved; }
}

test("resolves public Zillow URL and assembles evidence without exposing identifiers", async () => {
  const result = await new StrPotentialRepository(new MemoryStore()).assembleEvidence(listingUrl);
  assert.equal(result.evidence.property.address, "12 Pine Rd");
  assert.equal(result.evidence.improvementReserveUsd, 40000);
  assert.equal(JSON.stringify(result.evidence).includes("financial-1"), false);
  await assert.rejects(() => new StrPotentialRepository(new MemoryStore()).assembleEvidence("https://evil.test/listing"), /valid Zillow/);
});

test("stores immutable versions with evaluator metadata and a 30-day expiry", async () => {
  const store = new MemoryStore();
  const repository = new StrPotentialRepository(store);
  const { evidence } = await repository.assembleEvidence(listingUrl);
  await repository.save({ source, evidence, evaluation: evaluation("2026-08-31T12:00:00.000Z") });
  await repository.save({ source, evidence, evaluation: evaluation("2026-09-01T12:00:00.000Z") });
  assert.equal(store.rows.length, 2);
  assert.deepEqual(store.rows.map((row) => row.evaluation_version), [1, 2]);
  assert.equal(store.rows[0]?.provider, "openrouter");
  assert.equal(store.rows[0]?.model, "vision-model");
  assert.equal(store.rows[0]?.prompt_version, "str-potential-v1");
  assert.equal(store.rows[0]?.expires_at, "2026-09-30T12:00:00.000Z");
  assert.notEqual(store.rows[0]?.evidence_snapshot, evidence);
});

test("returns only evaluations still fresh within the 30-day cache window", async () => {
  const store = new MemoryStore();
  const repository = new StrPotentialRepository(store);
  const { evidence } = await repository.assembleEvidence(listingUrl);
  await repository.save({ source, evidence, evaluation: evaluation("2026-08-31T12:00:00.000Z") });
  assert.ok(await repository.findFresh(listingUrl, new Date("2026-09-15T00:00:00.000Z")));
  assert.equal(await repository.findFresh(listingUrl, new Date("2026-10-01T00:00:00.000Z")), undefined);
});

function evaluation(evaluatedAt: string): StrPotentialEvaluation {
  return Object.freeze({
    status: "completed", potential: "moderate", summary: "Useful existing features.", confidence: "moderate",
    confidenceExplanation: "Listing text and one photo are available.", strengths: [], risks: [], missingEvidence: [], recommendations: [],
    budget: { estimatedCostLowUsd: 0, estimatedCostHighUsd: 0, improvementReserveUsd: 40000, reserveGapLowUsd: 0, reserveGapHighUsd: 0 },
    evaluatedAt, model: { provider: "openrouter", model: "vision-model", promptVersion: "str-potential-v1" },
  });
}
