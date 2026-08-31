import { strict as assert } from "node:assert";
import test from "node:test";
import {
  parsePropertySearchQuery,
  validatePropertySearchRequest,
} from "./property-search-query.js";

test("parses a supported home search with compact price and bedroom constraints", () => {
  const query = "Show me 3+ bedroom homes in Oakhurst under $350k";
  const result = parsePropertySearchQuery(query);

  assert.equal(result.ok, true);
  assert.equal(result.request.originalQuery, query);
  assert.equal(result.request.propertyKind, "existing_home");
  assert.equal(result.request.location?.id, "oakhurst_ca");
  assert.deepEqual(result.request.constraints, {
    maximumPriceUsd: 350_000,
    minimumBedrooms: 3,
  });
});

test("parses land, Mariposa, and comma-formatted prices", () => {
  const result = parsePropertySearchQuery("Find land in Mariposa below $350,000");

  assert.equal(result.ok, true);
  assert.equal(result.request.propertyKind, "land");
  assert.equal(result.request.location?.label, "Mariposa, California");
  assert.equal(result.request.constraints.maximumPriceUsd, 350_000);
});

test("supports $500k and singular bedroom phrasing", () => {
  const result = parsePropertySearchQuery("A 3 bedroom house around Oakhurst with a budget of $500k");
  assert.equal(result.ok, true);
  assert.equal(result.request.constraints.maximumPriceUsd, 500_000);
  assert.equal(result.request.constraints.minimumBedrooms, 3);
});

test("rejects home-only bedroom constraints on land searches", () => {
  const parsed = parsePropertySearchQuery("land in Oakhurst with 3 bedrooms under $350k");
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.some((entry) => entry.code === "bedrooms_not_applicable_to_land"));

  const structured = validatePropertySearchRequest({
    originalQuery: "land in Oakhurst",
    propertyKind: "land",
    location: { id: "oakhurst_ca" },
    constraints: { minimumBedrooms: 3 },
  });
  assert.equal(structured.ok, false);
  assert.ok(structured.issues.some((entry) => entry.code === "bedrooms_not_applicable_to_land"));
});

test("treats Yosemite as ambiguous instead of silently choosing a market", () => {
  const result = parsePropertySearchQuery("Show me homes near Yosemite under $500k");
  assert.equal(result.ok, false);
  assert.equal(result.request.location, undefined);
  assert.ok(result.issues.some((entry) => entry.code === "ambiguous_location"));
});

test("reports conflicting intent and important unsupported constraints safely", () => {
  const result = parsePropertySearchQuery("Homes and land in Oakhurst with 2 baths and a pool");
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "conflicting_property_kind"));
  assert.equal(result.issues.filter((entry) => entry.code === "unknown_constraint").length, 2);
  assert.ok(result.issues.every((entry) => !entry.message.includes("Homes and land")));
});

test("validates and canonicalizes structured requests", () => {
  const input = {
    originalQuery: "structured request",
    propertyKind: "existing_home",
    location: { id: "mariposa_ca", city: "untrusted", state: "XX", label: "untrusted" },
    constraints: { maximumPriceUsd: 400_000, minimumBedrooms: 3 },
  };
  const result = validatePropertySearchRequest(input);

  assert.equal(result.ok, true);
  assert.deepEqual(result.request.location, {
    id: "mariposa_ca",
    city: "Mariposa",
    state: "CA",
    label: "Mariposa, California",
  });
});

test("rejects invalid structured values with user-safe issues", () => {
  const result = validatePropertySearchRequest({
    originalQuery: "bad request",
    propertyKind: "castle",
    location: { id: "fresno_ca" },
    constraints: { maximumPriceUsd: Number.NaN, minimumBedrooms: -1 },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((entry) => entry.code), [
    "missing_property_kind",
    "unsupported_location",
    "invalid_maximum_price",
    "invalid_minimum_bedrooms",
  ]);
});

test("returns immutable outputs with no shared mutable collections", () => {
  const first = parsePropertySearchQuery("homes in Oakhurst under $350k");
  const second = parsePropertySearchQuery("homes in Oakhurst under $350k");

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.request), true);
  assert.equal(Object.isFrozen(first.request.constraints), true);
  assert.equal(Object.isFrozen(first.request.location), true);
  assert.equal(Object.isFrozen(first.issues), true);
  assert.notStrictEqual(first.request, second.request);
  assert.notStrictEqual(first.request.constraints, second.request.constraints);
  assert.notStrictEqual(first.request.location, second.request.location);
  assert.notStrictEqual(first.issues, second.issues);
});
