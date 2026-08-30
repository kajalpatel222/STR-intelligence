import { strict as assert } from "node:assert";
import test from "node:test";
import { buildZillowSearchUrl, mapApifyZillowRecord } from "./transport.js";

test("builds a deterministic Oakhurst Zillow URL with encoded searchQueryState", () => {
  const url = new URL(buildZillowSearchUrl(7));
  const state = JSON.parse(url.searchParams.get("searchQueryState") ?? "") as Record<string, unknown>;
  assert.equal(url.hostname, "www.zillow.com");
  assert.deepEqual(state, {
    pagination: {},
    isMapVisible: true,
    mapBounds: { west: -119.78, east: -119.58, south: 37.25, north: 37.4 },
    filterState: { sort: { value: "days" }, ah: { value: true }, doz: { value: "7" }, isLotLand: { value: false } },
    isListVisible: true,
  });
});

test("builds the same actor input with Zillow's lot and land filter enabled", () => {
  const url = new URL(buildZillowSearchUrl(7, "zillow_land"));
  const state = JSON.parse(url.searchParams.get("searchQueryState") ?? "") as {
    filterState: Record<string, { value: boolean }>;
  };
  assert.equal(state.filterState.isLotLand.value, true);
  for (const key of ["isAllHomes", "isSingleFamily", "isCondo", "isTownhouse", "isMultiFamily", "isApartment", "isManufactured"] as const) {
    assert.equal((state.filterState as Record<string, { value: boolean }>)[key]?.value, false);
  }
});

test("builds distinct map bounds for Mariposa", () => {
  const oakhurst = JSON.parse(new URL(buildZillowSearchUrl(7)).searchParams.get("searchQueryState") ?? "") as { mapBounds: unknown };
  const mariposa = JSON.parse(new URL(buildZillowSearchUrl(7, "zillow_land", "Mariposa, CA")).searchParams.get("searchQueryState") ?? "") as { mapBounds: unknown };
  assert.notDeepEqual(mariposa.mapBounds, oakhurst.mapBounds);
  assert.deepEqual(mariposa.mapBounds, { west: -120.02, east: -119.82, south: 37.42, north: 37.58 });
});

test("maps an Apify Zillow dataset item into the normalized listing contract", () => {
  const result = mapApifyZillowRecord({
    zpid: "12345",
    detailUrl: "https://www.zillow.com/homedetails/example/12345_zpid/",
    address: "400 Pine Ave, Oakhurst, CA 93644",
    addressCity: "Oakhurst",
    addressState: "CA",
    addressZipcode: "93644",
    price: 525000,
    bedrooms: 3,
    bathrooms: 2,
    livingArea: 1800,
    lotAreaValue: 0.5,
    lotAreaUnit: "acres",
    imgSrc: "https://photos.example.com/house.jpg",
    latitude: 37.33,
    longitude: -119.65,
    homeType: "SINGLE_FAMILY",
    homeStatus: "FOR_SALE",
  });
  assert.equal(result.kind, "listing");
  if (result.kind !== "listing") return;
  assert.equal(result.externalId, "12345");
  assert.equal(result.city, "Oakhurst");
  assert.equal(result.price, 525000);
  assert.equal(result.sqft, 1800);
  assert.equal(result.lotSqft, 21780);
  assert.equal(result.imageUrl, "https://photos.example.com/house.jpg");
  assert.equal(result.latitude, 37.33);
  assert.equal(result.longitude, -119.65);
  assert.equal(result.propertyType, "SINGLE_FAMILY");
  assert.equal(result.statusText, "FOR_SALE");
});

test("contains malformed dataset items as provider errors", () => {
  const result = mapApifyZillowRecord({ address: "Missing identifiers" });
  assert.equal(result.kind, "provider_error");
});

test("maps parcel fields under the distinct land source", () => {
  const result = mapApifyZillowRecord({
    zpid: "land-123",
    detailUrl: "https://www.zillow.com/homedetails/land-123_zpid/",
    address: "Road 426, Oakhurst, CA 93644",
    price: 129000,
    lotAreaValue: 2.25,
    lotAreaUnit: "acres",
    homeType: "LOT",
    zoning: "RRS-2.5",
    imgSrc: "https://photos.example.com/parcel.jpg",
  }, "zillow_land");
  assert.equal(result.kind, "listing");
  if (result.kind !== "listing") return;
  assert.equal(result.source, "zillow_land");
  assert.equal(result.lotSqft, 98010);
  assert.equal(result.propertyType, "LOT");
  assert.equal(result.zoningText, "RRS-2.5");
  assert.equal(result.imageUrl, "https://photos.example.com/parcel.jpg");
});

test("contains a residential record returned during land collection", () => {
  const result = mapApifyZillowRecord({
    zpid: "home-123",
    detailUrl: "https://www.zillow.com/homedetails/home-123_zpid/",
    homeType: "SINGLE_FAMILY",
  }, "zillow_land");
  assert.equal(result.kind, "provider_error");
  assert.equal(result.source, "zillow_land");
});

test("maps nested Zillow acreage with source precision", () => {
  const result = mapApifyZillowRecord({
    zpid: "acreage-814",
    detailUrl: "https://www.zillow.com/homedetails/acreage-814_zpid/",
    homeType: "LOT",
    hdpData: { homeInfo: { lotAreaValue: 8.14, lotAreaUnit: "acres" } },
  }, "zillow_land");
  assert.equal(result.kind, "listing");
  if (result.kind !== "listing") return;
  assert.equal(result.lotAcres, 8.14);
  assert.equal(result.lotSqft, 354578);
});

test("maps the observed Mariposa five-acre nested payload", () => {
  const result = mapApifyZillowRecord({
    zpid: "mariposa-five-acre",
    detailUrl: "https://www.zillow.com/homedetails/mariposa-five-acre_zpid/",
    homeType: "LOT",
    hdpData: { homeInfo: { lotAreaValue: 5, lotAreaUnit: "acres" } },
  }, "zillow_land");
  assert.equal(result.kind, "listing");
  if (result.kind !== "listing") return;
  assert.equal(result.lotAcres, 5);
  assert.equal(result.lotSqft, 217800);
});

test("treats zero parcel area as unavailable", () => {
  const result = mapApifyZillowRecord({
    zpid: "zero-lot",
    detailUrl: "https://www.zillow.com/homedetails/zero-lot_zpid/",
    homeType: "LOT",
    lotAreaValue: 0,
    lotAreaUnit: "sqft",
  }, "zillow_land");
  assert.equal(result.kind, "listing");
  if (result.kind !== "listing") return;
  assert.equal(result.lotSqft, undefined);
  assert.equal(result.lotAcres, undefined);
});
