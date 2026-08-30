import type { NormalizedListingRecord } from "../ingest/types.js";
import { listingRoutingGraph } from "../workflow/graph.js";
import { initializeListingWorkflowState } from "../workflow/state.js";
import type { ListingWorkflowState } from "../workflow/state.js";
import { normalizeSupportedLocation } from "../markets/supported-markets.js";
import type { InvestmentCriteriaRepository } from "../criteria/repository.js";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";

type PropertySearchInput = Readonly<{
  propertyType?: unknown;
  location?: unknown;
}>;

type GraphInvoker = Readonly<{
  invoke(input: { workflowState: ListingWorkflowState }): Promise<{ workflowState: ListingWorkflowState }>;
}>;

export function createPropertySearchHandler(
  graph: GraphInvoker = listingRoutingGraph,
  criteriaRepository?: Pick<InvestmentCriteriaRepository, "getDefaults">,
) {
  return async (input: PropertySearchInput) => {
    if (input.propertyType !== "homes" && input.propertyType !== "land") {
      return response(400, { status: "invalid", message: "Choose Homes or Land to start a search." });
    }

    const location = normalizeSupportedLocation(input.location);
    if (!location) {
      return response(422, { status: "unsupported", message: "Choose Oakhurst, CA or Mariposa, CA." });
    }

    // Saved criteria are optional personalization; a missing/unavailable profile must never block listing search.
    const investmentCriteria = criteriaRepository
      ? await criteriaRepository.getDefaults().catch(() => DEFAULT_INVESTMENT_CRITERIA)
      : undefined;
    const workflowState = initializeListingWorkflowState({
      workflowId: crypto.randomUUID(),
      searchRequest: {
        source: input.propertyType === "land" ? "zillow_land" : "zillow_existing_home",
        location,
        lookbackDays: 7,
        recordLimit: 5,
        listingCategory: "for_sale",
        homeType: input.propertyType === "homes" ? "house" : undefined,
        filters: {},
      },
      investmentCriteria,
    });

    const result = await graph.invoke({ workflowState });
    const finalState = result.workflowState;
    if (finalState.status === "failed" && finalState.normalizedListings.length === 0) {
      return response(503, { status: "unavailable", message: "Property listings are temporarily unavailable. Please try again later." });
    }

    const listings = finalState.normalizedListings.map(toPublicListing);
    const singular = input.propertyType === "land" ? "land listing" : "home";
    const plural = input.propertyType === "land" ? "land listings" : "homes";
    return response(200, {
      status: listings.length ? "success" : "no_results",
      message: listings.length ? `Found ${listings.length} ${listings.length === 1 ? singular : plural} near ${location}.` : `No new ${plural} were found near ${location}.`,
      listingCount: listings.length,
      listings,
    });
  };
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
