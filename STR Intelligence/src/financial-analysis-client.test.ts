import { strict as assert } from "node:assert";
import test from "node:test";
import { createFinancialAssumptions } from "../shared/financial-assumptions.js";
import { calculateBaseCaseFinancials } from "../shared/financial-calculator.js";
import { loadFinancialAnalyses, saveFinancialAnalysis } from "./financial-analysis-client.js";

const assumptions = createFinancialAssumptions({ purchasePriceUsd: 327_000 });
const analysis = {
  property: { listingUrl: "https://www.zillow.com/homedetails/123", title: "Pine Cabin", priceUsd: 327_000 },
  assumptions,
  result: calculateBaseCaseFinancials(assumptions),
  savedAt: "2026-08-30T20:00:00Z",
};

test("saves and loads analyses through the narrow browser API", async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response(JSON.stringify(init?.method === "POST" ? { analysis } : { analyses: [analysis] }), { status: init?.method === "POST" ? 201 : 200 });
  };
  const saved = await saveFinancialAnalysis({ property: analysis.property, assumptions }, fetcher);
  const listed = await loadFinancialAnalyses(fetcher);
  assert.deepEqual(calls, [{ url: "/api/financial-analyses", method: "POST" }, { url: "/api/financial-analyses", method: undefined }]);
  assert.equal(saved.property.title, "Pine Cabin");
  assert.equal(listed.length, 1);
  assert.equal(Object.isFrozen(listed), true);
  assert.equal(Object.isFrozen(listed[0]!.result), true);
});

test("surfaces safe errors and rejects incomplete responses", async () => {
  await assert.rejects(
    () => saveFinancialAnalysis({ property: analysis.property, assumptions }, async () => new Response(JSON.stringify({ message: "Could not save." }), { status: 500 })),
    /Could not save/,
  );
  await assert.rejects(
    () => loadFinancialAnalyses(async () => new Response(JSON.stringify({ analyses: [{ property: {} }] }), { status: 200 })),
    /incomplete response/,
  );
});
