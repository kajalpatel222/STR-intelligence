# Comparator Agentic Pattern

The STR comparator uses a **deterministic retrieval-first cache-aside pattern**. LangGraph controls the state machine, and official LangChain tools expose bounded retrieval capabilities. No LLM selects tools or makes routing decisions, and opening a comparison never calls a paid provider.

## Flow

```text
Resolve canonical Zillow property
  -> validate a stored existing-home target
  -> lookup_comparison_cache
     -> fresh: return the saved comparison
     -> stale or missing: discover_nearby_strs
        -> query saved Airbtics market snapshots around target coordinates
        -> deduplicate by Airbnb listing URL
        -> retain entire-home listings within the selected 1, 2, 5, or 10-mile radius
        -> persist a new immutable comparison run and return it
```

The cache is keyed by canonical property and radius, not browser URL text. A completed database-backed comparison remains fresh for seven days. Paid Airbtics market collection is a separate, explicit administrative operation; normal comparison browsing only reads Supabase.

## LangChain Tools

The tools are created with `tool()` from `@langchain/core/tools` in `server/str-comparator/tools.ts`:

- `lookup_comparison_cache` reads the newest completed comparison for a canonical property and classifies it as fresh, stale, or missing.
- `discover_nearby_strs` invokes the injected Airbtics database adapter only when the graph determines that a comparison run must be created.

`server/workflow/str-comparator-graph.ts` invokes these tools from named graph nodes and uses explicit conditional edges for every branch. Supabase persistence remains a controlled graph step rather than a freely callable tool because it writes immutable audit history.

## Why This Pattern

- Makes every property comparison free after the market dataset has been collected.
- Keeps routing explainable and testable without probabilistic model behavior.
- Uses the latest saved market snapshot per Airbnb listing and avoids duplicate results from overlapping gateway scans.
- Keeps provider credentials, raw payloads, cache keys, and database identifiers server-side.
- Retains every refreshed comparison as a separate immutable run.

Automated tests inject repository and provider doubles. They verify radius-specific cache behavior and filtering, deduplication, tool names, safe metric mapping, and deterministic invocation without consuming provider credits or writing to Supabase.
