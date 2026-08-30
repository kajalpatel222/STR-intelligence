import { strict as assert } from "node:assert";
import test from "node:test";
import { formatLandArea } from "./listing-format.js";

test("formats source acreage without losing parcel precision", () => {
  assert.equal(formatLandArea({ lotAcres: 5, lotSqft: 217800 }), "5 acres");
  assert.equal(formatLandArea({ lotAcres: 8.14, lotSqft: 354578 }), "8.14 acres");
});

test("does not present zero or missing parcel size", () => {
  assert.equal(formatLandArea({ lotSqft: 0 }), undefined);
  assert.equal(formatLandArea({}), undefined);
});
