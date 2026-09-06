export type ListingSourceKind = "zillow_existing_home" | "zillow_land" | "land_parcel";

export type ListingSearchFilters = Readonly<{
  maximumPriceUsd?: number;
  minimumBedrooms?: number;
}>;

export type ListingQuery = Readonly<{
  source: ListingSourceKind;
  location: string;
  lookbackDays: number;
  recordLimit: number;
  listingCategory?: string;
  homeType?: string;
  filters?: ListingSearchFilters;
  listingUrl?: string;
}>;

export type SourceRunStatus = "pending" | "running" | "succeeded" | "failed" | "partial";

export type SourceRun = Readonly<{
  source: ListingSourceKind;
  externalRunId: string;
  status: SourceRunStatus;
  notes?: string;
}>;

export type SourceRecordKind = "listing" | "provider_error";

export type NormalizedSourceRecord = Readonly<{
  kind: "listing";
  source: ListingSourceKind;
  externalId: string;
  url: string;
  discoveredAt: string;
  title?: string;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  postalCode?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  lotSqft?: number;
  lotAcres?: number;
  imageUrl?: string;
  propertyType?: string;
  zoningText?: string;
  latitude?: number;
  longitude?: number;
  statusText?: string;
  description?: string;
  amenities?: string[];
  raw: unknown;
}>;

export type ProviderErrorRecord = Readonly<{
  kind: "provider_error";
  source: ListingSourceKind;
  externalId?: string;
  message: string;
  code?: string;
  raw: unknown;
}>;

export type NormalizedSourceRecordUnion = NormalizedSourceRecord | ProviderErrorRecord;

export interface ListingSource {
  start(query: ListingQuery): Promise<SourceRun>;
  getStatus(externalRunId: string): Promise<SourceRun>;
  getResults(externalRunId: string): Promise<NormalizedSourceRecordUnion[]>;
}
