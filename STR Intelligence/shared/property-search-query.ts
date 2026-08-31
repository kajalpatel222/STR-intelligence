export const PROPERTY_SEARCH_KINDS = ["existing_home", "land"] as const;
export type PropertySearchKind = (typeof PROPERTY_SEARCH_KINDS)[number];

export const SUPPORTED_PROPERTY_SEARCH_LOCATIONS = [
  { id: "oakhurst_ca", city: "Oakhurst", state: "CA", label: "Oakhurst, California" },
  { id: "mariposa_ca", city: "Mariposa", state: "CA", label: "Mariposa, California" },
] as const;

export type PropertySearchLocationId =
  (typeof SUPPORTED_PROPERTY_SEARCH_LOCATIONS)[number]["id"];

export type PropertySearchLocation = Readonly<{
  id: PropertySearchLocationId;
  city: string;
  state: "CA";
  label: string;
}>;

export type PropertySearchConstraints = Readonly<{
  maximumPriceUsd?: number;
  minimumBedrooms?: number;
}>;

export type PropertySearchQueryIssueCode =
  | "missing_property_kind"
  | "conflicting_property_kind"
  | "missing_location"
  | "ambiguous_location"
  | "unsupported_location"
  | "invalid_maximum_price"
  | "invalid_minimum_bedrooms"
  | "bedrooms_not_applicable_to_land"
  | "unknown_constraint";

export type PropertySearchQueryIssue = Readonly<{
  code: PropertySearchQueryIssueCode;
  field: "query" | "propertyKind" | "location" | "maximumPriceUsd" | "minimumBedrooms";
  message: string;
  fragment?: string;
}>;

export type PropertySearchRequest = Readonly<{
  originalQuery: string;
  propertyKind?: PropertySearchKind;
  location?: PropertySearchLocation;
  constraints: PropertySearchConstraints;
}>;

export type PropertySearchQueryResult = Readonly<{
  ok: boolean;
  request: PropertySearchRequest;
  issues: readonly PropertySearchQueryIssue[];
}>;

const HOME_PATTERN = /\b(home|homes|house|houses|property|properties)\b/i;
const LAND_PATTERN = /\b(land|lot|lots|parcel|parcels|acreage)\b/i;
const IMPORTANT_UNSUPPORTED_CONSTRAINTS = [
  { pattern: /\b\d+(?:\.\d+)?\s*\+?\s*(?:acre|acres)\b/i, label: "acreage" },
  { pattern: /\b\d+\s*\+?\s*(?:bath|baths|bathroom|bathrooms)\b/i, label: "bathrooms" },
  { pattern: /\b(pool|hot tub|garage|view|waterfront|zoning)\b/i, label: "property feature" },
] as const;

export function parsePropertySearchQuery(originalQuery: string): PropertySearchQueryResult {
  const query = typeof originalQuery === "string" ? originalQuery : "";
  const issues: PropertySearchQueryIssue[] = [];
  const hasHome = HOME_PATTERN.test(query);
  const hasLand = LAND_PATTERN.test(query);
  let propertyKind: PropertySearchKind | undefined;

  if (hasHome && hasLand) {
    issues.push(issue("conflicting_property_kind", "propertyKind", "Choose either Homes or Land."));
  } else if (hasLand) {
    propertyKind = "land";
  } else if (hasHome) {
    propertyKind = "existing_home";
  } else {
    issues.push(issue("missing_property_kind", "propertyKind", "Say whether you want Homes or Land."));
  }

  const location = parseLocation(query, issues);
  const maximumPriceUsd = parseMaximumPrice(query, issues);
  const minimumBedrooms = parseMinimumBedrooms(query, issues);

  if (propertyKind === "land" && minimumBedrooms !== undefined) {
    issues.push(issue(
      "bedrooms_not_applicable_to_land",
      "minimumBedrooms",
      "Bedroom requirements apply to Homes, not Land.",
    ));
  }

  for (const constraint of IMPORTANT_UNSUPPORTED_CONSTRAINTS) {
    const match = query.match(constraint.pattern);
    if (match) {
      issues.push(issue(
        "unknown_constraint",
        "query",
        `${capitalize(constraint.label)} is not supported yet.`,
        match[0],
      ));
    }
  }

  return createResult({
    originalQuery: query,
    propertyKind,
    location,
    constraints: { maximumPriceUsd, minimumBedrooms },
  }, issues);
}

export function validatePropertySearchRequest(input: unknown): PropertySearchQueryResult {
  const candidate = isRecord(input) ? input : {};
  const originalQuery = typeof candidate.originalQuery === "string" ? candidate.originalQuery : "";
  const issues: PropertySearchQueryIssue[] = [];
  const propertyKind = PROPERTY_SEARCH_KINDS.includes(candidate.propertyKind as PropertySearchKind)
    ? candidate.propertyKind as PropertySearchKind
    : undefined;

  if (!propertyKind) {
    issues.push(issue("missing_property_kind", "propertyKind", "Choose either Homes or Land."));
  }

  const location = validateLocation(candidate.location, issues);
  const constraints = isRecord(candidate.constraints) ? candidate.constraints : {};
  const maximumPriceUsd = validateNonNegativeInteger(
    constraints.maximumPriceUsd,
    "maximumPriceUsd",
    "Maximum price must be a non-negative whole-dollar amount.",
    issues,
  );
  const minimumBedrooms = validateNonNegativeInteger(
    constraints.minimumBedrooms,
    "minimumBedrooms",
    "Minimum bedrooms must be a non-negative whole number.",
    issues,
  );
  if (propertyKind === "land" && minimumBedrooms !== undefined) {
    issues.push(issue(
      "bedrooms_not_applicable_to_land",
      "minimumBedrooms",
      "Bedroom requirements apply to Homes, not Land.",
    ));
  }

  return createResult({
    originalQuery,
    propertyKind,
    location,
    constraints: { maximumPriceUsd, minimumBedrooms },
  }, issues);
}

