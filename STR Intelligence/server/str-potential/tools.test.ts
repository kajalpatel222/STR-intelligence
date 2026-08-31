import { strict as assert } from "node:assert";
import test from "node:test";
import { createStrPotentialTools } from "./tools.js";

test("defines deterministic cache, evidence, and evaluation LangChain tools", async () => {
  const calls: string[] = [];
  const evidence = { property: { listingUrl: "https://www.zillow.com/homedetails/1", title: "Home", amenities: [] }, images: [], improvementReserveUsd: 0, comparableCharacteristics: [], observedAt: "2026-08-30T00:00:00Z" } as const;
  const tools = createStrPotentialTools({
    repository: {
      async findFresh() { calls.push("cache"); return undefined; },
      async assembleEvidence() { calls.push("evidence"); return { source: {} as never, evidence }; },
    },
    provider: { identity: { provider: "test", model: "test", promptVersion: "v1" }, async evaluate() { calls.push("model"); return { potential: "moderate", summary: "Potential", confidence: "low", confidenceExplanation: "Sparse", strengths: [], risks: [], missingEvidence: [], recommendations: [] }; } },
  });
  assert.deepEqual([tools.lookupStrPotentialCache.name, tools.assembleListingEvidence.name, tools.evaluateStrPotential.name], ["lookup_str_potential_cache", "assemble_str_potential_evidence", "evaluate_str_potential"]);
  await tools.lookupStrPotentialCache.invoke({ listingUrl: evidence.property.listingUrl });
  const assembled = await tools.assembleListingEvidence.invoke({ listingUrl: evidence.property.listingUrl });
  await tools.evaluateStrPotential.invoke({ evidence: assembled.evidence });
  assert.deepEqual(calls, ["cache", "evidence", "model"]);
});
