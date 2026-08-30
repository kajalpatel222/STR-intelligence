import { rankComparableCandidates } from "./str-comparator-ranking.js";

export type Coordinates = Readonly<{ latitude: number; longitude: number }>;

export type ComparatorTarget = Readonly<{
  coordinates: Coordinates;
  bedrooms: number;
  bathrooms: number;
  accommodates: number;
}>;

export type RateObservation = Readonly<{ date: string; nightlyRateUsd: number }>;
export type CalendarObservation = Readonly<{
  date: string;
  availability: "available" | "unavailable" | "unknown";
}>;

/** Source adapters must construct this allow-listed shape; provider records stay private. */
export type ComparatorCandidate = Readonly<{
  id: string;
  name?: string;
  entireHome: boolean;
  coordinates: Coordinates;
  bedrooms: number;
  bathrooms: number;
  accommodates: number;
  advertisedNightlyRateUsd: number;
  rateObservations?: readonly RateObservation[];
  calendarObservations?: readonly CalendarObservation[];
}>;

export type ComparatorRequest = Readonly<{
  target: ComparatorTarget;
  candidates: readonly ComparatorCandidate[];
}>;

export const COMPARATOR_STATUSES = ["complete", "sparse_evidence", "no_comparables"] as const;
export type ComparatorStatus = (typeof COMPARATOR_STATUSES)[number];
export const COMPARATOR_REASON_CODES = [
  "COMPARABLES_READY",
  "SPARSE_RATE_EVIDENCE",
  "SPARSE_CALENDAR_EVIDENCE",
  "NO_ELIGIBLE_COMPARABLES",
] as const;
export type ComparatorReasonCode = (typeof COMPARATOR_REASON_CODES)[number];
export type EvidenceConfidence = "high" | "medium" | "low" | "none";

export type ComparatorValidationError = Readonly<{ path: string; code: "required" | "invalid"; message: string }>;
export type ComparatorValidationResult =
  | Readonly<{ ok: true; value: ComparatorRequest }>
  | Readonly<{ ok: false; errors: readonly ComparatorValidationError[] }>;

export type ComparableSummary = Readonly<{
  id: string;
  name?: string;
  distanceKm: number;
  similarityScore: number;
  estimatedAdrUsd: number | null;
  adrObservationCount: number;
  calendarUnavailablePercentage: number | null;
  calendarObservationCount: number;
  evidenceConfidence: EvidenceConfidence;
}>;

export type ComparatorMarketSummary = Readonly<{
  estimatedAdrMedianUsd: number | null;
  estimatedAdrRangeUsd: Readonly<{ minimum: number; maximum: number }> | null;
  calendarUnavailableMedianPercentage: number | null;
  calendarUnavailableRangePercentage: Readonly<{ minimum: number; maximum: number }> | null;
}>;

export type ComparatorSummary = Readonly<{
  status: ComparatorStatus;
  reasonCodes: readonly ComparatorReasonCode[];
  reasonText: string;
  comparableCount: number;
  comparables: readonly ComparableSummary[];
  market: ComparatorMarketSummary;
  evidenceConfidence: EvidenceConfidence;
}>;

export function validateComparatorRequest(input: unknown): ComparatorValidationResult {
  const errors: ComparatorValidationError[] = [];
  if (!isRecord(input)) return invalid("request", "Comparator request is required.");
  validateProperty(input, "target", "target", errors, validateTarget);
  if (!Array.isArray(input.candidates)) {
    errors.push(error("candidates", "Candidates must be an array."));
  } else {
    input.candidates.forEach((candidate, index) => validateCandidate(candidate, `candidates[${index}]`, errors));
  }
  if (errors.length) return Object.freeze({ ok: false as const, errors: freezeArray(errors) });
  return Object.freeze({ ok: true as const, value: cloneRequest(input as unknown as ComparatorRequest) });
}

