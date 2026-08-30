import type { ListingReviewDecision } from "../shared/listing-review";

export async function loadListingReviews(listingUrls: readonly string[], fetcher: typeof fetch = fetch) {
  const response = await fetcher("/api/listing-reviews/query", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingUrls }),
  });
  const body = await response.json() as { reviews?: Array<{ listingUrl: string; decision: ListingReviewDecision }> };
  if (!response.ok || !body.reviews) throw new Error("Saved decisions could not be loaded.");
  return body.reviews;
}

export async function saveListingReview(listingUrl: string, decision: ListingReviewDecision, fetcher: typeof fetch = fetch) {
  const response = await fetcher("/api/listing-reviews", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingUrl, decision }),
  });
  const body = await response.json() as { review?: { listingUrl: string; decision: ListingReviewDecision }; message?: string };
  if (!response.ok || !body.review) throw new Error(body.message ?? "Decision could not be saved.");
  return body.review;
}
