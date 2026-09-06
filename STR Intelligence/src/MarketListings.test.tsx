import assert from "node:assert/strict";
import test from "node:test";
import type { MarketListing } from "../shared/market-listing.js";
import { filterMarketListings, paginateMarketListings, sortMarketListings, toggleMarketListingComparison } from "./MarketListings.js";

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

test("filters listings by Yosemite gateway while preserving other filters", () => {
  const rows: MarketListing[] = [
    { ...base, name: "Mariposa cabin", bedrooms: "3" },
    { ...base, listingUrl: "https://www.airbnb.com/rooms/2", name: "Groveland cabin", gateway: "big_oak_flat", bedrooms: "3" },
    { ...base, listingUrl: "https://www.airbnb.com/rooms/3", name: "South entrance studio", gateway: "south", bedrooms: "Studio" },
  ];

  assert.deepEqual(filterMarketListings(rows, "", "all", "all", "big_oak_flat").map((row) => row.name), ["Groveland cabin"]);
  assert.deepEqual(filterMarketListings(rows, "cabin", "3", "all", "arch_rock").map((row) => row.name), ["Mariposa cabin"]);
  assert.equal(filterMarketListings(rows, "", "3", "all", "south").length, 0);
});

test("includes overlapping listings in each stored gateway without duplicating all-area results", () => {
  const shared = { ...base, gateways: ["arch_rock", "south"] as const };
  assert.equal(filterMarketListings([shared], "", "all", "all", "arch_rock").length, 1);
  assert.equal(filterMarketListings([shared], "", "all", "all", "south").length, 1);
  assert.equal(filterMarketListings([shared], "", "all", "all", "big_oak_flat").length, 0);
  assert.equal(filterMarketListings([shared], "").length, 1);
});

test("comparison selection adds, removes, and never exceeds three listings", () => {
  const selected = ["one", "two"];
  assert.deepEqual(toggleMarketListingComparison(selected, "three"), ["one", "two", "three"]);
  assert.deepEqual(toggleMarketListingComparison(["one", "two", "three"], "four"), ["one", "two", "three"]);
  assert.deepEqual(toggleMarketListingComparison(["one", "two", "three"], "two"), ["one", "three"]);
  assert.deepEqual(selected, ["one", "two"]);
});
