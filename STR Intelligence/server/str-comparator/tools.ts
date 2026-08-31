import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StrComparatorProvider } from "../sources/str-comparator/provider.js";
import type { ComparisonCacheLookup, StrComparisonRepositoryPort } from "./repository.js";

export function createComparatorTools(dependencies: {
  provider: StrComparatorProvider;
  repository: StrComparisonRepositoryPort;
}) {
  const lookupComparisonCache = tool(
    async ({ canonicalPropertyId }): Promise<ComparisonCacheLookup> => {
      return dependencies.repository.findComparisonCache(canonicalPropertyId);
    },
    {
      name: "lookup_comparison_cache",
      description: "Find the newest saved STR comparison for a canonical property and report whether it is fresh, stale, or missing.",
      schema: z.object({ canonicalPropertyId: z.string().min(1) }),
    },
  );

  const discoverNearbyStays = tool(
    async (input) => dependencies.provider.discover(input),
    {
      name: "discover_nearby_strs",
      description: "Collect nearby Airbnb stays for an evaluated home when no fresh saved comparison is available.",
      schema: z.object({
        location: z.string().min(1),
        limit: z.number().int().min(1).max(15),
        currency: z.literal("USD"),
        locale: z.literal("en-US"),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    },
  );

  return Object.freeze({ lookupComparisonCache, discoverNearbyStays });
}
