export const LISTING_REVIEW_DECISIONS = ["promote", "hold", "dismiss"] as const;

export type ListingReviewDecision = (typeof LISTING_REVIEW_DECISIONS)[number];

export function isListingReviewDecision(value: unknown): value is ListingReviewDecision {
  return LISTING_REVIEW_DECISIONS.includes(value as ListingReviewDecision);
}
