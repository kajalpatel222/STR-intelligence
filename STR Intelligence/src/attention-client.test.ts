import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_INVESTMENT_CRITERIA } from "../shared/investment-criteria.js";
import { evaluateCurrentListings } from "./attention-client.js";

test("evaluates the current batch without calling the property-search endpoint", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const evaluations = await evaluateCurrentListings(DEFAULT_INVESTMENT_CRITERIA, [{ price: 390000 }, { price: 410000 }], async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ evaluations: [{ listingIndex: 0 }, { listingIndex: 1 }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/attention-evaluation");
  assert.deepEqual((calls[0]?.body as { listings: unknown[] }).listings, [{ price: 390000 }, { price: 410000 }]);
  assert.equal(evaluations.length, 2);
});
