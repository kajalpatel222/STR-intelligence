import type { NormalizedListingRecord } from "../ingest/types.js";
import { listingRoutingGraph } from "../workflow/graph.js";
import { initializeListingWorkflowState } from "../workflow/state.js";
import type { ListingWorkflowState } from "../workflow/state.js";
import { normalizeSupportedLocation } from "../markets/supported-markets.js";
import type { InvestmentCriteriaRepository } from "../criteria/repository.js";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";
import { parsePropertySearchQuery, validatePropertySearchRequest } from "../../shared/property-search-query.js";
import { validateZillowListingUrl } from "../../shared/zillow-listing-url.js";

type PropertySearchInput = Readonly<{
  query?: unknown;
  propertyType?: unknown;
  location?: unknown;
  maximumPriceUsd?: unknown;
  minimumBedrooms?: unknown;
  listingUrl?: unknown;
}>;

type GraphInvoker = Readonly<{
  invoke(input: { workflowState: ListingWorkflowState }): Promise<{ workflowState: ListingWorkflowState }>;
}>;

export function createPropertySearchHandler(
  graph: GraphInvoker = listingRoutingGraph,
  criteriaRepository?: Pick<InvestmentCriteriaRepository, "getDefaults">,
) {
  return async (input: PropertySearchInput) => {
    const directListing = input.listingUrl !== undefined ? validateZillowListingUrl(input.listingUrl) : undefined;
    if (directListing && "message" in directListing) {
      return response(422, { status: "invalid", message: directListing.message });
    }
    const direct = directListing && "url" in directListing ? directListing : undefined;
    const parsed = typeof input.query === "string"
      ? parsePropertySearchQuery(input.query)
      : validatePropertySearchRequest({
        originalQuery: "",
        propertyKind: input.propertyType === "homes" ? "existing_home" : input.propertyType === "land" ? "land" : input.propertyType,
        location: locationInput(input.location),
        constraints: { maximumPriceUsd: input.maximumPriceUsd, minimumBedrooms: input.minimumBedrooms },
      });
    if (!direct && (!parsed.ok || !parsed.request.propertyKind || !parsed.request.location)) {
      return response(422, { status: "invalid", message: parsed.issues[0]?.message ?? "Describe the Homes or Land search you want to run.", issues: parsed.issues });
    }
    if (parsed.request.propertyKind === "land" && parsed.request.constraints.minimumBedrooms !== undefined) {
      return response(422, { status: "invalid", message: "Bedroom filters apply to Homes, not Land." });
    }
    const propertyType = direct ? "homes" : parsed.request.propertyKind === "land" ? "land" : "homes";
    const location = direct?.location ?? normalizeSupportedLocation(`${parsed.request.location!.city}, ${parsed.request.location!.state}`)!;

    // Saved criteria are optional personalization; a missing/unavailable profile must never block listing search.
    const investmentCriteria = criteriaRepository
      ? await criteriaRepository.getDefaults().catch(() => DEFAULT_INVESTMENT_CRITERIA)
      : undefined;
    const workflowState = initializeListingWorkflowState({
      workflowId: crypto.randomUUID(),
      searchRequest: {
        source: propertyType === "land" ? "zillow_land" : "zillow_existing_home",
        location,
        lookbackDays: 7,
        recordLimit: direct ? 1 : 5,
        listingCategory: "for_sale",
        homeType: propertyType === "homes" ? "house" : undefined,
        filters: { ...parsed.request.constraints },
        ...(direct ? { listingUrl: direct.url } : {}),
      },
      investmentCriteria,
    });

    const result = await graph.invoke({ workflowState });
    const finalState = result.workflowState;
    if (finalState.status === "failed" && finalState.normalizedListings.length === 0) {
      return response(503, { status: "unavailable", message: "Property listings are temporarily unavailable. Please try again later." });
    }

    const listings = finalState.normalizedListings.map(toPublicListing);
    const singular = propertyType === "land" ? "land listing" : "home";
    const plural = propertyType === "land" ? "land listings" : "homes";
    return response(200, {
      status: listings.length ? "success" : "no_results",
      message: listings.length
        ? direct ? "Your Zillow property is ready to review." : `Found ${listings.length} ${listings.length === 1 ? singular : plural} near ${location}.`
        : direct ? "We could not load that Zillow property." : `No new ${plural} were found near ${location}.`,
      listingCount: listings.length,
      listings,
    });
  };
}

function locationInput(value: unknown) {
  const normalized = normalizeSupportedLocation(value);
  if (!normalized) return value;
  return { id: normalized === "Oakhurst, CA" ? "oakhurst_ca" : "mariposa_ca" };
}

function toPublicListing(listing: NormalizedListingRecord) {
  return {
    title: listing.title,
    address: listing.address,
    city: listing.city,
    state: listing.state,
    postalCode: listing.postalCode,
    price: listing.price,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    lotSqft: listing.lotSqft,
    lotAcres: listing.lotAcres,
    imageUrl: listing.imageUrl,
    propertyType: listing.propertyType,
    zoningText: listing.zoningText,
    description: listing.description,
    amenities: listing.amenities,
    statusText: listing.statusText,
    url: listing.url,
  };
}

function response(statusCode: number, body: Record<string, unknown>) {
  return { statusCode, body } as const;
}
