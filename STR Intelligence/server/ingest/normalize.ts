import type {
  ListingQuery,
  NormalizedSourceRecordUnion,
  ProviderErrorRecord,
} from "../sources/listing-source.js";

const ADDRESS_PARTS = [",", "·", "|"];

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toPositiveNumber(value: unknown): number | undefined {
  const parsed = toNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeAddress(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return input
    .split(new RegExp(`[${ADDRESS_PARTS.join("")}]`))
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function listify(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.map((item) => toString(item)).filter((item): item is string => Boolean(item));
    return items.length ? items : undefined;
  }

  const text = toString(value);
  if (!text) return undefined;
  return text.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
}

function providerError(
  source: ListingQuery["source"],
  message: string,
  raw: unknown,
  code?: string,
  externalId?: string,
): ProviderErrorRecord {
  return {
    kind: "provider_error",
    source,
    externalId,
    message,
    code,
    raw,
  };
}

export function normalizeSourceRecord(
  raw: unknown,
  query: ListingQuery,
): NormalizedSourceRecordUnion {
  const record = raw as Record<string, unknown> & {
    hdpData?: Record<string, unknown> & { address?: unknown; homeInfo?: Record<string, unknown> };
  };

  if (!raw || typeof raw !== "object") {
    return providerError(query.source, "Invalid provider payload: record is not an object", raw);
  }

  const errorFlag = record.error ?? record.provider_error ?? record.type === "error";
  if (errorFlag) {
    return {
      kind: "provider_error",
      source: query.source,
      externalId: toString(record.id ?? record.externalId),
      message:
        toString(record.message) ??
        toString(record.error_message) ??
        "Provider returned an error record",
      code: toString(record.code ?? record.error_code),
      raw,
    };
  }

  const externalId =
    toString(record.id ?? record.externalId ?? record.zpid ?? record.zpidString) ??
    undefined;
  const url = toString(record.url ?? record.listingUrl ?? record.detailUrl);
  const address = normalizeAddress(
    toString(record.address ?? record.streetAddress ?? record.hdpData?.address ?? record.location),
  );

  if (!externalId || !url) {
    return providerError(
      query.source,
      "Provider listing record missing required externalId or url",
      raw,
      "missing_required_fields",
      externalId,
    );
  }

  const discoveredAt = toString(record.discoveredAt ?? record.discoveryDate ?? record.createdAt) ?? new Date().toISOString();

  return {
    kind: "listing",
    source: query.source,
    externalId,
    url,
    discoveredAt,
    title: toString(record.title ?? record.addressText ?? record.hdpData?.homeInfo?.homeInfo),
    address,
    city: toString(record.city),
    county: toString(record.county),
    state: toString(record.state),
    postalCode: toString(record.postalCode ?? record.zipCode ?? record.zip),
    price: toNumber(record.price ?? record.listPrice),
    beds: toNumber(record.beds),
    baths: toNumber(record.baths),
    sqft: toNumber(record.sqft ?? record.homeSize ?? record.livingArea),
    lotSqft: toPositiveNumber(record.lotSqft ?? record.lotSize ?? record.lotArea),
    lotAcres: toPositiveNumber(record.lotAcres),
    imageUrl: toString(record.imageUrl ?? record.imgSrc),
    propertyType: toString(record.propertyType ?? record.homeType),
    zoningText: toString(record.zoningText ?? record.zoning ?? record.zoningDescription),
    latitude: toNumber(record.latitude ?? record.lat),
    longitude: toNumber(record.longitude ?? record.lng ?? record.lon),
    statusText: toString(record.statusText ?? record.status ?? record.homeStatus),
    description: toString(record.description ?? record.summary),
    amenities: listify(record.amenities),
    raw,
  };
}

export function normalizeSourceRecords(
  rawRecords: unknown[],
  query: ListingQuery,
): NormalizedSourceRecordUnion[] {
  return rawRecords.map((record) => normalizeSourceRecord(record, query));
}
