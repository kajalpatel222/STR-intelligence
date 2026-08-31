import { strict as assert } from "node:assert";
import test from "node:test";
import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePublicStrPotential } from "./str-potential-client.js";
import { StrPotentialResultView, StrPotentialWorkspace } from "./StrPotentialWorkspace.js";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function result(status: "completed" | "insufficient_evidence" = "completed") {
  return parsePublicStrPotential({
    status,
    property: { listingUrl: "https://www.zillow.com/homedetails/123", title: "Pine Cabin", address: "123 Pine Road", location: "Oakhurst, CA", propertyType: "SINGLE_FAMILY", beds: 3, baths: 2, livingAreaSqft: 1500, lotAcres: 2.4 },
    evaluation: {
      potential: status === "completed" ? "strong" : "insufficient_evidence", summary: "A distinctive cabin with useful gathering space.", confidence: "moderate", confidenceExplanation: "The assessment is supported by listing facts.",
      strengths: [{ code: "view", title: "Scenic setting", explanation: "The setting can distinguish the guest experience.", evidence: [{ code: "fact", kind: "property_fact", label: "Property location" }] }],
      risks: [{ code: "privacy", title: "Privacy is unclear", explanation: "Neighbor visibility cannot be confirmed.", evidence: [] }],
      missingEvidence: ["Complete interior photo coverage"],
      recommendations: [{ code: "patio", title: "Furnish the patio", rationale: "Create a stronger outdoor gathering area.", priority: "recommended", estimatedCostLowUsd: 4000, estimatedCostHighUsd: 8000, expectedGuestImpact: "medium", requiresProfessionalReview: true, evidence: [] }],
      budget: { improvementReserveUsd: 5000, estimatedCostLowUsd: 0, estimatedCostHighUsd: 0, reserveGapLowUsd: 0, reserveGapHighUsd: 0 }, evaluatedAt: "2026-08-31T12:00:00.000Z",
    }, savedAt: "2026-08-31T12:00:01.000Z",
  });
}

test("renders a structured, user-facing evaluation with deterministic budget gap", () => {
  const markup = renderToStaticMarkup(createElement(StrPotentialResultView, { result: result(), onRefresh: () => undefined }));
  for (const copy of ["Pine Cabin", "Strong potential", "Evidence confidence", "Existing strengths", "Risks and limitations", "Missing evidence", "Improvement plan", "$4,000–$8,000", "Potential reserve gap", "$0–$3,000", "Professional review may be required.", "View Zillow listing"]) assert.equal(markup.includes(copy), true, copy);
  assert.equal(markup.includes("OpenRouter"), false);
  assert.equal(markup.includes("model"), false);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /<h1[^>]*tabindex="-1"/);
});

test("renders loading and insufficient-evidence states accessibly", () => {
  const loading = renderToStaticMarkup(createElement(StrPotentialWorkspace, { listingUrl: "https://www.zillow.com/homedetails/123", onBack: () => undefined }));
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /Evaluating STR potential/);
  const insufficient = renderToStaticMarkup(createElement(StrPotentialResultView, { result: result("insufficient_evidence") }));
  assert.match(insufficient, /More evidence would improve this evaluation/);
  assert.match(insufficient, /Complete interior photo coverage/);
});

test("keeps refresh disabled and announced while a new evaluation is running", () => {
  const markup = renderToStaticMarkup(createElement(StrPotentialResultView, { result: result(), refreshing: true, onRefresh: () => undefined }));
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /Refreshing/);
});
