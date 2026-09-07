import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StrComparatorProvider } from "../sources/str-comparator/provider.js";
import type { ComparatorRadiusMiles } from "../../shared/str-comparator.js";
import type { ComparisonCacheLookup, StrComparisonRepositoryPort } from "./repository.js";

export function createComparatorTools(dependencies: {
  provider: StrComparatorProvider;
  repository: StrComparisonRepositoryPort;
}) {
  const lookupComparisonCache = tool(
    async ({ canonicalPropertyId, radiusMiles }): Promise<ComparisonCacheLookup> => {
      return dependencies.repository.findComparisonCache(canonicalPropertyId, radiusMiles as ComparatorRadiusMiles);
    },
    {
      name: "lookup_comparison_cache",
      description: "Find the newest saved STR comparison for a canonical property and report whether it is fresh, stale, or missing.",
      schema: z.object({ canonicalPropertyId: z.string().min(1), radiusMiles: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]) }),
    },
  );

  const discoverNearbyStays = tool(
    async (input) => dependencies.provider.discover(input),
    {
      name: "discover_nearby_strs",
      description: "Retrieve nearby STR stays from the saved market dataset when no fresh comparison is available.",
      schema: z.object({
        location: z.string().min(1),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMiles: z.number().positive().max(25),
        limit: z.number().int().min(1).max(500),
        currency: z.literal("USD"),
        locale: z.literal("en-US"),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    },
  );

  return Object.freeze({ lookupComparisonCache, discoverNearbyStays });
}
