import type { AttentionListingInput } from "../../shared/attention-api.js";
import {
  createAttentionEvaluationInput,
  type AttentionEvidenceCode,
  type AttentionHistoryEvent,
} from "../../shared/attention-evaluator.js";
import { validateInvestmentCriteria } from "../../shared/investment-criteria.js";
import type { InvestmentCriteria } from "../../shared/investment-criteria.js";
import { attentionEvaluationGraph } from "../workflow/attention-evaluation-graph.js";

const MAX_LISTINGS_PER_EVALUATION = 100;
const VIEW_TERMS = ["mountain view", "forest view", "scenic view", "valley view", "yosemite view"] as const;

export async function handleAttentionEvaluation(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid("Attention criteria and listings are required.");
  const body = input as Record<string, unknown>;
  const criteria = validateInvestmentCriteria(body.criteria);
  if ("errors" in criteria) return invalid(criteria.errors[0]?.message ?? "Check the investment criteria values.");
  if (!Array.isArray(body.listings) || body.listings.length === 0 || body.listings.length > MAX_LISTINGS_PER_EVALUATION) {
    return invalid(`Provide between 1 and ${MAX_LISTINGS_PER_EVALUATION} home listings.`);
  }

  const listings = body.listings.map(parseListing);
  if (listings.some((listing) => listing === null)) return invalid("One or more listings contain invalid values.");

  const inputs = (listings as AttentionListingInput[]).map((listing) =>
    createAttentionEvaluationInput(toEvaluationInput(listing, criteria.value)));
  const graphResult = await attentionEvaluationGraph.invoke({ inputs, evaluations: [] });

  return response(200, { status: "success", evaluations: graphResult.evaluations });
}

function toEvaluationInput(listing: AttentionListingInput, criteria: InvestmentCriteria) {
  const description = listing.description?.trim();
  const viewSignals = description
    ? VIEW_TERMS.filter((term) => description.toLowerCase().includes(term))
    : [];
  const history: AttentionHistoryEvent[] = [];
  const available = availableEvidence(listing, description, viewSignals);
  const allEvidence: AttentionEvidenceCode[] = [
    "listing_price", "property_type", "location", "beds", "baths", "living_area", "lot_area",
    "description", "photos", "amenities", "view_signals", "listing_history", "price_history",
  ];
  const missing = allEvidence.filter((code) => !available.includes(code));

  return {
    criteria,
    facts: {
      listingPriceUsd: listing.price,
      propertyKind: "existing_home" as const,
      propertyType: listing.propertyType,
      location: { address: listing.address, city: listing.city, state: listing.state },
      beds: listing.beds,
      baths: listing.baths,
      livingAreaSqft: listing.sqft,
      lotAreaSqft: listing.lotSqft,
      lotAreaAcres: listing.lotAcres,
      description,
      photoUrls: listing.imageUrl ? [listing.imageUrl] : [],
      hasPrimaryImage: Boolean(listing.imageUrl),
      amenities: listing.amenities ?? [],
      viewSignals,
      history,
    },
    evidence: {
      available,
      missing,
      completeness: missing.length <= 3 ? "complete" as const : missing.length <= 8 ? "partial" as const : "minimal" as const,
    },
  };
}

function availableEvidence(listing: AttentionListingInput, description: string | undefined, viewSignals: readonly string[]) {
  const available: AttentionEvidenceCode[] = [];
  if (listing.price !== undefined) available.push("listing_price");
  if (listing.propertyType) available.push("property_type");
  if (listing.city || listing.state || listing.address) available.push("location");
  if (listing.beds !== undefined) available.push("beds");
  if (listing.baths !== undefined) available.push("baths");
  if (listing.sqft !== undefined) available.push("living_area");
  if (listing.lotSqft !== undefined || listing.lotAcres !== undefined) available.push("lot_area");
  if (description) available.push("description");
  if (listing.imageUrl) available.push("photos");
  if (listing.amenities !== undefined) available.push("amenities");
  if (viewSignals.length) available.push("view_signals");
  return available;
}

function parseListing(value: unknown): AttentionListingInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const numericKeys = ["price", "beds", "baths", "sqft", "lotSqft", "lotAcres"] as const;
  if (numericKeys.some((key) => record[key] !== undefined && (typeof record[key] !== "number" || !Number.isFinite(record[key])))) return null;
  if (record.amenities !== undefined && (!Array.isArray(record.amenities) || record.amenities.some((item) => typeof item !== "string"))) return null;
  const text = (key: string) => typeof record[key] === "string" ? record[key] as string : undefined;
  return {
    price: record.price as number | undefined,
    propertyType: text("propertyType"), address: text("address"), city: text("city"), state: text("state"),
    beds: record.beds as number | undefined, baths: record.baths as number | undefined, sqft: record.sqft as number | undefined,
    lotSqft: record.lotSqft as number | undefined, lotAcres: record.lotAcres as number | undefined,
    imageUrl: text("imageUrl"), description: text("description"), amenities: record.amenities as string[] | undefined,
    statusText: text("statusText"),
  };
}

function invalid(message: string) { return response(400, { status: "invalid", message }); }
function response(statusCode: number, body: Record<string, unknown>) { return { statusCode, body } as const; }
