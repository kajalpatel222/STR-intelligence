import { strict as assert } from "node:assert";
import test from "node:test";
import { createListingReviewsHandler } from "./listing-reviews.js";

test("loads and saves safe listing review DTOs", async () => {
  const saved: Array<{ listingUrl: string; decision: "promote" | "hold" | "dismiss" }> = [];
  const handler = createListingReviewsHandler({
    async listByUrls(listingUrls) { return saved.filter((review) => listingUrls.includes(review.listingUrl)); },
    async save(listingUrl, decision) { const review = { listingUrl, decision }; saved.splice(0, saved.length, review); return review; },
  });
  const listingUrl = "https://www.zillow.com/homedetails/example/";
  const put = await handler.put({ listingUrl, decision: "promote" });
  assert.equal(put.statusCode, 200);
  assert.deepEqual(put.body, { review: { listingUrl, decision: "promote" } });
  const get = await handler.get({ listingUrls: [listingUrl] });
  assert.deepEqual(get.body, { reviews: [{ listingUrl, decision: "promote" }] });
});

test("rejects invalid decisions and unsafe listing references without persistence", async () => {
  let writes = 0;
  const handler = createListingReviewsHandler({
    async listByUrls() { return []; },
    async save(listingUrl, decision) { writes += 1; return { listingUrl, decision }; },
  });
  assert.equal((await handler.put({ listingUrl: "javascript:alert(1)", decision: "promote" })).statusCode, 400);
  assert.equal((await handler.put({ listingUrl: "https://example.com/home", decision: "maybe" })).statusCode, 400);
  assert.equal(writes, 0);
});