export function calculateComparatorSummary(input: unknown): ComparatorSummary {
  const validation = validateComparatorRequest(input);
  if (!validation.ok) throw new TypeError(validation.errors.map(({ path, message }) => `${path}: ${message}`).join(" "));

  const ranked = rankComparableCandidates(validation.value.target, validation.value.candidates, 5);
  const comparables = ranked.map(({ candidate, distanceKm, similarityScore }) => {
    const rates = (candidate.rateObservations ?? []).filter(validRate).map((item) => item.nightlyRateUsd);
    const calendar = (candidate.calendarObservations ?? []).filter(
      (item) => validDate(item.date) && item.availability !== "unknown",
    );
    const unavailable = calendar.filter((item) => item.availability === "unavailable").length;
    return freezeComparable({
      id: candidate.id,
      ...(candidate.name === undefined ? {} : { name: candidate.name }),
      distanceKm: round(distanceKm, 3),
      similarityScore: round(similarityScore, 6),
      estimatedAdrUsd: rates.length ? round(mean(rates), 2) : null,
      adrObservationCount: rates.length,
      calendarUnavailablePercentage: calendar.length ? round((unavailable / calendar.length) * 100, 2) : null,
      calendarObservationCount: calendar.length,
      evidenceConfidence: confidence(rates.length, calendar.length),
    });
  });
  const adrs = comparables.flatMap((item) => item.estimatedAdrUsd === null ? [] : [item.estimatedAdrUsd]);
  const unavailable = comparables.flatMap((item) =>
    item.calendarUnavailablePercentage === null ? [] : [item.calendarUnavailablePercentage],
  );
  const reasonCodes: ComparatorReasonCode[] = [];
  if (!comparables.length) reasonCodes.push("NO_ELIGIBLE_COMPARABLES");
  else {
    reasonCodes.push("COMPARABLES_READY");
    if (adrs.length < comparables.length) reasonCodes.push("SPARSE_RATE_EVIDENCE");
    if (unavailable.length < comparables.length) reasonCodes.push("SPARSE_CALENDAR_EVIDENCE");
  }
  const status: ComparatorStatus = !comparables.length
    ? "no_comparables"
    : reasonCodes.length > 1 ? "sparse_evidence" : "complete";
  const market = Object.freeze({
    estimatedAdrMedianUsd: median(adrs),
    estimatedAdrRangeUsd: range(adrs),
    calendarUnavailableMedianPercentage: median(unavailable),
    calendarUnavailableRangePercentage: range(unavailable),
  });
  return Object.freeze({
    status,
    reasonCodes: freezeArray(reasonCodes),
    reasonText: reasonText(reasonCodes, comparables.length),
    comparableCount: comparables.length,
    comparables: freezeArray(comparables),
    market,
    evidenceConfidence: aggregateConfidence(comparables),
  });
}

function validateTarget(value: unknown, path: string, errors: ComparatorValidationError[]) {
  if (!isRecord(value)) { errors.push(error(path, "Target is required.")); return; }
  validateCoordinates(value.coordinates, `${path}.coordinates`, errors);
  nonNegative(value.bedrooms, `${path}.bedrooms`, errors);
  nonNegative(value.bathrooms, `${path}.bathrooms`, errors);
  positive(value.accommodates, `${path}.accommodates`, errors);
}

function validateCandidate(value: unknown, path: string, errors: ComparatorValidationError[]) {
  if (!isRecord(value)) { errors.push(error(path, "Candidate must be an object.")); return; }
  if (typeof value.id !== "string" || !value.id.trim()) errors.push(error(`${path}.id`, "Candidate id is required."));
  if (value.name !== undefined && typeof value.name !== "string") errors.push(error(`${path}.name`, "Name must be text."));
  if (typeof value.entireHome !== "boolean") errors.push(error(`${path}.entireHome`, "Entire-home flag is required."));
  validateCandidateCoordinates(value.coordinates, `${path}.coordinates`, errors);
  nonNegative(value.bedrooms, `${path}.bedrooms`, errors);
  nonNegative(value.bathrooms, `${path}.bathrooms`, errors);
  positive(value.accommodates, `${path}.accommodates`, errors);
  if (typeof value.advertisedNightlyRateUsd !== "number") errors.push(error(`${path}.advertisedNightlyRateUsd`, "Price must be a number."));
  optionalArray(value.rateObservations, `${path}.rateObservations`, errors, (item, itemPath) => {
    if (!isRecord(item) || typeof item.date !== "string" || typeof item.nightlyRateUsd !== "number") errors.push(error(itemPath, "Rate observation is invalid."));
  });
  optionalArray(value.calendarObservations, `${path}.calendarObservations`, errors, (item, itemPath) => {
    if (!isRecord(item) || !validDate(item.date) || !["available", "unavailable", "unknown"].includes(String(item.availability))) errors.push(error(itemPath, "Calendar observation is invalid."));
  });
}

function validateCandidateCoordinates(value: unknown, path: string, errors: ComparatorValidationError[]) {
  if (!isRecord(value)) { errors.push(error(path, "Coordinates are required.")); return; }
  if (typeof value.latitude !== "number") errors.push(error(`${path}.latitude`, "Latitude must be a number."));
  if (typeof value.longitude !== "number") errors.push(error(`${path}.longitude`, "Longitude must be a number."));
}

function validateCoordinates(value: unknown, path: string, errors: ComparatorValidationError[]) {
  if (!isRecord(value)) { errors.push(error(path, "Coordinates are required.")); return; }
  if (!finiteIn(value.latitude, -90, 90)) errors.push(error(`${path}.latitude`, "Latitude must be between -90 and 90."));
  if (!finiteIn(value.longitude, -180, 180)) errors.push(error(`${path}.longitude`, "Longitude must be between -180 and 180."));
}

