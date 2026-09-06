import type { YosemiteGateway } from "../../shared/market-listing.js";
import type { AirbticsBounds } from "../sources/airbtics/market-listings.js";

export type YosemiteMarketRegion = Readonly<{
  label: string;
  gateway: YosemiteGateway;
  bounds: AirbticsBounds;
}>;

export const YOSEMITE_MARKET_REGIONS = Object.freeze({
  arch_rock: Object.freeze({
    label: "Arch Rock / Mariposa pilot",
    gateway: "arch_rock",
    bounds: Object.freeze({ ne_lat: 37.66, ne_lng: -119.78, sw_lat: 37.34, sw_lng: -120.10 }),
  }),
  big_oak_flat: Object.freeze({
    label: "Big Oak Flat / Groveland",
    gateway: "big_oak_flat",
    bounds: Object.freeze({ ne_lat: 38.05, ne_lng: -119.90, sw_lat: 37.60, sw_lng: -120.50 }),
  }),
  south: Object.freeze({
    label: "South Entrance / Oakhurst",
    gateway: "south",
    bounds: Object.freeze({ ne_lat: 37.62, ne_lng: -119.42, sw_lat: 37.15, sw_lng: -119.90 }),
  }),
} satisfies Readonly<Record<YosemiteGateway, YosemiteMarketRegion>>);
