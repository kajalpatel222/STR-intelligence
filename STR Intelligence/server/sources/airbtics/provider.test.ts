import { strict as assert } from "node:assert";
import test from "node:test";
import { AirbticsProvider, normalizeReport } from "./provider.js";

test("normalizes common Airbtics summary fields and ratio occupancy", () => {
  assert.deepEqual(normalizeReport({ message: { summary: { average_daily_rate: "$285", occupancy_rate: 0.61, annual_revenue: "63,400", comparable_count: 12 } } }), {
    estimatedAdrUsd: 285, estimatedOccupancyPercent: 61, estimatedAnnualRevenueUsd: 63_400, comparableCount: 12,
  });
});

test("normalizes the live summary report field names", () => {
  assert.deepEqual(normalizeReport({ message: { nightly_rate: 321, occupancy_rate: 80, revenue: 99_332, comps_status: "fetched" } }), {
    estimatedAdrUsd: 321, estimatedOccupancyPercent: 80, estimatedAnnualRevenueUsd: 99_332,
  });
});

test("creates and retrieves a summary without exposing the API key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new AirbticsProvider({ apiKey: "private-key", timeoutMs: 100, fetcher: async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(calls.length === 1 ? { message: { report_id: "report-1" } } : { message: { adr: 250, occupancy: 55, revenue: 50_000 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  const reference = await provider.startSummary({ latitude: 37, longitude: -119, bedrooms: 3, bathrooms: 2, accommodates: 6 });
  const result = await provider.readSummary(reference);
  assert.equal(result.status, "complete");
  assert.equal(result.status === "complete" && result.estimate.estimatedAnnualRevenueUsd, 50_000);
  assert.equal(calls[0]!.url.endsWith("/report/summary"), true);
  assert.equal(calls[1]!.url.includes("/report?id=report-1"), true);
  assert.equal((calls[0]!.init?.headers as Record<string, string>)["x-api-key"], "private-key");
  assert.doesNotMatch(JSON.stringify(result), /private-key/);
});

test("does not mistake an unknown successful payload for a pending report", async () => {
  const provider = new AirbticsProvider({ apiKey: "private-key", fetcher: async () => new Response(JSON.stringify({ message: { unknown: true } }), { status: 200 }) });
  assert.deepEqual(await provider.readSummary("report-1"), { status: "failed", reason: "unexpected_response" });
});
