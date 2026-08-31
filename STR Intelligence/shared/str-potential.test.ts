import { strict as assert } from "node:assert";
import test from "node:test";
import { calculateImprovementBudget, createStrPotentialEvidence, type StrImprovementRecommendation } from "./str-potential.js";

test("creates an immutable evidence snapshot without shared collections", () => {
  const amenities = ["Hot tub"];
  const images = [{ url: "https://images.example/home.jpg", index: 0, alt: "Front of home" }];
  const evidence = createStrPotentialEvidence({
    property: { listingUrl: "https://www.zillow.com/homedetails/1", title: "Mountain home", amenities },
    images,
    improvementReserveUsd: 40_000,
    comparableCharacteristics: ["Hot tubs appear in nearby stays"],
    observedAt: "2026-08-30T00:00:00.000Z",
  });

  amenities.push("Pool");
  images[0]!.alt = "Changed";
  assert.deepEqual(evidence.property.amenities, ["Hot tub"]);
  assert.equal(evidence.images[0]!.alt, "Front of home");
  assert.equal(Object.isFrozen(evidence.images), true);
  assert.equal(Object.isFrozen(evidence.property.amenities), true);
});

test("calculates improvement totals and reserve gaps deterministically", () => {
  const recommendation = (low: number, high: number): StrImprovementRecommendation => ({
    code: `cost-${low}`,
    title: "Improvement",
    rationale: "Observed opportunity",
    priority: "recommended",
    estimatedCostLowUsd: low,
    estimatedCostHighUsd: high,
    expectedGuestImpact: "medium",
    requiresProfessionalReview: false,
    evidence: [],
  });
  assert.deepEqual(calculateImprovementBudget([recommendation(10_000, 20_000), recommendation(5_000, 30_000)], 40_000), {
    estimatedCostLowUsd: 15_000,
    estimatedCostHighUsd: 50_000,
    improvementReserveUsd: 40_000,
    reserveGapLowUsd: 0,
    reserveGapHighUsd: 10_000,
  });
});
