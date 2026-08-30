import { ApifyClient } from "apify-client";
import { getServerEnvironment } from "../../config/env.js";
import type {
  ListingQuery,
  NormalizedSourceRecordUnion,
  SourceRun,
} from "../listing-source.js";
import { normalizeSupportedLocation, SUPPORTED_MARKETS, type SupportedMarketLocation } from "../../markets/supported-markets.js";

export function buildZillowSearchUrl(
  lookbackDays: number,
  source: ListingQuery["source"] = "zillow_existing_home",
  location: SupportedMarketLocation = "Oakhurst, CA",
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
  private readonly resultLimits = new Map<string, number>();

  private readonly source: "zillow_existing_home" | "zillow_land";

  constructor(options?: {
    client?: ApifyClient;
    actorId?: string;
    source?: "zillow_existing_home" | "zillow_land";
  }) {
    this.client = options?.client;
    this.actorId = options?.actorId;
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
    const run = await client.actor(actorId).start({
      searchUrls: [{ url: buildZillowSearchUrl(query.lookbackDays, this.source, location) }],
      extractionMethod: "MAP_MARKERS",
      resultsLimit: Math.min(query.recordLimit, 5),
    });
    this.resultLimits.set(run.id, Math.min(query.recordLimit, 5));
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
    return items.map((item) => mapApifyZillowRecord(item as Record<string, unknown>, this.source));
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

export function mapApifyZillowRecord(
  record: Record<string, unknown>,
  source: "zillow_existing_home" | "zillow_land" = "zillow_existing_home",
): NormalizedSourceRecordUnion {
  const externalId = text(record.zpid ?? record.id);
  const url = text(record.detailUrl ?? record.url);
  if (!externalId || !url) {
    return { kind: "provider_error", source, message: "Provider listing missing required fields", raw: record };
  }

  const address = text(record.address ?? record.streetAddress);
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
    city: text(record.addressCity ?? record.city) ?? addressParts?.[1],
    state: text(record.addressState ?? record.state) ?? addressParts?.[2],
    postalCode: text(record.addressZipcode ?? record.zipcode ?? record.zip) ?? addressParts?.[3],
    price: number(record.price ?? record.unformattedPrice),
    beds: number(record.bedrooms ?? record.beds),
    baths: number(record.bathrooms ?? record.baths),
    sqft: number(record.livingArea ?? record.livingAreaValue ?? record.sqft),
    lotSqft: lotSquareFeet(record),
    lotAcres: lotAcres(record),
    imageUrl: primaryImage(record),
    latitude: number(record.latitude),
    longitude: number(record.longitude),
    propertyType,
    zoningText: text(record.zoningText ?? record.zoning ?? record.zoningDescription),
    statusText: text(record.homeStatus ?? record.statusText),
    raw: record,
  };
}

function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : undefined; }
function number(value: unknown) { const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed : undefined; }
function primaryImage(record: Record<string, unknown>) {
  const direct = text(record.imgSrc ?? record.imageUrl);
  if (direct) return direct;
  const photos = record.carouselPhotos;
  if (!Array.isArray(photos)) return undefined;
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
  return {
    value: number(record.lotAreaValue ?? nested.lotAreaValue ?? record.lotSize ?? record.lotSqft),
    unit: text(record.lotAreaUnit ?? nested.lotAreaUnit)?.toLowerCase(),
  };
}
