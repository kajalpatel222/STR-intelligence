import assert from "node:assert/strict";
import test from "node:test";
import type { MarketListing } from "../shared/market-listing.js";
import { filterMarketListings, paginateMarketListings, sortMarketListings } from "./MarketListings.js";

const base: MarketListing = { listingUrl: "https://www.airbnb.com/rooms/1", name: "One", gateway: "arch_rock", amenities: {}, collectedAt: "2026-09-06T12:00:00Z" };

test("market listings default ranking can put highest annual revenue first", () => {
  const rows = [{ ...base, annualRevenueUsd: 40000 }, { ...base, listingUrl: "https://www.airbnb.com/rooms/2", name: "Two", annualRevenueUsd: 70000 }];
  assert.deepEqual(sortMarketListings(rows, "revenue").map((row) => row.name), ["Two", "One"]);
  assert.deepEqual(rows.map((row) => row.name), ["One", "Two"]);
});

test("paginates a collection without mutating it", () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({ ...base, listingUrl: `https://www.airbnb.com/rooms/${index}`, name: `Listing ${index}` }));
  assert.equal(paginateMarketListings(rows, 1).length, 25);
  assert.equal(paginateMarketListings(rows, 2)[0]?.name, "Listing 25");
  assert.equal(paginateMarketListings(rows, 3).length, 1);
  assert.equal(rows.length, 51);
});

test("searches listing names and property details while preserving other filters", () => {
  const rows = [
    { ...base, name: "Yosemite hot tub cabin", roomType: "entire_home", bedrooms: "3" },
    { ...base, listingUrl: "https://www.airbnb.com/rooms/2", name: "Downtown studio", roomType: "private_room", bedrooms: "Studio" },
  ];
  assert.deepEqual(filterMarketListings(rows, "HOT TUB").map((row) => row.name), ["Yosemite hot tub cabin"]);
  assert.deepEqual(filterMarketListings(rows, "private", "Studio").map((row) => row.name), ["Downtown studio"]);
  assert.equal(filterMarketListings(rows, "missing").length, 0);
});
