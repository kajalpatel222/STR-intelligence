import assert from "node:assert/strict";
import test from "node:test";
import { assembleStrPotentialEvidence, extractZillowImageUrls } from "./evidence.js";

test("extracts, sanitizes, deduplicates, and caps common Zillow image shapes", () => {
  const raw = {
    imgSrc: "https://photos.zillowstatic.com/a.jpg",
    responsivePhotos: [{ mixedSources: { jpeg: [{ url: "https://photos.zillowstatic.com/a.jpg" }, { url: "http://unsafe.test/b.jpg" }] } }],
    photos: Array.from({ length: 14 }, (_, index) => ({ url: `https://photos.zillowstatic.com/${index}.webp` })),
    unrelatedUrl: "https://private.test/secret.json",
  };
  const images = extractZillowImageUrls(raw);
  assert.equal(images.length, 10);
  assert.equal(images[0], "https://photos.zillowstatic.com/a.jpg");
  assert.equal(new Set(images).size, images.length);
  assert.equal(images.some((url) => url.startsWith("http:")), false);
});

test("assembles safe immutable property, financial, and comparable evidence", () => {
  const evidence = assembleStrPotentialEvidence({
    listingUrl: "https://www.zillow.com/homedetails/example/123_zpid/",
    property: { address_line1: "12 Pine Rd", city: "Oakhurst", state: "CA", zip_code: "93644", current_use: "SINGLE_FAMILY", lot_sqft: 43560 },
    snapshot: { list_price: 399000, beds: 3, baths: 2, sqft: 1600, description: "Private deck and mountain views.", amenities: ["Fireplace"], observed_at: "2026-08-30T10:00:00Z", raw_payload: { photos: [{ url: "https://photos.zillowstatic.com/home.jpg" }] } },
    financialAnalysis: { assumptions_snapshot: { improvementBudgetUsd: 40000 } },
    comparableRows: [{ property_type: "Entire home", bedrooms: 3, guest_capacity: 6, amenities: ["Hot tub", "Patio"] }],
  });
  assert.equal(evidence.property.lotSqft, 43560);
  assert.equal(evidence.improvementReserveUsd, 40000);
  assert.deepEqual(evidence.comparableCharacteristics, ["Entire home; 3 bedrooms; 6 guests; Hot tub; Patio"]);
  assert.equal(evidence.images[0]?.alt, "12 Pine Rd listing photo 1");
  assert.equal(Object.isFrozen(evidence.images), true);
  assert.equal(JSON.stringify(evidence).includes("raw_payload"), false);
});

test("ignores nonpositive facts and unsafe image URLs", () => {
  const evidence = assembleStrPotentialEvidence({
    listingUrl: "https://www.zillow.com/homedetails/1_zpid/",
    property: {},
    snapshot: { list_price: 0, lot_sqft: -1, raw_payload: { imgSrc: "javascript:alert(1)", images: [{ url: "https://example.com/not-an-image" }] } },
  });
  assert.equal(evidence.property.priceUsd, undefined);
  assert.equal(evidence.property.lotSqft, undefined);
  assert.deepEqual(evidence.images, []);
});
