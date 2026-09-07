import { strict as assert } from "node:assert";
import test from "node:test";
import { createComparatorTools } from "./tools.js";
import type { StrComparisonRepositoryPort } from "./repository.js";

function repository(): StrComparisonRepositoryPort {
  return {
    async resolveTarget() { return undefined; },
    async findComparisonCache(canonicalPropertyId, radiusMiles) {
      assert.equal(canonicalPropertyId, "property-1");
      assert.equal(radiusMiles, 2);
      return { status: "fresh", publicReference: "saved-reference", expiresAt: "2026-09-06T00:00:00.000Z" };
    },
    async createRun() { return "run"; },
    async resolveRunId() { return "run"; },
    async saveDiscovery() {},
    async saveEvidence() {},
    async updateSelections() {},
    async loadComparison() { return undefined; },
  };
}

test("defines named LangChain tools and invokes injected deterministic capabilities", async () => {
  let providerCalls = 0;
  const tools = createComparatorTools({
    repository: repository(),
    provider: {
      async discover(request) {
        providerCalls += 1;
        assert.equal(request.location, "Oakhurst, CA");
        return { records: [], errors: [] };
      },
      async collectCalendars() { return { records: [], errors: [] }; },
    },
  });

  assert.equal(tools.lookupComparisonCache.name, "lookup_comparison_cache");
  assert.equal(tools.discoverNearbyStays.name, "discover_nearby_strs");
  assert.equal((await tools.lookupComparisonCache.invoke({ canonicalPropertyId: "property-1", radiusMiles: 2 })).status, "fresh");
  await tools.discoverNearbyStays.invoke({ location: "Oakhurst, CA", latitude: 37.33, longitude: -119.65, radiusMiles: 5, limit: 15, currency: "USD", locale: "en-US", checkIn: "2026-09-11", checkOut: "2026-09-13" });
  assert.equal(providerCalls, 1);
});
