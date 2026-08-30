import { strict as assert } from "node:assert";
import test from "node:test";
import { loadListingReviews, saveListingReview } from "./listing-review-client.js";

test("round-trips listing decisions through the narrow review API", async () => {
  const requests: Array<{ url: string; method?: string; body?: string }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), method: init?.method, body: init?.body as string | undefined });
    const body = String(input).endsWith("/query")
      ? { reviews: [{ listingUrl: "https://example.com/home", decision: "hold" }] }
      : { review: { listingUrl: "https://example.com/home", decision: "promote" } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  assert.deepEqual(await loadListingReviews(["https://example.com/home"], fetcher as typeof fetch), [{ listingUrl: "https://example.com/home", decision: "hold" }]);
  assert.deepEqual(await saveListingReview("https://example.com/home", "promote", fetcher as typeof fetch), { listingUrl: "https://example.com/home", decision: "promote" });
  assert.equal(requests[0]?.url, "/api/listing-reviews/query");
  assert.equal(requests[1]?.method, "PUT");
});
