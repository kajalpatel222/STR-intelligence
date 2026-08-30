import { strict as assert } from "node:assert";
import test from "node:test";
import { calculateComparatorSummary, validateComparatorRequest } from "./str-comparator.js";

const request = () => ({
  target: { coordinates: { latitude: 37.77, longitude: -122.42 }, bedrooms: 2, bathrooms: 1, accommodates: 4 },
  candidates: [{
    id: "safe-1", name: "Safe home", entireHome: true,
    coordinates: { latitude: 37.771, longitude: -122.42 }, bedrooms: 2, bathrooms: 1, accommodates: 4,
    advertisedNightlyRateUsd: 200,
    rateObservations: [{ date: "2026-08-01", nightlyRateUsd: 100.1 }, { date: "2026-08-02", nightlyRateUsd: 100.2 }],
    calendarObservations: [{ date: "2026-08-01", availability: "unavailable" as const }, { date: "2026-08-02", availability: "available" as const }, { date: "2026-08-03", availability: "unknown" as const }],
  }],
});

test("validates deterministically and returns a defensive frozen copy", () => {
  const input = request();
  const result = validateComparatorRequest(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  input.target.bedrooms = 99;
  input.candidates[0]!.rateObservations[0]!.nightlyRateUsd = 999;
  assert.equal(result.value.target.bedrooms, 2);
  assert.equal(result.value.candidates[0]!.rateObservations![0]!.nightlyRateUsd, 100.1);
  assert.equal(Object.isFrozen(result.value.candidates[0]!.rateObservations), true);

  const invalid = validateComparatorRequest({ target: {}, candidates: [{}] });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.deepEqual(invalid.errors.slice(0, 2).map((item) => item.path), ["target.coordinates", "target.bedrooms"]);
});

test("calculates decimal ADR and calendar unavailability without labeling it occupancy", () => {
  const summary = calculateComparatorSummary(request());
  assert.equal(summary.comparables[0]!.estimatedAdrUsd, 100.15);
  assert.equal(summary.comparables[0]!.calendarUnavailablePercentage, 50);
  assert.equal(summary.comparables[0]!.calendarObservationCount, 2);
  assert.equal(JSON.stringify(summary).toLowerCase().includes("occupancy"), false);
});

test("summarizes medians, ranges, and sparse or missing evidence", () => {
  const input = request();
  input.candidates.push({ ...input.candidates[0]!, id: "safe-2", rateObservations: [{ date: "2026-08-01", nightlyRateUsd: 200 }], calendarObservations: [] });
  const summary = calculateComparatorSummary(input);
  assert.equal(summary.status, "sparse_evidence");
  assert.deepEqual(summary.market.estimatedAdrRangeUsd, { minimum: 100.15, maximum: 200 });
  assert.equal(summary.market.estimatedAdrMedianUsd, 150.08);
  assert.deepEqual(summary.market.calendarUnavailableRangePercentage, { minimum: 50, maximum: 50 });
  assert.ok(summary.reasonCodes.includes("SPARSE_CALENDAR_EVIDENCE"));

  input.candidates = [{ ...input.candidates[0]!, id: "none", rateObservations: [], calendarObservations: [] }];
  const missing = calculateComparatorSummary(input);
  assert.equal(missing.comparables[0]!.evidenceConfidence, "none");
  assert.equal(missing.market.estimatedAdrMedianUsd, null);
});

test("public DTOs are frozen allow-lists that cannot expose provider keys or raw data", () => {
  const input = request() as ReturnType<typeof request> & { providerKey?: string; raw?: unknown };
  input.providerKey = "secret";
  input.raw = { token: "secret" };
  Object.assign(input.candidates[0]!, { providerListingKey: "secret", rawData: { token: "secret" } });
  const summary = calculateComparatorSummary(input);
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("provider"), false);
  assert.equal(serialized.includes("rawData"), false);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.comparables), true);
});

test("returns a concise no-comparables result after hard filtering", () => {
  const input = request();
  input.candidates.push({ ...input.candidates[0]!, id: "bad-price", advertisedNightlyRateUsd: 0 });
  input.candidates.push({ ...input.candidates[0]!, id: "bad-coordinate", coordinates: { latitude: 999, longitude: 0 } });
  input.candidates[0]!.entireHome = false;
  const summary = calculateComparatorSummary(input);
  assert.equal(summary.status, "no_comparables");
  assert.equal(summary.comparableCount, 0);
  assert.deepEqual(summary.reasonCodes, ["NO_ELIGIBLE_COMPARABLES"]);
});
