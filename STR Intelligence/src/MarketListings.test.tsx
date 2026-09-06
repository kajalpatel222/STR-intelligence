import assert from "node:assert/strict";
import test from "node:test";
import type { MarketListing } from "../shared/market-listing.js";
import { sortMarketListings } from "./MarketListings.js";

const base: MarketListing = { listingUrl: "https://www.airbnb.com/rooms/1", name: "One", gateway: "arch_rock", amenities: {}, collectedAt: "2026-09-06T12:00:00Z" };

test("market listings default ranking can put highest annual revenue first", () => {
  const rows = [{ ...base, annualRevenueUsd: 40000 }, { ...base, listingUrl: "https://www.airbnb.com/rooms/2", name: "Two", annualRevenueUsd: 70000 }];
  assert.deepEqual(sortMarketListings(rows, "revenue").map((row) => row.name), ["Two", "One"]);
  assert.deepEqual(rows.map((row) => row.name), ["One", "Two"]);
});
