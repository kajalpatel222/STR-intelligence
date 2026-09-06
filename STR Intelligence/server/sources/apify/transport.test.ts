import { strict as assert } from "node:assert";
import test from "node:test";
import { ApifyTransport, buildZillowSearchUrl, mapApifyZillowRecord } from "./transport.js";

test("caps both Actor results and charged results at five", async () => {
  let submittedInput: Record<string, unknown> | undefined;
  let submittedOptions: Record<string, unknown> | undefined;
  const client = {
    actor() {
      return {
        async start(input: Record<string, unknown>, options: Record<string, unknown>) {
          submittedInput = input;
          submittedOptions = options;
          return { id: "run-1" };
        },
      };
    },
  };
  const transport = new ApifyTransport({ client: client as never, actorId: "zillow-actor" });

  await transport.submit({
    source: "zillow_existing_home",
    location: "Oakhurst, CA",
    lookbackDays: 7,
    recordLimit: 25,
    listingCategory: "for_sale",
  });

  assert.equal(submittedInput?.resultsLimit, 5);
  assert.equal(submittedOptions?.maxItems, 5);
});

test("uses the detail Actor for a submitted Zillow home URL", async () => {
  let actorId = "";
  let submittedInput: Record<string, unknown> | undefined;
  const client = { actor(id: string) { actorId = id; return { async start(input: Record<string, unknown>) { submittedInput = input; return { id: "detail-run" }; } }; } };
  const transport = new ApifyTransport({ client: client as never, actorId: "search-actor", detailActorId: "detail-actor" });
  const listingUrl = "https://www.zillow.com/homedetails/1-Pine-Rd-Oakhurst-CA-93644/123_zpid/";
  await transport.submit({ source: "zillow_existing_home", location: "Oakhurst, CA", lookbackDays: 7, recordLimit: 1, listingUrl });
  assert.equal(actorId, "detail-actor");
  assert.deepEqual(submittedInput, { propertyUrls: [listingUrl], maxListings: 1, includeDetails: true, listingType: "for_sale" });
});

test("treats the Actor's no-results sentinel as a successful empty collection", async () => {
  const client = {
    actor() {
      return { async start() { return { id: "empty-run" }; } };
    },
    run() {
      return { async get() { return { status: "SUCCEEDED", defaultDatasetId: "empty-dataset" }; } };
    },
    dataset() {
      return { async listItems() { return { items: [{ error: "No results found." }] }; } };
    },
  };
  const transport = new ApifyTransport({ client: client as never, actorId: "zillow-actor" });
  await transport.submit({
    source: "zillow_existing_home",
    location: "Mariposa, CA",
    lookbackDays: 7,
    recordLimit: 5,
    listingCategory: "for_sale",
    filters: { maximumPriceUsd: 350_000, minimumBedrooms: 3 },
  });

  assert.deepEqual(await transport.results("empty-run"), []);
});

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

test("encodes supported home constraints in Zillow searchQueryState", () => {
  const url = new URL(buildZillowSearchUrl(7, "zillow_existing_home", "Oakhurst, CA", { maximumPriceUsd: 350_000, minimumBedrooms: 3 }));
  const state = JSON.parse(url.searchParams.get("searchQueryState") ?? "") as { filterState: Record<string, { max?: number; min?: number; value?: unknown }> };
  assert.deepEqual(state.filterState.price, { max: 350_000 });
  assert.deepEqual(state.filterState.beds, { min: 3 });
  assert.equal(state.filterState.isLotLand?.value, false);
  assert.equal(state.filterState.doz?.value, "7");
});

test("encodes land price without adding a bedroom filter", () => {
  const url = new URL(buildZillowSearchUrl(7, "zillow_land", "Mariposa, CA", { maximumPriceUsd: 200_000 }));
  const state = JSON.parse(url.searchParams.get("searchQueryState") ?? "") as { filterState: Record<string, unknown> };
  assert.deepEqual(state.filterState.price, { max: 200_000 });
  assert.equal(state.filterState.beds, undefined);
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

test("maps the Zillow detail Actor output into the shared listing contract", () => {
  const result = mapApifyZillowRecord({
    zpid: 123,
    propertyUrl: "https://www.zillow.com/homedetails/1-Pine-Rd-Oakhurst-CA-93644/123_zpid/",
    listingAddress: { full: "1 Pine Rd, Oakhurst, CA 93644", city: "Oakhurst", state: "CA", zipCode: "93644", county: "Madera County" },
    listingPrice: { amount: 349000 }, bedrooms: 3, bathrooms: 2, livingArea: 1450,
    lotArea: { value: 0.5, unit: "acres" }, coordinates: { latitude: 37.3, longitude: -119.6 },
    mainImage: { medium: "https://photos.example.com/detail.jpg" }, homeType: "SINGLE_FAMILY", listingStatus: "forSale", description: "Mountain home",
  });
  assert.equal(result.kind, "listing");
  if (result.kind !== "listing") return;
  assert.equal(result.address, "1 Pine Rd, Oakhurst, CA 93644");
  assert.equal(result.county, "Madera County");
  assert.equal(result.price, 349000);
  assert.equal(result.lotSqft, 21780);
  assert.equal(result.imageUrl, "https://photos.example.com/detail.jpg");
  assert.equal(result.description, "Mountain home");
});

test("maps the verified direct-property Actor output shape", () => {
  const result = mapApifyZillowRecord({
    zpid: "19235521", url: "https://www.zillow.com/homedetails/5655-Harris-Cut-Off-Rd-Mariposa-CA-95338/19235521_zpid/",
    address: "5655 Harris Cut Off Rd", city: "Mariposa", state: "CA", zipcode: "95338",
    price: 409000, bedrooms: 3, bathrooms: 2, livingArea: 1500, lotSize: 58370,
    latitude: 37.469055, longitude: -119.737885, propertyType: "SINGLE_FAMILY", homeStatus: "FOR_SALE",
    photos: ["https://photos.zillowstatic.com/example.jpg"],
  });
  assert.equal(result.kind, "listing");
  if (result.kind !== "listing") return;
  assert.equal(result.price, 409000);
  assert.equal(result.lotSqft, 58370);
  assert.equal(result.imageUrl, "https://photos.zillowstatic.com/example.jpg");
});

test("contains malformed dataset items as provider errors", () => {
  const result = mapApifyZillowRecord({ address: "Missing identifiers" });
  assert.equal(result.kind, "provider_error");
});

test("does not turn missing Zillow coordinates into the Gulf of Guinea", () => {
  const result = mapApifyZillowRecord({
    zpid: "missing-coordinates",
    detailUrl: "https://www.zillow.com/homedetails/missing-coordinates_zpid/",
    latitude: null,
    longitude: "",
  });
  assert.equal(result.kind, "listing");
  if (result.kind !== "listing") return;
  assert.equal(result.latitude, undefined);
  assert.equal(result.longitude, undefined);
});

test("maps coordinates from the observed nested Zillow payload shapes", () => {
  const result = mapApifyZillowRecord({
    zpid: "nested-coordinates",
    detailUrl: "https://www.zillow.com/homedetails/nested-coordinates_zpid/",
    hdpData: { homeInfo: { latitude: 37.326977, longitude: -119.63836 } },
  });
  assert.equal(result.kind, "listing");
  if (result.kind !== "listing") return;
  assert.equal(result.latitude, 37.326977);
  assert.equal(result.longitude, -119.63836);
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
