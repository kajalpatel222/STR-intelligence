import {
  createFinancialAssumptions,
  type FinancialAssumptions,
  type FinancialAssumptionsField,
  type FinancialAssumptionsValidationResult,
  validateFinancialAssumptions,
} from "../shared/financial-assumptions";

export type FinancialAssumptionsDraft = Record<FinancialAssumptionsField, string>;

export type FinancialListingContext = Readonly<{
  title: string;
  address?: string;
  location?: string;
  imageUrl?: string;
  priceUsd?: number | null;
  beds?: number | null;
  baths?: number | null;
  livingAreaSqft?: number | null;
  sourceUrl?: string | null;
}>;

export type PropertyTaxJurisdiction = Readonly<{
  county: "Madera County" | "Mariposa County" | null;
  state: "California";
}>;

export type TransientOccupancyTaxProfile = Readonly<{
  county: "Madera County" | "Mariposa County" | null;
  ratePercent: number;
  sourceUrl: string | null;
  sourceLabel: string;
  statusLabel: string;
}>;

const MADERA_TOT_SOURCE = "https://www.maderacounty.com/government/treasurer-tax-collector/hotel-motel-room-tax";
const MARIPOSA_TOT_SOURCE = "https://www.mariposacounty.org/DocumentCenter/View/64984/FORM-Fill-PDF-Version---TOT-BID-Tax-Return";

export function getPropertyTaxJurisdiction(
  listing: Pick<FinancialListingContext, "address" | "location">,
): PropertyTaxJurisdiction {
  const place = `${listing.address ?? ""} ${listing.location ?? ""}`.toLowerCase();
  if (/\boakhurst\b/.test(place)) return Object.freeze({ county: "Madera County", state: "California" });
  if (/\bmariposa\b/.test(place)) return Object.freeze({ county: "Mariposa County", state: "California" });
  return Object.freeze({ county: null, state: "California" });
}

export function getTransientOccupancyTaxProfile(
  listing: Pick<FinancialListingContext, "address" | "location">,
): TransientOccupancyTaxProfile {
  const jurisdiction = getPropertyTaxJurisdiction(listing);
  if (jurisdiction.county === "Madera County") {
    return Object.freeze({
      county: jurisdiction.county,
      ratePercent: 9,
      sourceUrl: MADERA_TOT_SOURCE,
      sourceLabel: "Madera County hotel/motel room tax",
      statusLabel: "Current county rate · effective 2025",
    });
  }
  if (jurisdiction.county === "Mariposa County") {
    return Object.freeze({
      county: jurisdiction.county,
      ratePercent: 12,
      sourceUrl: MARIPOSA_TOT_SOURCE,
      sourceLabel: "Mariposa County TOT/BID tax return",
      statusLabel: "Current county return",
    });
  }
  return Object.freeze({
    county: null,
    ratePercent: 9,
    sourceUrl: null,
    sourceLabel: "No county source available",
    statusLabel: "County unavailable · planning default",
  });
}

export function createFinancialDraft(listing: FinancialListingContext): FinancialAssumptionsDraft {
  const taxProfile = getTransientOccupancyTaxProfile(listing);
  const assumptions = createFinancialAssumptions({
    ...(typeof listing.priceUsd === "number" && Number.isFinite(listing.priceUsd) && listing.priceUsd > 0
      ? { purchasePriceUsd: listing.priceUsd }
      : {}),
    transientOccupancyTaxPercent: taxProfile.ratePercent,
  });
  return financialAssumptionsToDraft(assumptions);
}

export function financialAssumptionsToDraft(
  assumptions: FinancialAssumptions,
): FinancialAssumptionsDraft {
  return Object.fromEntries(
    Object.entries(assumptions).map(([field, value]) => [field, String(value)]),
  ) as FinancialAssumptionsDraft;
}

export function parseFinancialDraft(
  draft: FinancialAssumptionsDraft,
): FinancialAssumptionsValidationResult {
  // Blank and partially typed values deliberately become invalid rather than silently becoming zero.
  const candidate = Object.fromEntries(
    Object.entries(draft).map(([field, value]) => [
      field,
      value.trim() === "" ? Number.NaN : Number(value),
    ]),
  );
  return validateFinancialAssumptions(candidate);
}

export function formatFinancialCurrency(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

export function formatFinancialRatio(value: number | null): string {
  if (value === null) return "Not applicable";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatFinancialDscr(value: number | null): string {
  return value === null ? "Not applicable · no mortgage payments" : `${value.toFixed(2)}x`;
}
