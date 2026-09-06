import { ApifyClient } from "apify-client";
import { getServerEnvironment } from "../../config/env.js";
import type {
  ListingQuery,
  ListingSearchFilters,
  NormalizedSourceRecordUnion,
  SourceRun,
} from "../listing-source.js";
import { normalizeSupportedLocation, SUPPORTED_MARKETS, type SupportedMarketLocation } from "../../markets/supported-markets.js";

export function buildZillowSearchUrl(
  lookbackDays: number,
  source: ListingQuery["source"] = "zillow_existing_home",
  location: SupportedMarketLocation = "Oakhurst, CA",
  filters: ListingSearchFilters = {},
) {
  const searchQueryState = {
    pagination: {},
    isMapVisible: true,
    mapBounds: SUPPORTED_MARKETS[location].bounds,
    filterState: {
      sort: { value: "days" },
      ah: { value: true },
      doz: { value: String(Math.min(lookbackDays, 7)) },
      isLotLand: { value: source === "zillow_land" },
      ...(filters.maximumPriceUsd !== undefined ? {
        price: { max: filters.maximumPriceUsd },
      } : {}),
      ...(source === "zillow_existing_home" && filters.minimumBedrooms !== undefined ? {
        beds: { min: filters.minimumBedrooms },
      } : {}),
      ...(source === "zillow_land" ? {
        isAllHomes: { value: false },
        isSingleFamily: { value: false },
        isCondo: { value: false },
        isTownhouse: { value: false },
        isMultiFamily: { value: false },
        isApartment: { value: false },
        isManufactured: { value: false },
      } : {}),
    },
    isListVisible: true,
  };

  // Zillow search Actors require the encoded map state rather than a plain
  // location URL; isolating it here keeps direct Zillow access out of our server.
  return `https://www.zillow.com/homes/for_sale/?searchQueryState=${encodeURIComponent(JSON.stringify(searchQueryState))}`;
}

export class ApifyTransport {
  readonly sourceIdentity;
  private client?: ApifyClient;
  private actorId?: string;
  private readonly detailActorId: string;
  private readonly resultLimits = new Map<string, number>();
  private readonly queryFilters = new Map<string, ListingSearchFilters>();

  private readonly source: "zillow_existing_home" | "zillow_land";

  constructor(options?: {
    client?: ApifyClient;
    actorId?: string;
    detailActorId?: string;
    source?: "zillow_existing_home" | "zillow_land";
  }) {
    this.client = options?.client;
    this.actorId = options?.actorId;
    this.detailActorId = options?.detailActorId ?? "automation-lab/zillow-scraper";
    this.source = options?.source ?? "zillow_existing_home";
    this.sourceIdentity = this.source === "zillow_land"
      ? { key: "apify_zillow_land", name: "Apify Zillow Land Listings", kind: "land_parcel" }
      : { key: "apify_zillow_existing_home", name: "Apify Zillow Existing Home Listings", kind: "zillow_existing_home" };
  }

  async submit(query: ListingQuery): Promise<SourceRun> {
    if (query.source !== this.source) throw new Error(`Apify transport requires ${this.source}`);
    const location = normalizeSupportedLocation(query.location);
    if (!location) throw new Error(`Unsupported Apify market: ${query.location}`);
    const { client, actorId } = this.liveConfiguration();
    const resultLimit = Math.min(query.recordLimit, 5);
    const isDirectListing = this.source === "zillow_existing_home" && Boolean(query.listingUrl);
    const actorInput = isDirectListing
      ? { propertyUrls: [query.listingUrl!], maxListings: 1, includeDetails: true, listingType: "for_sale" }
      : {
          searchUrls: [{ url: buildZillowSearchUrl(query.lookbackDays, this.source, location, query.filters) }],
          extractionMethod: "MAP_MARKERS",
          resultsLimit: resultLimit,
        };
    const run = await client.actor(isDirectListing ? this.detailActorId : actorId).start(actorInput, {
      // Apify's run-level charged-results cap is separate from the Actor input limit.
      maxItems: resultLimit,
    });
    this.resultLimits.set(run.id, resultLimit);
    this.queryFilters.set(run.id, Object.freeze({ ...(query.filters ?? {}) }));
    return { source: query.source, externalRunId: run.id, status: "running" };
  }

  async status(externalRunId: string): Promise<SourceRun> {
    const run = await this.liveConfiguration().client.run(externalRunId).get();
    if (!run) return { source: this.source, externalRunId, status: "failed", notes: "Actor run not found" };
    const status = run.status === "SUCCEEDED" ? "succeeded" : ["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status) ? "failed" : "running";
    return { source: this.source, externalRunId, status };
  }

  async results(externalRunId: string): Promise<NormalizedSourceRecordUnion[]> {
    const { client } = this.liveConfiguration();
    const run = await client.run(externalRunId).get();
    if (!run?.defaultDatasetId) throw new Error("Actor run did not produce a dataset");
    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: this.resultLimits.get(externalRunId) ?? 5 });
    const filters = this.queryFilters.get(externalRunId) ?? {};
    return items.flatMap((item) => {
      const providerRecord = item as Record<string, unknown>;
      // This Actor emits a dataset sentinel for a valid empty search. Treating it
      // as a provider failure would incorrectly present "unavailable" to users.
      if (isNoResultsRecord(providerRecord)) return [];
      return [enforceListingFilters(mapApifyZillowRecord(providerRecord, this.source), filters)];
    });
  }

  private liveConfiguration() {
    if (!this.client || !this.actorId) {
      const env = getServerEnvironment();
      this.client ??= new ApifyClient({ token: env.apifyApiToken });
      this.actorId ??= env.apifyZillowActorId;
    }
    return { client: this.client, actorId: this.actorId };
  }
}