function parseLocation(query: string, issues: PropertySearchQueryIssue[]) {
  const oakhurst = /\boakhurst\b/i.test(query);
  const mariposa = /\bmariposa\b/i.test(query);

  if (oakhurst && mariposa) {
    issues.push(issue("ambiguous_location", "location", "Choose either Oakhurst or Mariposa."));
    return undefined;
  }
  if (oakhurst) return copyLocation("oakhurst_ca");
  if (mariposa) return copyLocation("mariposa_ca");
  if (/\byosemite\b/i.test(query)) {
    issues.push(issue("ambiguous_location", "location", "Choose Oakhurst or Mariposa for a Yosemite-area search.", "Yosemite"));
    return undefined;
  }

  const locationPhrase = query.match(/\b(?:in|near|around)\s+([A-Za-z][A-Za-z .'-]{1,40})(?=\s+(?:under|below|with|at|for)\b|[,.;!?]|$)/i);
  if (locationPhrase) {
    issues.push(issue("unsupported_location", "location", "That location is not supported. Choose Oakhurst or Mariposa.", locationPhrase[1]?.trim()));
  } else {
    issues.push(issue("missing_location", "location", "Choose Oakhurst or Mariposa."));
  }
  return undefined;
}

function parseMaximumPrice(query: string, issues: PropertySearchQueryIssue[]) {
  const match = query.match(/(?:\b(?:under|below|max(?:imum)?|up to|budget(?:\s+of)?)\s*)\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\b/i);
  if (!match) return undefined;
  const base = Number(match[1]?.replaceAll(",", ""));
  const value = match[2] ? base * 1_000 : base;
  if (!Number.isFinite(value) || value <= 0 || value > 100_000_000 || !Number.isInteger(value)) {
    issues.push(issue("invalid_maximum_price", "maximumPriceUsd", "Maximum price must be a valid whole-dollar amount.", match[0]));
    return undefined;
  }
  return value;
}

function parseMinimumBedrooms(query: string, issues: PropertySearchQueryIssue[]) {
  const match = query.match(/\b(\d+)\s*(?:\+|or more)?\s*(?:bed|beds|bedroom|bedrooms)\b/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value < 0 || value > 20) {
    issues.push(issue("invalid_minimum_bedrooms", "minimumBedrooms", "Minimum bedrooms must be a valid whole number.", match[0]));
    return undefined;
  }
  return value;
}

function validateLocation(value: unknown, issues: PropertySearchQueryIssue[]) {
  if (!isRecord(value) || typeof value.id !== "string") {
    issues.push(issue("missing_location", "location", "Choose Oakhurst or Mariposa."));
    return undefined;
  }
  if (!SUPPORTED_PROPERTY_SEARCH_LOCATIONS.some((location) => location.id === value.id)) {
    issues.push(issue("unsupported_location", "location", "That location is not supported. Choose Oakhurst or Mariposa."));
    return undefined;
  }
  return copyLocation(value.id as PropertySearchLocationId);
}

function validateNonNegativeInteger(
  value: unknown,
  field: "maximumPriceUsd" | "minimumBedrooms",
  message: string,
  issues: PropertySearchQueryIssue[],
) {
  if (value === undefined) return undefined;
  const invalid = typeof value !== "number" || !Number.isSafeInteger(value)
    || (field === "maximumPriceUsd" ? value <= 0 || value > 100_000_000 : value < 0 || value > 20);
  if (invalid) {
    issues.push(issue(field === "maximumPriceUsd" ? "invalid_maximum_price" : "invalid_minimum_bedrooms", field, message));
    return undefined;
  }
  return value;
}

function createResult(request: PropertySearchRequest, issues: PropertySearchQueryIssue[]): PropertySearchQueryResult {
  const frozenRequest = Object.freeze({
    ...request,
    location: request.location ? Object.freeze({ ...request.location }) : undefined,
    constraints: Object.freeze({ ...request.constraints }),
  });
  return Object.freeze({
    ok: issues.length === 0,
    request: frozenRequest,
    issues: Object.freeze(issues.map((entry) => Object.freeze({ ...entry }))),
  });
}

function copyLocation(id: PropertySearchLocationId): PropertySearchLocation {
  const location = SUPPORTED_PROPERTY_SEARCH_LOCATIONS.find((entry) => entry.id === id)!;
  return Object.freeze({ ...location });
}

function issue(
  code: PropertySearchQueryIssueCode,
  field: PropertySearchQueryIssue["field"],
  message: string,
  fragment?: string,
): PropertySearchQueryIssue {
  return { code, field, message, ...(fragment ? { fragment } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
