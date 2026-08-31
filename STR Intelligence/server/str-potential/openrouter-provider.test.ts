import { strict as assert } from "node:assert";
import test from "node:test";
import { OpenRouterStrPotentialProvider } from "./openrouter-provider.js";
import { createStrPotentialEvidence } from "../../shared/str-potential.js";

const evidence = createStrPotentialEvidence({
  property: { listingUrl: "https://www.zillow.com/homedetails/1", title: "Cabin", amenities: ["Deck"] },
  images: [{ url: "https://images.example/cabin.jpg", index: 0, alt: "Cabin photo 1" }],
  improvementReserveUsd: 40_000,
  comparableCharacteristics: [],
  observedAt: "2026-08-30T00:00:00Z",
});

const valid = {
  potential: "moderate", summary: "The cabin has visible outdoor appeal.", confidence: "moderate", confidenceExplanation: "One photo limits visual coverage.",
  strengths: [{ code: "deck", title: "Outdoor space", explanation: "A deck is visible.", evidence: [{ code: "photo-0", kind: "photo", label: "Deck shown", imageIndex: 0 }] }],
  risks: [], missingEvidence: ["Interior coverage"], recommendations: [{ code: "seating", title: "Furnish the deck", rationale: "Create a gathering area.", priority: "recommended", estimatedCostLowUsd: 2000, estimatedCostHighUsd: 5000, expectedGuestImpact: "medium", requiresProfessionalReview: false, evidence: [{ code: "photo-0", kind: "photo", label: "Deck shown", imageIndex: 0 }] }],
};

test("sends bounded multimodal structured output and validates the response", async () => {
  let request: RequestInit | undefined;
  const provider = new OpenRouterStrPotentialProvider({ apiKey: "private", model: "vision/model", fetcher: async (_url, init) => {
    request = init;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 });
  } });
  const result = await provider.evaluate(evidence);
  const body = JSON.parse(String(request?.body)) as Record<string, any>;
  assert.equal(body.model, "vision/model");
  assert.equal(body.provider.require_parameters, true);
  assert.equal(body.messages[1].content.filter((item: any) => item.type === "image_url").length, 1);
  const providerSchema = JSON.stringify(body.response_format.json_schema.schema);
  assert.equal(providerSchema.includes("$schema"), false);
  assert.equal(providerSchema.includes("minLength"), false);
  assert.equal(providerSchema.includes("maxLength"), false);
  assert.equal(providerSchema.includes("minItems"), false);
  assert.equal(providerSchema.includes("maxItems"), false);
  assert.equal(providerSchema.includes("minimum"), false);
  assert.equal(providerSchema.includes("maximum"), false);
  assert.equal(result.recommendations[0]!.estimatedCostHighUsd, 5000);
  assert.equal(JSON.stringify(body).includes("private"), false);
});

test("rejects unsupported photo evidence and malformed structured output", async () => {
  const badReference = structuredClone(valid);
  badReference.strengths[0]!.evidence[0]!.imageIndex = 9;
  const provider = (content: unknown) => new OpenRouterStrPotentialProvider({ apiKey: "private", model: "vision/model", fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }) });
  await assert.rejects(() => provider(JSON.stringify(badReference)).evaluate(evidence), /unavailable evidence/);
  await assert.rejects(() => provider("not json").evaluate(evidence), /invalid result/);
});

test("contains provider failures without exposing raw responses", async () => {
  const provider = new OpenRouterStrPotentialProvider({ apiKey: "private", model: "vision/model", fetcher: async () => new Response("secret provider failure", { status: 500 }) });
  await assert.rejects(() => provider.evaluate(evidence), { message: "STR potential evaluation provider is unavailable." });
});
