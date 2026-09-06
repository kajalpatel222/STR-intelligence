import { strict as assert } from "node:assert";
import test from "node:test";
import { validateZillowListingUrl } from "./zillow-listing-url.js";

test("accepts supported Zillow home-detail URLs and identifies their market", () => {
  assert.deepEqual(validateZillowListingUrl("https://www.zillow.com/homedetails/1-Pine-Rd-Oakhurst-CA-93644/123_zpid/"), {
    ok: true, url: "https://www.zillow.com/homedetails/1-Pine-Rd-Oakhurst-CA-93644/123_zpid/", location: "Oakhurst, CA",
  });
  assert.equal(validateZillowListingUrl("https://www.zillow.com/homedetails/2-Oak-Rd-Mariposa-CA-95338/456_zpid/").ok, true);
});

test("rejects non-Zillow, search, and unsupported-market URLs", () => {
  assert.equal(validateZillowListingUrl("https://example.com/homedetails/x/123_zpid/").ok, false);
  assert.equal(validateZillowListingUrl("https://www.zillow.com/homes/for_sale/").ok, false);
  assert.equal(validateZillowListingUrl("https://www.zillow.com/homedetails/1-Main-St-Fresno-CA-93721/123_zpid/").ok, false);
});