function isNoResultsRecord(record: Record<string, unknown>) {
  return typeof record.error === "string" && /^no results found\.?$/i.test(record.error.trim());
}

function enforceListingFilters(record: NormalizedSourceRecordUnion, filters: ListingSearchFilters): NormalizedSourceRecordUnion {
  if (record.kind !== "listing") return record;
  if (filters.maximumPriceUsd !== undefined && (record.price === undefined || record.price > filters.maximumPriceUsd)) {
    return { kind: "provider_error", source: record.source, externalId: record.externalId, message: "Provider listing did not satisfy the maximum price filter", raw: record.raw };
  }
  if (filters.minimumBedrooms !== undefined && (record.beds === undefined || record.beds < filters.minimumBedrooms)) {
    return { kind: "provider_error", source: record.source, externalId: record.externalId, message: "Provider listing did not satisfy the minimum bedrooms filter", raw: record.raw };
  }
  return record;
}

export function mapApifyZillowRecord(
  record: Record<string, unknown>,
  source: "zillow_existing_home" | "zillow_land" = "zillow_existing_home",
): NormalizedSourceRecordUnion {
  const externalId = text(record.zpid ?? record.id);
  const url = text(record.detailUrl ?? record.propertyUrl ?? record.url ?? record.addressOrUrlFromInput);
  if (!externalId || !url) {
    return { kind: "provider_error", source, message: "Provider listing missing required fields", raw: record };
  }

  const listingAddress = object(record.listingAddress);
  const address = text(record.address ?? record.streetAddress ?? listingAddress.full ?? listingAddress.street);
  const addressParts = address?.match(/,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})/);
  const propertyType = text(record.homeType ?? record.propertyType);
  // Provider-side filtering can drift; fail closed before a residential record
  // can be persisted under the parcel source identity.
  if (source === "zillow_land" && !/\b(?:LOT|LAND)\b/i.test(propertyType ?? "")) {
    return { kind: "provider_error", source, externalId, message: "Provider returned a non-land listing", raw: record };
  }
  return {
    kind: "listing",
    source,
    externalId,
    url,
    discoveredAt: new Date().toISOString(),
    title: address,
    address,
    city: text(record.addressCity ?? record.city ?? listingAddress.city) ?? addressParts?.[1],
    county: text(record.county ?? listingAddress.county),
    state: text(record.addressState ?? record.state ?? listingAddress.state) ?? addressParts?.[2],
    postalCode: text(record.addressZipcode ?? record.zipcode ?? record.zip ?? listingAddress.zipCode) ?? addressParts?.[3],
    price: number(record.price ?? record.unformattedPrice ?? object(record.listingPrice).amount),
    beds: number(record.bedrooms ?? record.beds),
    baths: number(record.bathrooms ?? record.baths),
    sqft: number(record.livingArea ?? record.livingAreaValue ?? record.sqft),
    lotSqft: lotSquareFeet(record),
    lotAcres: lotAcres(record),
    imageUrl: primaryImage(record),
    latitude: coordinate(record, "latitude"),
    longitude: coordinate(record, "longitude"),
    propertyType,
    zoningText: text(record.zoningText ?? record.zoning ?? record.zoningDescription),
    statusText: text(record.homeStatus ?? record.statusText ?? record.listingStatus),
    description: text(record.description),
    raw: record,
  };
}

function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : undefined; }
function number(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const cleaned = typeof value === "number" ? value : String(value).replace(/[^0-9.-]/g, "");
  if (cleaned === "") return undefined;
  const parsed = typeof cleaned === "number" ? cleaned : Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function coordinate(record: Record<string, unknown>, axis: "latitude" | "longitude") {
  const latLong = object(record.latLong);
  const coordinates = object(record.coordinates);
  const homeInfo = object(object(record.hdpData).homeInfo);
  return number(record[axis] ?? latLong[axis] ?? coordinates[axis] ?? homeInfo[axis]);
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function primaryImage(record: Record<string, unknown>) {
  const mainImage = object(record.mainImage);
  const direct = text(record.imgSrc ?? record.imageUrl ?? mainImage.hiRes ?? mainImage.medium ?? mainImage.thumbnail);
  if (direct) return direct;
  const photos = record.carouselPhotos;
  if (!Array.isArray(photos)) {
    const detailPhotos = record.photos;
    return Array.isArray(detailPhotos) ? text(detailPhotos[0]) : undefined;
  }
  const first = photos[0];
  return first && typeof first === "object" ? text((first as Record<string, unknown>).url) : undefined;
}
function lotSquareFeet(record: Record<string, unknown>) {
  const { value, unit } = lotArea(record);
  if (value === undefined || value <= 0) return undefined;
  return unit?.includes("acre") ? Math.round(value * 43_560) : value;
}
function lotAcres(record: Record<string, unknown>) {
  const { value, unit } = lotArea(record);
  if (value === undefined || value <= 0) return undefined;
  return unit?.includes("acre") ? value : undefined;
}
function lotArea(record: Record<string, unknown>) {
  const homeInfo = record.hdpData && typeof record.hdpData === "object"
    ? (record.hdpData as Record<string, unknown>).homeInfo
    : undefined;
  const nested = homeInfo && typeof homeInfo === "object" ? homeInfo as Record<string, unknown> : {};
  const detailLotArea = object(record.lotArea);
  return {
    value: number(record.lotAreaValue ?? nested.lotAreaValue ?? detailLotArea.value ?? record.lotSize ?? record.lotSqft),
    unit: text(record.lotAreaUnit ?? nested.lotAreaUnit ?? detailLotArea.unit)?.toLowerCase(),
  };
}
