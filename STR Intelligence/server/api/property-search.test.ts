import { strict as assert } from "node:assert";
import test from "node:test";
import { createPropertySearchHandler } from "./property-search.js";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";

test("returns public listing data for a constrained home search", async () => {
  const handler = createPropertySearchHandler({
    async invoke({ workflowState }) {
      assert.equal(workflowState.searchRequest.location, "Oakhurst, CA");
      assert.equal(workflowState.searchRequest.lookbackDays, 7);
      assert.equal(workflowState.searchRequest.recordLimit, 5);
      return {
        workflowState: {
          ...workflowState,
          status: "completed",
          sourceRunStatus: "succeeded",
          normalizedListings: [{
            kind: "listing",
            source: "zillow_existing_home",
            externalId: "private-id",
            url: "https://example.com/home",
            discoveredAt: "2026-08-29T12:00:00.000Z",
            address: "123 Pine St",
            city: "Oakhurst",
            state: "CA",
            price: 450000,
            lotSqft: 10890,
            imageUrl: "https://photos.example.com/home.jpg",
            raw: { secret: "not returned" },
          }],
        },
      };
    },
  });

  const result = await handler({ propertyType: "homes" });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.listingCount, 1);
  assert.equal(result.body.message, "Found 1 home near Oakhurst, CA.");
  assert.deepEqual(result.body.listings, [{
    title: undefined,
    address: "123 Pine St",
    city: "Oakhurst",
    state: "CA",
    postalCode: undefined,
    price: 450000,
    beds: undefined,
    baths: undefined,
    sqft: undefined,
    lotSqft: 10890,
    lotAcres: undefined,
    imageUrl: "https://photos.example.com/home.jpg",
    propertyType: undefined,
    zoningText: undefined,
    description: undefined,
    amenities: undefined,
    statusText: undefined,
    url: "https://example.com/home",
  }]);
  assert.equal(JSON.stringify(result.body).includes("private-id"), false);
  assert.equal(JSON.stringify(result.body).includes("secret"), false);
});

test("snapshots saved criteria into workflow state without changing routing", async () => {
  const handler = createPropertySearchHandler({
    async invoke({ workflowState }) {
      assert.deepEqual(workflowState.investmentCriteria, DEFAULT_INVESTMENT_CRITERIA);
      assert.equal(workflowState.searchRequest.source, "zillow_existing_home");
      return { workflowState: { ...workflowState, status: "completed", normalizedListings: [] } };
    },
  }, {
    async getDefaults() { return DEFAULT_INVESTMENT_CRITERIA; },
  });
  const result = await handler({ propertyType: "homes", location: "Oakhurst, CA" });
  assert.equal(result.statusCode, 200);
});

test("falls back to safe criteria when optional saved defaults are unavailable", async () => {
  const handler = createPropertySearchHandler({
    async invoke({ workflowState }) {
      assert.deepEqual(workflowState.investmentCriteria, DEFAULT_INVESTMENT_CRITERIA);
      return { workflowState: { ...workflowState, status: "completed", normalizedListings: [] } };
    },
  }, {
    async getDefaults() { throw new Error("profile table unavailable"); },
  });
  const result = await handler({ propertyType: "homes", location: "Oakhurst, CA" });
  assert.equal(result.statusCode, 200);
});

test("returns safe parcel data for a constrained land search", async () => {
  const handler = createPropertySearchHandler({
    async invoke({ workflowState }) {
      assert.equal(workflowState.searchRequest.source, "zillow_land");
      assert.equal(workflowState.searchRequest.location, "Mariposa, CA");
      assert.equal(workflowState.searchRequest.recordLimit, 5);
      assert.equal(workflowState.searchRequest.homeType, undefined);
      return { workflowState: { ...workflowState, status: "completed", sourceRunStatus: "succeeded", normalizedListings: [{
        kind: "listing", source: "zillow_land", externalId: "private-land-id", url: "https://example.com/land",
        discoveredAt: "2026-08-29T12:00:00.000Z", address: "Road 426", city: "Oakhurst", state: "CA",
        price: 129000, lotSqft: 354578, lotAcres: 8.14, imageUrl: "https://photos.example.com/land.jpg", propertyType: "LOT",
        zoningText: "RRS-2.5", raw: { internal: true },
      }] } };
    },
  });
  const result = await handler({ propertyType: "land", location: "Mariposa, California" });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.message, "Found 1 land listing near Mariposa, CA.");
  assert.equal(result.body.listingCount, 1);
  assert.equal((result.body.listings as Array<Record<string, unknown>>)[0]?.lotSqft, 354578);
  assert.equal((result.body.listings as Array<Record<string, unknown>>)[0]?.lotAcres, 8.14);
  assert.equal((result.body.listings as Array<Record<string, unknown>>)[0]?.zoningText, "RRS-2.5");
  assert.equal(JSON.stringify(result.body).includes("private-land-id"), false);
  assert.equal(JSON.stringify(result.body).includes("internal"), false);
});
