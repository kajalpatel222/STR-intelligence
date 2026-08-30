import type {
  CalendarDay,
  CalendarRequest,
  DiscoveredListing,
  DiscoveryRequest,
  ListingCalendar,
  ProviderBatch,
  ProviderError,
  ProviderStage,
  StrComparatorProvider,
} from "./provider.js";
import { MAX_CALENDAR_LISTINGS, MAX_DISCOVERY_LISTINGS } from "./provider.js";

type RawRecord = Record<string, unknown>;

export interface ApifyClientPort {
  actor(actorId: string): {
    call(input: RawRecord, options: { waitSecs: number }): Promise<{
      status?: string;
      defaultDatasetId?: string;
    }>;
  };
  dataset(datasetId: string): {
    listItems(options: { limit: number; clean: boolean }): Promise<{ items: unknown[] }>;
  };
}

export type ApifyAirbnbProviderOptions = Readonly<{
  client: ApifyClientPort;
  discoveryActorId: string;
  calendarActorId: string;
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 60_000;

export class ApifyAirbnbProvider implements StrComparatorProvider {
  private readonly client: ApifyClientPort;
  private readonly discoveryActorId: string;
  private readonly calendarActorId: string;
  private readonly timeoutMs: number;
  // Keeps provider evidence available to this adapter while preventing it from
  // crossing the source-agnostic port or extending the normalized record lifetime.
  private readonly rawPayloads = new WeakMap<object, unknown>();

  constructor(options: ApifyAirbnbProviderOptions) {
    this.client = options.client;
    this.discoveryActorId = required(options.discoveryActorId, "discoveryActorId");
    this.calendarActorId = required(options.calendarActorId, "calendarActorId");
    this.timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
  }

  async discover(request: DiscoveryRequest): Promise<ProviderBatch<DiscoveredListing>> {
    const location = request.location.trim();
    if (!location) return failure("discovery", "invalid_request", "Discovery location is required");
    const limit = boundedLimit(request.limit, MAX_DISCOVERY_LISTINGS);

    return this.execute(
      "discovery",
      this.discoveryActorId,
      {
        locationQueries: [location],
        maxResults: limit,
        skipDetailPages: false,
        includeReviews: false,
        includeHostProfile: false,
        calendarMonths: 0,
        currency: request.currency ?? "USD",
        locale: request.locale ?? "en-US",
        ...(request.checkIn ? { checkIn: request.checkIn } : {}),
        ...(request.checkOut ? { checkOut: request.checkOut } : {}),
      },
      limit,
      normalizeDiscovery,
    );
  }

  async collectCalendars(request: CalendarRequest): Promise<ProviderBatch<ListingCalendar>> {
    const listings = request.listings.slice(0, MAX_CALENDAR_LISTINGS);
    if (listings.length === 0) return failure("calendar", "invalid_request", "At least one listing is required");
    const months = clampInteger(request.months ?? 12, 1, 12);

    return this.execute(
      "calendar",
      this.calendarActorId,
      {
        startUrls: listings.map(({ url }) => ({ url })),
        listingIds: listings.map(({ listingId }) => listingId),
        months,
        currency: request.currency ?? "USD",
        locale: request.locale ?? "en-US",
        maxItems: listings.length,
      },
      listings.length,
      normalizeCalendar,
    );
  }

  rawPayload(record: object): unknown {
    return this.rawPayloads.get(record);
  }

  private async execute<T>(
    stage: ProviderStage,
    actorId: string,
    input: RawRecord,
    limit: number,
    normalize: (record: RawRecord) => T | ProviderError,
  ): Promise<ProviderBatch<T>> {
    try {
      const timeoutSecs = Math.max(1, Math.ceil(this.timeoutMs / 1_000));
      const run = await withTimeout(
        this.client.actor(actorId).call(input, { waitSecs: timeoutSecs }),
        this.timeoutMs,
      );
      if (run.status && run.status !== "SUCCEEDED") {
        const code = ["READY", "RUNNING"].includes(run.status) ? "provider_timeout" : "provider_failure";
        return failure(stage, code, `Apify actor did not succeed (${run.status})`);
      }
      if (!run.defaultDatasetId) return failure(stage, "provider_failure", "Apify actor produced no dataset");

      const { items } = await withTimeout(
        this.client.dataset(run.defaultDatasetId).listItems({ limit, clean: true }),
        this.timeoutMs,
      );
      const records: T[] = [];
      const errors: ProviderError[] = [];
      for (const item of items.slice(0, limit)) {
        if (!isRecord(item)) {
          errors.push(providerError(stage, "invalid_payload", "Apify dataset row is not an object"));
          continue;
        }
        const normalized = normalize(item);
        if (isProviderError(normalized)) errors.push(normalized);
        else {
          this.rawPayloads.set(normalized as object, item);
          records.push(normalized);
        }
      }
      return { records, errors };
    } catch (error) {
      const timeout = error instanceof ProviderTimeoutError;
      return failure(stage, timeout ? "provider_timeout" : "provider_failure", timeout
        ? `Apify ${stage} timed out`
        : `Apify ${stage} failed`);
    }
  }
}

export function normalizeDiscovery(raw: RawRecord): DiscoveredListing | ProviderError {
  const listingId = text(raw.id ?? raw.listingId ?? raw.listing_id);
  const url = text(raw.url ?? raw.listingUrl ?? raw.listing_url) ?? (listingId ? `https://www.airbnb.com/rooms/${listingId}` : undefined);
  if (!listingId || !url) return providerError("discovery", "invalid_payload", "Discovery row is missing listing identity", listingId);

  return {
    provider: "airbnb",
    listingId,
    url,
    title: text(raw.title ?? raw.name),
    roomType: text(raw.room_type ?? raw.roomType),
    propertyType: text(raw.property_type ?? raw.propertyType),
    city: text(raw.city),
    latitude: number(raw.latitude ?? raw.lat),
    longitude: number(raw.longitude ?? raw.lng),
    bedrooms: number(raw.bedrooms),
    beds: number(raw.beds),
    bathrooms: number(raw.bathrooms),
    maxGuests: number(raw.max_guests ?? raw.maxGuests ?? raw.guests),
    nightlyRate: number(raw.price_per_night ?? raw.pricePerNight ?? raw.nightlyRate ?? raw.price),
    currency: text(raw.pricing_currency ?? raw.currency),
    rating: number(raw.overall_rating ?? raw.rating),
    reviewCount: number(raw.review_count ?? raw.reviewCount ?? raw.reviewsCount),
    imageUrl: text(raw.main_image_url ?? raw.thumbnail ?? raw.imageUrl),
    isSuperhost: boolean(raw.host_is_superhost ?? raw.isSuperhost),
    amenities: strings(raw.amenities),
    scrapedAt: text(raw.scraped_at ?? raw.scrapedAt),
  };
}

export function normalizeCalendar(raw: RawRecord): ListingCalendar | ProviderError {
  const listingId = text(raw.listingId ?? raw.listing_id ?? raw.id);
  const warning = text(raw.warning ?? raw.error ?? raw.message);
  if (warning) return providerError("calendar", "provider_failure", "Calendar provider returned a warning", listingId);
  if (!listingId || !Array.isArray(raw.days ?? raw.calendar_data ?? raw.calendarData)) {
    return providerError("calendar", "invalid_payload", "Calendar row is missing listing identity or days", listingId);
  }

  const errors: string[] = [];
  const days = (raw.days ?? raw.calendar_data ?? raw.calendarData as unknown[]) as unknown[];
  const normalizedDays = days.flatMap((day) => {
    const normalized = normalizeCalendarDay(day);
    if (!normalized) errors.push("invalid day");
    return normalized ? [normalized] : [];
  });
  if (errors.length > 0) return providerError("calendar", "invalid_payload", "Calendar row contains an invalid day", listingId);

  return {
    provider: "airbnb",
    listingId,
    url: text(raw.url ?? raw.listingUrl ?? raw.listing_url),
    currency: text(raw.currency ?? raw.pricing_currency),
    scrapedAt: text(raw.scrapedAt ?? raw.scraped_at),
    days: normalizedDays,
  };
}

function normalizeCalendarDay(value: unknown): CalendarDay | undefined {
  if (!isRecord(value)) return undefined;
  const date = text(value.calendarDate ?? value.date);
  const available = boolean(value.available ?? value.isAvailable);
  if (!date || available === undefined) return undefined;
  const formattedRate = text(value.priceFormatted ?? value.price_formatted ?? value.formattedRate);
  return {
    date,
    available,
    bookable: boolean(value.bookable ?? value.isBookable),
    availableForCheckin: boolean(value.availableForCheckin ?? value.available_for_checkin),
    availableForCheckout: boolean(value.availableForCheckout ?? value.available_for_checkout),
    minNights: number(value.minNights ?? value.min_nights),
    maxNights: number(value.maxNights ?? value.max_nights),
    nightlyRate: number(value.nightlyRate ?? value.nightly_rate ?? value.price ?? formattedRate),
    formattedRate,
  };
}

class ProviderTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProviderTimeoutError()), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function failure<T>(stage: ProviderStage, code: ProviderError["code"], message: string): ProviderBatch<T> {
  return { records: [], errors: [providerError(stage, code, message)] };
}
function providerError(stage: ProviderStage, code: ProviderError["code"], message: string, listingId?: string): ProviderError {
  return { stage, code, message, ...(listingId ? { listingId } : {}) };
}
function isProviderError(value: unknown): value is ProviderError { return isRecord(value) && typeof value.code === "string" && typeof value.stage === "string"; }
function isRecord(value: unknown): value is RawRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : undefined; }
function number(value: unknown) { if (value === null || value === undefined) return undefined; const cleaned = typeof value === "number" ? value : String(value).replace(/[^0-9.-]/g, ""); if (cleaned === "") return undefined; const parsed = typeof cleaned === "number" ? cleaned : Number(cleaned); return Number.isFinite(parsed) ? parsed : undefined; }
function boolean(value: unknown) { return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : undefined; }
function strings(value: unknown) { return Array.isArray(value) ? value.flatMap((item) => typeof item === "string" ? [item] : isRecord(item) && text(item.title ?? item.name) ? [text(item.title ?? item.name)!] : []) : undefined; }
function required(value: string, name: string) { const normalized = value.trim(); if (!normalized) throw new Error(`${name} is required`); return normalized; }
function positiveInteger(value: number, name: string) { if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`); return value; }
function clampInteger(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Math.trunc(Number.isFinite(value) ? value : min))); }
function boundedLimit(value: number | undefined, max: number) { return clampInteger(value ?? max, 1, max); }
