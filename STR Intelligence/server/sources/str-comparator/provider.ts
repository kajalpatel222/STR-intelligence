export const MAX_DISCOVERY_LISTINGS = 15;
export const MAX_CALENDAR_LISTINGS = 5;

export type ProviderStage = "discovery" | "calendar";

export type ProviderError = Readonly<{
  stage: ProviderStage;
  code: "invalid_request" | "provider_failure" | "provider_timeout" | "invalid_payload";
  message: string;
  listingId?: string;
}>;

export type ProviderBatch<T> = Readonly<{
  records: readonly T[];
  errors: readonly ProviderError[];
}>;

export type DiscoveryRequest = Readonly<{
  location: string;
  latitude?: number;
  longitude?: number;
  radiusMiles?: number;
  limit?: number;
  currency?: string;
  locale?: string;
  checkIn?: string;
  checkOut?: string;
}>;

export type DiscoveredListing = Readonly<{
  provider: "airbnb";
  dataSource?: "apify" | "airbtics_market";
  listingId: string;
  url: string;
  title?: string;
  roomType?: string;
  propertyType?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
  maxGuests?: number;
  nightlyRate?: number;
  adrLtmUsd?: number;
  occupancyLtmPercent?: number;
  annualRevenueLtmUsd?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  imageUrl?: string;
  isSuperhost?: boolean;
  amenities?: readonly string[];
  scrapedAt?: string;
  marketCollectedAt?: string;
}>;

export type CalendarRequest = Readonly<{
  listings: readonly Pick<DiscoveredListing, "listingId" | "url">[];
  months?: number;
  currency?: string;
  locale?: string;
}>;

export type CalendarDay = Readonly<{
  date: string;
  available: boolean;
  bookable?: boolean;
  availableForCheckin?: boolean;
  availableForCheckout?: boolean;
  minNights?: number;
  maxNights?: number;
  nightlyRate?: number;
  formattedRate?: string;
}>;

export type ListingCalendar = Readonly<{
  provider: "airbnb";
  listingId: string;
  url?: string;
  currency?: string;
  scrapedAt?: string;
  days: readonly CalendarDay[];
}>;

/**
 * Source-independent STR comparator boundary. When Phase 5 shared contracts land,
 * `shared/str-comparator.ts` is expected to export these names: DiscoveryRequest,
 * DiscoveredListing, CalendarRequest, CalendarDay, ListingCalendar, ProviderError,
 * ProviderBatch, and StrComparatorProvider.
 */
export interface StrComparatorProvider {
  discover(request: DiscoveryRequest): Promise<ProviderBatch<DiscoveredListing>>;
  collectCalendars(request: CalendarRequest): Promise<ProviderBatch<ListingCalendar>>;
  rawPayload?(record: object): unknown;
}
