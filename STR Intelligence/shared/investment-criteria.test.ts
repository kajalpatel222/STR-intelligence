import { strict as assert } from "node:assert";
import test from "node:test";
import {
  createInvestmentCriteriaSnapshot,
  validateInvestmentCriteria,
} from "./investment-criteria.js";

const valid = {
  minimumPurchaseBudgetUsd: 350_000,
  maximumPurchaseBudgetUsd: 400_000,
  maximumImprovementReserveUsd: 40_000,
  mode: "strict" as const,
};

test("validates and round-trips canonical investment criteria", () => {
  const parsed = validateInvestmentCriteria(JSON.parse(JSON.stringify(valid)));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, valid);
});

test("returns safe errors for invalid money, modes, and budget order", () => {
  const invalidMoney = validateInvestmentCriteria({ ...valid, minimumPurchaseBudgetUsd: Number.NaN });
  assert.equal(invalidMoney.ok, false);
  if (!invalidMoney.ok) assert.equal(invalidMoney.errors[0]?.message, "Minimum purchase budget must be a non-negative amount.");

  const invalidOrder = validateInvestmentCriteria({ ...valid, minimumPurchaseBudgetUsd: 500_000 });
  assert.equal(invalidOrder.ok, false);
  if (!invalidOrder.ok) assert.equal(invalidOrder.errors[0]?.message, "Maximum purchase budget must be at least the minimum.");

  assert.equal(validateInvestmentCriteria({ ...valid, mode: "maybe" }).ok, false);
});

test("creates a frozen criteria snapshot independent of its input", () => {
  const input = { ...valid };
  const snapshot = createInvestmentCriteriaSnapshot(input);
  input.maximumPurchaseBudgetUsd = 999_000;
  assert.equal(snapshot.maximumPurchaseBudgetUsd, 400_000);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.notStrictEqual(snapshot, input);
});
