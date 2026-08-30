import { strict as assert } from "node:assert";
import test from "node:test";
import type { ComparatorCandidate, ComparatorTarget } from "./str-comparator.js";
import { haversineDistanceKm, rankComparableCandidates } from "./str-comparator-ranking.js";

const target: ComparatorTarget = { coordinates: { latitude: 0, longitude: 0 }, bedrooms: 2, bathrooms: 1, accommodates: 4 };
const candidate = (id: string, overrides: Partial<ComparatorCandidate> = {}): ComparatorCandidate => ({
  id, entireHome: true, coordinates: { latitude: 0, longitude: 0 }, bedrooms: 2, bathrooms: 1,
  accommodates: 4, advertisedNightlyRateUsd: 100, ...overrides,
});

test("calculates Haversine distance in kilometers", () => {
  assert.ok(Math.abs(haversineDistanceKm(target.coordinates, { latitude: 0, longitude: 1 }) - 111.195) < 0.001);
});

test("hard filters, deduplicates first occurrence, and caps stable ranking at five", () => {
  const input = [candidate("a"), candidate("A", { advertisedNightlyRateUsd: 999 }), candidate("room", { entireHome: false }),
    candidate("bad-price", { advertisedNightlyRateUsd: 0 }), candidate("bad-coordinate", { coordinates: { latitude: 91, longitude: 0 } }),
    candidate("b"), candidate("c"), candidate("d"), candidate("e"), candidate("f"), candidate("g")];
  assert.deepEqual(rankComparableCandidates(target, input).map(({ candidate: item }) => item.id), ["a", "b", "c", "d", "e"]);
});

test("ranks property similarity before distance and preserves input order for exact ties", () => {
  const ranked = rankComparableCandidates(target, [
    candidate("tie-first"), candidate("tie-second"),
    candidate("far-match", { coordinates: { latitude: 0, longitude: 0.01 } }),
    candidate("near-mismatch", { bedrooms: 3 }),
  ]);
  assert.deepEqual(ranked.map(({ candidate: item }) => item.id), ["tie-first", "tie-second", "far-match", "near-mismatch"]);
});
