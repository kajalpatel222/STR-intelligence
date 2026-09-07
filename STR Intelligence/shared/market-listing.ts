export const YOSEMITE_GATEWAYS = ["arch_rock", "big_oak_flat", "south"] as const;
export type YosemiteGateway = typeof YOSEMITE_GATEWAYS[number];

export type MarketListing = Readonly<{
  listingUrl: string;
  name: string;
  latitude?: number;
  longitude?: number;
  gateway: YosemiteGateway;
  gateways?: readonly YosemiteGateway[];
  propertyType?: string;
  roomType?: string;
  bedrooms?: string;
  bathrooms?: number;
  accommodates?: number;
  adrUsd?: number;
  occupancyPercent?: number;
  annualRevenueUsd?: number;
  revenuePotentialUsd?: number;
  bookingsLtm?: number;
  activeDaysLtm?: number;
  ratingPercent?: number;
  reviewCount?: number;
  cleaningFeeUsd?: number;
  minimumNights?: number;
  imageUrl?: string;
  amenities: Readonly<Record<string, boolean>>;
  lastSeen?: string;
  collectedAt: string;
}>;

export type MarketListingCollection = Readonly<{
  label: string;
  gateway: YosemiteGateway;
  gateways?: readonly YosemiteGateway[];
  status: "complete";
  page: number;
  collectedPages: readonly number[];
  providerTotalCount: number;
  savedCount: number;
  collectedAt: string;
  listings: readonly MarketListing[];
}>;