function cloneRequest(request: ComparatorRequest): ComparatorRequest {
  return Object.freeze({ target: cloneTarget(request.target), candidates: freezeArray(request.candidates.map(cloneCandidate)) });
}
function cloneTarget(target: ComparatorTarget): ComparatorTarget {
  return Object.freeze({ coordinates: Object.freeze({ ...target.coordinates }), bedrooms: target.bedrooms, bathrooms: target.bathrooms, accommodates: target.accommodates });
}
function cloneCandidate(candidate: ComparatorCandidate): ComparatorCandidate {
  return Object.freeze({
    id: candidate.id.trim(), ...(candidate.name === undefined ? {} : { name: candidate.name }), entireHome: candidate.entireHome,
    coordinates: Object.freeze({ ...candidate.coordinates }), bedrooms: candidate.bedrooms, bathrooms: candidate.bathrooms,
    accommodates: candidate.accommodates, advertisedNightlyRateUsd: candidate.advertisedNightlyRateUsd,
    ...(candidate.rateObservations === undefined ? {} : { rateObservations: freezeArray(candidate.rateObservations.map((item) => Object.freeze({ date: item.date, nightlyRateUsd: item.nightlyRateUsd }))) }),
    ...(candidate.calendarObservations === undefined ? {} : { calendarObservations: freezeArray(candidate.calendarObservations.map((item) => Object.freeze({ date: item.date, availability: item.availability }))) }),
  });
}

function confidence(rates: number, calendar: number): EvidenceConfidence {
  if (!rates && !calendar) return "none";
  if (rates >= 7 && calendar >= 7) return "high";
  if (rates >= 3 && calendar >= 3) return "medium";
  return "low";
}
function aggregateConfidence(items: readonly ComparableSummary[]): EvidenceConfidence {
  if (!items.length) return "none";
  const weights = { none: 0, low: 1, medium: 2, high: 3 } as const;
  const score = mean(items.map((item) => weights[item.evidenceConfidence]));
  return score >= 2.5 ? "high" : score >= 1.5 ? "medium" : score > 0 ? "low" : "none";
}
function reasonText(codes: readonly ComparatorReasonCode[], count: number): string {
  if (codes.includes("NO_ELIGIBLE_COMPARABLES")) return "No eligible entire-home comparables had valid prices and coordinates.";
  const gaps = [codes.includes("SPARSE_RATE_EVIDENCE") ? "rate" : "", codes.includes("SPARSE_CALENDAR_EVIDENCE") ? "calendar" : ""].filter(Boolean);
  return gaps.length ? `${count} comparables ranked; ${gaps.join(" and ")} evidence is incomplete.` : `${count} comparables ranked with complete rate and calendar evidence.`;
}
function median(values: readonly number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return round(sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2, 2); }
function range(values: readonly number[]) { return values.length ? Object.freeze({ minimum: Math.min(...values), maximum: Math.max(...values) }) : null; }
function mean(values: readonly number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function round(value: number, places: number) { const factor = 10 ** places; return Math.round((value + Number.EPSILON * Math.abs(value)) * factor) / factor; }
function validRate(item: RateObservation) { return validDate(item.date) && isPositive(item.nightlyRateUsd); }
function validDate(value: unknown) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function isPositive(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function finiteIn(value: unknown, min: number, max: number) { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
function nonNegative(value: unknown, path: string, errors: ComparatorValidationError[]) { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) errors.push(error(path, "Value must be a non-negative number.")); }
function positive(value: unknown, path: string, errors: ComparatorValidationError[]) { if (!isPositive(value)) errors.push(error(path, "Value must be a positive number.")); }
function optionalArray(value: unknown, path: string, errors: ComparatorValidationError[], validate: (item: unknown, path: string) => void) { if (value === undefined) return; if (!Array.isArray(value)) { errors.push(error(path, "Value must be an array.")); return; } value.forEach((item, index) => validate(item, `${path}[${index}]`)); }
function validateProperty(record: Record<string, unknown>, key: string, path: string, errors: ComparatorValidationError[], validate: (value: unknown, path: string, errors: ComparatorValidationError[]) => void) { validate(record[key], path, errors); }
function error(path: string, message: string): ComparatorValidationError { return Object.freeze({ path, code: "invalid", message }); }
function invalid(path: string, message: string): ComparatorValidationResult { return Object.freeze({ ok: false, errors: Object.freeze([Object.freeze({ path, code: "required" as const, message })]) }); }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function freezeArray<T>(items: T[]): readonly T[] { return Object.freeze(items); }
function freezeComparable(item: ComparableSummary): ComparableSummary { return Object.freeze(item); }
