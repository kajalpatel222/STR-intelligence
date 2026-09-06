import { strict as assert } from "node:assert";
import test from "node:test";
import { checkStrRevenueEstimate, lookupStrRevenueEstimate, purchaseStrRevenueEstimate } from "./str-revenue-estimate-client.js";

test("client keeps lookup free and sends explicit cost confirmation for purchase", async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ status: "not_requested" }), { status: 200, headers: { "Content-Type": "application/json" } }); };
  await lookupStrRevenueEstimate("https://www.zillow.com/homedetails/1", fetcher);
  await purchaseStrRevenueEstimate("https://www.zillow.com/homedetails/1", fetcher);
  await checkStrRevenueEstimate("https://www.zillow.com/homedetails/1", fetcher);
  assert.deepEqual(bodies, [
    { listingUrl: "https://www.zillow.com/homedetails/1", action: "lookup" },
    { listingUrl: "https://www.zillow.com/homedetails/1", action: "purchase", confirmedCostUsd: .1 },
    { listingUrl: "https://www.zillow.com/homedetails/1", action: "status" },
  ]);
});
