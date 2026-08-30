import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingReviewDecision } from "../../shared/listing-review.js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";

export type ListingReview = Readonly<{ listingUrl: string; decision: ListingReviewDecision }>;

export interface ListingReviewRepositoryPort {
  listByUrls(listingUrls: readonly string[]): Promise<readonly ListingReview[]>;
  save(listingUrl: string, decision: ListingReviewDecision): Promise<ListingReview>;
}

export class ListingReviewRepository implements ListingReviewRepositoryPort {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async listByUrls(listingUrls: readonly string[]): Promise<readonly ListingReview[]> {
    if (!listingUrls.length) return [];
    const { data: mappings, error: mappingError } = await this.client
      .from("property_source_ids")
      .select("canonical_property_id,external_url")
      .in("external_url", [...listingUrls]);
    if (mappingError) throw new Error("Unable to load listing reviews.");
    const propertyIds = (mappings ?? []).map((row) => String(row.canonical_property_id));
    if (!propertyIds.length) return [];
    const { data: reviews, error: reviewError } = await this.client
      .from("listing_reviews")
      .select("canonical_property_id,decision")
      .in("canonical_property_id", propertyIds);
    if (reviewError) throw new Error("Unable to load listing reviews.");
    const urlByProperty = new Map((mappings ?? []).map((row) => [String(row.canonical_property_id), String(row.external_url)]));
    return Object.freeze((reviews ?? []).flatMap((row) => {
      const listingUrl = urlByProperty.get(String(row.canonical_property_id));
      return listingUrl ? [Object.freeze({ listingUrl, decision: row.decision as ListingReviewDecision })] : [];
    }));
  }

  async save(listingUrl: string, decision: ListingReviewDecision): Promise<ListingReview> {
    // Public URLs are resolved server-side so database identifiers never cross the browser boundary.
    const { data: mapping, error: mappingError } = await this.client
      .from("property_source_ids")
      .select("canonical_property_id")
      .eq("external_url", listingUrl)
      .limit(1)
      .maybeSingle();
    if (mappingError || !mapping) throw new Error("This listing is not available for review.");
    const { error } = await this.client.from("listing_reviews").upsert({
      canonical_property_id: mapping.canonical_property_id,
      decision,
      updated_at: new Date().toISOString(),
    }, { onConflict: "canonical_property_id" });
    if (error) throw new Error("Unable to save the listing decision.");
    return Object.freeze({ listingUrl, decision });
  }
}
