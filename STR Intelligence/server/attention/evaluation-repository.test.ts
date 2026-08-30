import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";
import { evaluateStoredHomesBatch } from "./batch-evaluation.js";
import {
  AttentionEvaluationRepository,
  type AttentionBatchStatus,
  type AttentionEvaluationOutcomeRow,
  type AttentionEvaluationStore,
} from "./evaluation-repository.js";
import type { StoredHomeSnapshot } from "./stored-home-repository.js";

function home(snapshotId: string, propertyId: string, price?: number) {
  const latest: StoredHomeSnapshot = {
    snapshotId,
    canonicalPropertyId: propertyId,
    observedAt: "2026-08-29T12:00:00.000Z",
    price,
    amenities: [],
    propertyType: "SINGLE_FAMILY",
    city: "Oakhurst",
    state: "CA",
  };
  return { canonicalPropertyId: propertyId, latest, history: [latest] };
}

test("persists evaluated and unscorable outcomes under one immutable run", async () => {
  const result = await evaluateStoredHomesBatch({
    homes: { async listStoredHomes() { return [home("snapshot-a", "home-a", 375_000), home("snapshot-b", "home-b")]; } },
    criteria: { async getDefaults() { return DEFAULT_INVESTMENT_CRITERIA; } },
  });
  const recorded = recordingStore();
  const persisted = await new AttentionEvaluationRepository(recorded.store).persist(result);

  assert.deepEqual(persisted, { runId: "run-1", status: "succeeded" });
  assert.deepEqual(recorded.criteria, [DEFAULT_INVESTMENT_CRITERIA]);
  assert.equal(recorded.outcomes.length, 2);
  assert.deepEqual(recorded.outcomes.map((row) => row.outcome), ["evaluated", "unscorable"]);
  assert.equal(recorded.outcomes[0]?.listing_snapshot_id, "snapshot-a");
  assert.equal(recorded.outcomes[0]?.priority_band, "promising");
  assert.equal(recorded.outcomes[1]?.priority_band, "ineligible");
  assert.deepEqual(recorded.finished, [{ runId: "run-1", status: "succeeded", totalHomes: 2 }]);
});

test("records contained failures and marks the run partial", async () => {
  const valid = home("snapshot-ok", "home-ok", 375_000);
  const bad = home("snapshot-bad", "home-bad", 375_000);
  const result = await evaluateStoredHomesBatch({
    homes: { async listStoredHomes() { return [valid, { ...bad, latest: { ...bad.latest, amenities: null as never } }]; } },
    criteria: { async getDefaults() { return DEFAULT_INVESTMENT_CRITERIA; } },
  });
  const recorded = recordingStore();
  const persisted = await new AttentionEvaluationRepository(recorded.store).persist(result);

  assert.equal(persisted.status, "partial");
  assert.equal(recorded.outcomes.find((row) => row.outcome === "failed")?.failure_message, "This stored home could not be evaluated.");
  assert.equal(recorded.finished[0]?.status, "partial");
});

test("separate batch calls create separate append-only run identities", async () => {
  const result = await evaluateStoredHomesBatch({
    homes: { async listStoredHomes() { return [home("snapshot-a", "home-a", 375_000)]; } },
    criteria: { async getDefaults() { return DEFAULT_INVESTMENT_CRITERIA; } },
  });
  const recorded = recordingStore();
  const repository = new AttentionEvaluationRepository(recorded.store);
  const first = await repository.persist(result);
  const second = await repository.persist(result);
  assert.notEqual(first.runId, second.runId);
  assert.deepEqual(recorded.outcomes.map((row) => row.evaluation_run_id), ["run-1", "run-2"]);
});

function recordingStore() {
  const criteria: unknown[] = [];
  const outcomes: AttentionEvaluationOutcomeRow[] = [];
  const finished: Array<{ runId: string; status: AttentionBatchStatus; totalHomes: number }> = [];
  let runs = 0;
  const store: AttentionEvaluationStore = {
    async createRun(snapshot) { criteria.push(snapshot); runs += 1; return `run-${runs}`; },
    async insertOutcomes(rows) { outcomes.push(...rows); },
    async finishRun(runId, result, status) { finished.push({ runId, status, totalHomes: result.totalHomes }); },
  };
  return { store, criteria, outcomes, finished };
}
