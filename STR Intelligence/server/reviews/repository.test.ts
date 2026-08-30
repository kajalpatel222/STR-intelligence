import { strict as assert } from "node:assert";
import test from "node:test";
import { ListingReviewRepository } from "./repository.js";

test("resolves public URLs to private property identities before reading and writing reviews", async () => {
  let written: Record<string, unknown> | undefined;
  const client = {
    from(table: string) {
      if (table === "property_source_ids") return {
        select() { return {
          async in() { return { data: [{ canonical_property_id: "private-property", external_url: "https://example.com/home" }], error: null }; },
          eq() { return { limit() { return { async maybeSingle() { return { data: { canonical_property_id: "private-property" }, error: null }; } }; } }; },
        }; },
      };
      return {
        select() { return { async in() { return { data: [{ canonical_property_id: "private-property", decision: "hold" }], error: null }; } }; },
        async upsert(row: Record<string, unknown>) { written = row; return { error: null }; },
      };
    },
  };
  const repository = new ListingReviewRepository(client as never);
  assert.deepEqual(await repository.listByUrls(["https://example.com/home"]), [{ listingUrl: "https://example.com/home", decision: "hold" }]);
  assert.deepEqual(await repository.save("https://example.com/home", "promote"), { listingUrl: "https://example.com/home", decision: "promote" });
  assert.equal(written?.canonical_property_id, "private-property");
  assert.equal(written?.decision, "promote");
  assert.equal("listing_url" in (written ?? {}), false);
});
