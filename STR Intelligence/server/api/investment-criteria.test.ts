import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";
import { createInvestmentCriteriaHandler } from "./investment-criteria.js";

test("GET returns the safe criteria DTO", async () => {
  const handler = createInvestmentCriteriaHandler({
    async getDefaults() { return DEFAULT_INVESTMENT_CRITERIA; },
    async saveDefaults(criteria) { return criteria; },
  });
  assert.deepEqual(await handler.get(), { statusCode: 200, body: { criteria: DEFAULT_INVESTMENT_CRITERIA } });
});

test("PUT validates and saves criteria", async () => {
  let saved = false;
  const handler = createInvestmentCriteriaHandler({
    async getDefaults() { return DEFAULT_INVESTMENT_CRITERIA; },
    async saveDefaults(criteria) { saved = true; return criteria; },
  });
  const criteria = { ...DEFAULT_INVESTMENT_CRITERIA, maximumImprovementReserveUsd: 55_000 };
  const result = await handler.put({ criteria });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { criteria });
  assert.equal(saved, true);
});

test("PUT rejects invalid criteria without calling persistence", async () => {
  let saved = false;
  const handler = createInvestmentCriteriaHandler({
    async getDefaults() { return DEFAULT_INVESTMENT_CRITERIA; },
    async saveDefaults(criteria) { saved = true; return criteria; },
  });
  const result = await handler.put({ criteria: { ...DEFAULT_INVESTMENT_CRITERIA, maximumPurchaseBudgetUsd: -1 } });
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.status, "invalid");
  assert.equal(saved, false);
});
