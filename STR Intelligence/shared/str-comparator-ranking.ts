import type { ComparatorCandidate, ComparatorTarget } from "./str-comparator.js";

export type RankedComparable = Readonly<{
  candidate: ComparatorCandidate;
  distanceKm: number;
  similarityScore: number;
}>;

export function haversineDistanceKm(a: ComparatorTarget["coordinates"], b: ComparatorTarget["coordinates"]): number {
  const radiusKm = 6371.0088;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function rankComparableCandidates(
  target: ComparatorTarget,
  candidates: readonly ComparatorCandidate[],
  limit = 5,
): readonly RankedComparable[] {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("Comparable limit must be a non-negative integer.");
  const seen = new Set<string>();
  return candidates.flatMap((candidate, index) => {
    const dedupeKey = candidate.id.trim().toLocaleLowerCase("en-US");
    if (seen.has(dedupeKey) || !eligible(candidate)) return [];
    seen.add(dedupeKey);
    const distanceKm = haversineDistanceKm(target.coordinates, candidate.coordinates);
    const difference = Math.abs(target.bedrooms - candidate.bedrooms) * 2
      + Math.abs(target.bathrooms - candidate.bathrooms) * 1.5
      + Math.abs(target.accommodates - candidate.accommodates) * 0.5
      + distanceKm * 0.1;
    return [{ candidate, distanceKm, similarityScore: 1 / (1 + difference), index }];
  }).sort((a, b) => b.similarityScore - a.similarityScore || a.distanceKm - b.distanceKm || a.index - b.index)
    .slice(0, limit)
    .map(({ index: _index, ...ranked }) => Object.freeze(ranked));
}

function eligible(candidate: ComparatorCandidate) {
  return candidate.entireHome
    && Number.isFinite(candidate.advertisedNightlyRateUsd) && candidate.advertisedNightlyRateUsd > 0
    && validCoordinate(candidate.coordinates.latitude, -90, 90)
    && validCoordinate(candidate.coordinates.longitude, -180, 180);
}
function validCoordinate(value: number, minimum: number, maximum: number) { return Number.isFinite(value) && value >= minimum && value <= maximum; }
function radians(degrees: number) { return degrees * Math.PI / 180; }
