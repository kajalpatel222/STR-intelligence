import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StrPotentialProvider } from "./provider.js";
import type { StrPotentialRepository } from "./repository.js";
import type { StrPotentialEvidence } from "../../shared/str-potential.js";

export function createStrPotentialTools(dependencies: Readonly<{
  repository: Pick<StrPotentialRepository, "findFresh" | "assembleEvidence">;
  provider: StrPotentialProvider;
}>) {
  const lookupStrPotentialCache = tool(
    async ({ listingUrl }) => dependencies.repository.findFresh(listingUrl),
    {
      name: "lookup_str_potential_cache",
      description: "Load a fresh saved STR-potential evaluation for a Zillow property without invoking the multimodal model.",
      schema: z.object({ listingUrl: z.string().url() }),
    },
  );
  const assembleListingEvidence = tool(
    async ({ listingUrl }) => dependencies.repository.assembleEvidence(listingUrl),
    {
      name: "assemble_str_potential_evidence",
      description: "Resolve a stored Zillow property and assemble sanitized facts, listing text, photos, reserve, and comparable characteristics.",
      schema: z.object({ listingUrl: z.string().url() }),
    },
  );
  const evaluateStrPotential = tool(
    async ({ evidence }) => dependencies.provider.evaluate(evidence as StrPotentialEvidence),
    {
      name: "evaluate_str_potential",
      description: "Evaluate sanitized property evidence with the configured multimodal model and return a strict structured result.",
      schema: z.object({ evidence: z.custom<StrPotentialEvidence>() }),
    },
  );
  return Object.freeze({ lookupStrPotentialCache, assembleListingEvidence, evaluateStrPotential });
}
