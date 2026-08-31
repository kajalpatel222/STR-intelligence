import { createStrPotentialEvidence, type StrPotentialEvidence, type StrPotentialPropertyFacts } from "../../shared/str-potential.js";

export type StrPotentialEvidenceSource = Readonly<{
  listingUrl: string;
  property: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  financialAnalysis?: Record<string, unknown>;
  comparableRows?: readonly Record<string, unknown>[];
  observedAt?: string;
}>;

const IMAGE_KEYS = new Set(["imgsrc", "imageurl", "image", "url", "src", "jpeg", "webp"]);
const IMAGE_CONTAINER_KEYS = new Set(["photos", "images", "pictures", "photogallery", "responsivephotos", "originalphotos"]);

export function assembleStrPotentialEvidence(source: StrPotentialEvidenceSource): StrPotentialEvidence {
  const raw = record(source.snapshot.raw_payload);
  const address = firstText(source.property.address_line1, raw.streetAddress, raw.address);
  const city = firstText(source.property.city, raw.city);
  const state = firstText(source.property.state, raw.state);
  const postalCode = firstText(source.property.zip_code, raw.zipcode, raw.zipCode);
  const location = [city, state, postalCode].filter(Boolean).join(", ").replace(", ,", ",");
  const facts: StrPotentialPropertyFacts = {
    listingUrl: source.listingUrl,
    title: address ?? firstText(raw.address, raw.streetAddress) ?? "Saved property",
    ...(address ? { address } : {}),
    ...(location ? { location } : {}),
    ...(firstText(source.property.current_use, raw.homeType, raw.propertyType) ? { propertyType: firstText(source.property.current_use, raw.homeType, raw.propertyType)! } : {}),
    ...numberField("priceUsd", source.snapshot.list_price, raw.price),
    ...numberField("beds", source.snapshot.beds, source.property.beds, raw.bedrooms),
    ...numberField("baths", source.snapshot.baths, source.property.baths, raw.bathrooms),
    ...numberField("livingAreaSqft", source.snapshot.sqft, source.property.building_sqft, raw.livingArea),
    ...numberField("lotSqft", source.snapshot.lot_sqft, source.property.lot_sqft, raw.lotAreaValue, raw.lotSize),
    ...numberField("lotAcres", raw.lotAreaAcres, raw.acres),
    ...(firstText(source.snapshot.description, raw.description) ? { description: firstText(source.snapshot.description, raw.description)! } : {}),
    amenities: Object.freeze(extractAmenities(source.snapshot.amenities, raw.amenities, raw.resoFacts)),
  };
  const urls = extractZillowImageUrls(raw, 10);
  const reserve = nonNegativeNumber(record(source.financialAnalysis?.assumptions_snapshot).improvementBudgetUsd)
    ?? nonNegativeNumber(source.financialAnalysis?.renovation_budget)
    ?? 0;
  return createStrPotentialEvidence({
    property: facts,
    images: urls.map((url, index) => ({ url, index, alt: `${facts.title} listing photo ${index + 1}` })),
    improvementReserveUsd: reserve,
    comparableCharacteristics: summarizeComparables(source.comparableRows ?? []),
    observedAt: source.observedAt ?? firstText(source.snapshot.observed_at) ?? new Date().toISOString(),
  });
}

export function extractZillowImageUrls(rawPayload: unknown, limit = 10): readonly string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown, key = "", depth = 0): void => {
    if (found.length >= limit || depth > 7 || value == null) return;
    if (typeof value === "string") {
      if ((IMAGE_KEYS.has(key.toLowerCase()) || IMAGE_CONTAINER_KEYS.has(key.toLowerCase())) && safeHttpsImage(value) && !seen.has(value)) {
        seen.add(value); found.push(value);
      }
      return;
    }
    if (Array.isArray(value)) { for (const item of value) visit(item, key, depth + 1); return; }
    if (typeof value !== "object") return;
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      if (IMAGE_CONTAINER_KEYS.has(childKey.toLowerCase()) || IMAGE_KEYS.has(childKey.toLowerCase()) || IMAGE_CONTAINER_KEYS.has(key.toLowerCase())) visit(child, childKey, depth + 1);
    }
  };
  for (const key of ["imgSrc", "imageUrl", "photos", "images", "responsivePhotos", "originalPhotos", "photoGallery"]) visit(record(rawPayload)[key], key);
  return Object.freeze(found);
}

function summarizeComparables(rows: readonly Record<string, unknown>[]): readonly string[] {
  const values = rows.slice(0, 5).map((row) => {
    const parts = [firstText(row.property_type, row.room_type), numberLabel(row.bedrooms, "bedroom"), numberLabel(row.guest_capacity, "guest")].filter(Boolean);
    const amenities = extractAmenities(row.amenities).slice(0, 3);
    return [...parts, ...amenities].join("; ");
  }).filter(Boolean);
  return Object.freeze([...new Set(values)]);
}

function extractAmenities(...values: unknown[]): string[] {
  const output: string[] = [];
  const add = (value: unknown): void => {
    if (typeof value === "string" && value.trim()) output.push(value.trim());
    else if (Array.isArray(value)) value.forEach(add);
    else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (item === true) add(key); else if (["amenities", "features", "atAGlanceFacts"].includes(key)) add(item);
    });
  };
  values.forEach(add);
  return [...new Set(output)].slice(0, 40);
}

function safeHttpsImage(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && /\.(?:avif|jpe?g|png|webp)(?:$|\?)/i.test(url.pathname + url.search); } catch { return false; }
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function firstText(...values: unknown[]): string | undefined { return values.find((value) => typeof value === "string" && value.trim())?.toString().trim(); }
function nonNegativeNumber(value: unknown): number | undefined { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined; }
function positiveNumber(...values: unknown[]): number | undefined { return values.map(nonNegativeNumber).find((value) => value !== undefined && value > 0); }
function numberField(key: string, ...values: unknown[]): Record<string, number> { const value = positiveNumber(...values); return value === undefined ? {} : { [key]: value }; }
function numberLabel(value: unknown, label: string): string | undefined { const number = positiveNumber(value); return number === undefined ? undefined : `${number} ${label}${number === 1 ? "" : "s"}`; }
