import { isListingReviewDecision } from "../../shared/listing-review.js";
import type { ListingReviewRepositoryPort } from "../reviews/repository.js";

const MAX_REVIEW_URLS = 100;

export function createListingReviewsHandler(repository: ListingReviewRepositoryPort) {
  return {
    async get(input: unknown) {
      const body = asRecord(input);
      if (!Array.isArray(body.listingUrls) || body.listingUrls.length > MAX_REVIEW_URLS) return invalid("Provide a valid listing selection.");
      const listingUrls = body.listingUrls.filter(isSafeUrl);
      if (listingUrls.length !== body.listingUrls.length) return invalid("One or more listing references are invalid.");
      return response(200, { reviews: await repository.listByUrls(listingUrls) });
    },
    async put(input: unknown) {
      const body = asRecord(input);
      if (!isSafeUrl(body.listingUrl) || !isListingReviewDecision(body.decision)) return invalid("Choose Promote, Hold, or Dismiss for a valid listing.");
      return response(200, { review: await repository.save(body.listingUrl, body.decision) });
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function isSafeUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function invalid(message: string) { return response(400, { status: "invalid", message }); }
function response(statusCode: number, body: Record<string, unknown>) { return { statusCode, body } as const; }
