import type {
  FinancialPropertySnapshot,
  SaveFinancialAnalysisRequest,
} from "../../shared/financial-analysis.js";
import { validateFinancialAssumptions } from "../../shared/financial-assumptions.js";
import type { FinancialAnalysisRepositoryPort } from "../financial/repository.js";

export function createFinancialAnalysesHandler(repository: FinancialAnalysisRepositoryPort) {
  return {
    async get() {
      return response(200, {
        status: "available",
        analyses: await repository.listLatest(200),
      });
    },
    async post(input: unknown) {
      const body = record(input);
      const property = parseProperty(body.property);
      const validation = validateFinancialAssumptions(body.assumptions);
      if (!property) return invalid("Choose a valid Zillow property before saving the analysis.");
      if ("errors" in validation) return invalid(validation.errors[0]?.message ?? "Check the financial assumptions.");
      const request: SaveFinancialAnalysisRequest = Object.freeze({
        property,
        assumptions: validation.value,
      });
      return response(201, {
        status: "saved",
        analysis: await repository.save(request),
      });
    },
  };
}

function parseProperty(value: unknown): FinancialPropertySnapshot | undefined {
  const property = record(value);
  if (!isZillowUrl(property.listingUrl) || !shortText(property.title, 300)) return undefined;
  if (property.imageUrl !== undefined && !isHttpsUrl(property.imageUrl)) return undefined;
  const optionalTexts = ["address", "location"] as const;
  if (optionalTexts.some((field) => property[field] !== undefined && !shortText(property[field], 300))) return undefined;
  const optionalNumbers = ["priceUsd", "beds", "baths", "livingAreaSqft"] as const;
  if (optionalNumbers.some((field) => property[field] !== undefined && !nonNegativeFinite(property[field]))) return undefined;
  return Object.freeze({
    listingUrl: property.listingUrl,
    title: property.title,
    ...(typeof property.address === "string" ? { address: property.address } : {}),
    ...(typeof property.location === "string" ? { location: property.location } : {}),
    ...(typeof property.imageUrl === "string" ? { imageUrl: property.imageUrl } : {}),
    ...(typeof property.priceUsd === "number" ? { priceUsd: property.priceUsd } : {}),
    ...(typeof property.beds === "number" ? { beds: property.beds } : {}),
    ...(typeof property.baths === "number" ? { baths: property.baths } : {}),
    ...(typeof property.livingAreaSqft === "number" ? { livingAreaSqft: property.livingAreaSqft } : {}),
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function shortText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}
function nonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function isZillowUrl(value: unknown): value is string {
  if (!isHttpsUrl(value)) return false;
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === "zillow.com" || hostname.endsWith(".zillow.com");
}
function invalid(message: string) { return response(400, { status: "invalid", message }); }
function response(statusCode: number, body: Record<string, unknown>) { return { statusCode, body } as const; }
