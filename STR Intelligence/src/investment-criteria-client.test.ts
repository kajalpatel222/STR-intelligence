import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_INVESTMENT_CRITERIA } from "../shared/investment-criteria.js";
import { createInvestmentCriteriaClient } from "./investment-criteria-client.js";

test("loads and saves criteria through the narrow browser API", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input: String(input), init });
    return new Response(JSON.stringify({ criteria: DEFAULT_INVESTMENT_CRITERIA }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createInvestmentCriteriaClient(fetcher as typeof fetch);
  assert.deepEqual(await client.load(), DEFAULT_INVESTMENT_CRITERIA);
  assert.deepEqual(await client.save(DEFAULT_INVESTMENT_CRITERIA), DEFAULT_INVESTMENT_CRITERIA);
  assert.equal(requests[0]?.input, "/api/investment-criteria");
  assert.equal(requests[1]?.init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), { criteria: DEFAULT_INVESTMENT_CRITERIA });
});

test("surfaces safe load and save errors", async () => {
  const loadClient = createInvestmentCriteriaClient(async () => new Response("{}", { status: 503 }));
  await assert.rejects(loadClient.load(), /could not be loaded/);
  const saveClient = createInvestmentCriteriaClient(async () => new Response(JSON.stringify({ message: "Check the values." }), { status: 400 }));
  await assert.rejects(saveClient.save(DEFAULT_INVESTMENT_CRITERIA), /Check the values/);
});
