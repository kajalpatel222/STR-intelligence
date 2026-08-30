import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";
import { CriteriaDefaultsRepository, type CriteriaDefaultsStore } from "./repository.js";

test("returns safe application defaults when the singleton row is absent", async () => {
  const repository = new CriteriaDefaultsRepository({
    async read() { return null; },
    async write(row) { return row; },
  });
  const criteria = await repository.getDefaults();
  assert.deepEqual(criteria, DEFAULT_INVESTMENT_CRITERIA);
  assert.notStrictEqual(criteria, DEFAULT_INVESTMENT_CRITERIA);
});

test("maps and saves the singleton row through an injected non-writing store", async () => {
  let stored: Parameters<CriteriaDefaultsStore["write"]>[0] | undefined;
  const repository = new CriteriaDefaultsRepository({
    async read() { return null; },
    async write(row) { stored = row; return row; },
  });
  const criteria = { ...DEFAULT_INVESTMENT_CRITERIA, mode: "strict" as const };
  assert.deepEqual(await repository.saveDefaults(criteria), criteria);
  assert.deepEqual(stored, {
    profile_key: "default",
    minimum_purchase_budget_usd: 350000,
    maximum_purchase_budget_usd: 400000,
    maximum_improvement_reserve_usd: 40000,
    mode: "strict",
  });
});
