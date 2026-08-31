# Comparator Agentic Pattern

The STR comparator uses a **deterministic retrieval-first cache-aside pattern with stale-if-error fallback**. LangGraph controls the state machine, and official LangChain tools expose bounded retrieval capabilities. No LLM selects tools or makes routing decisions.

## Flow

```text
Resolve canonical Zillow property
  -> validate a stored existing-home target
  -> lookup_comparison_cache
     -> fresh: return the saved comparison
     -> stale or missing: discover_nearby_strs
        -> success: rank five, persist a new immutable run, return it
        -> failure + stale data: return the saved stale comparison
        -> failure + no data: return a friendly unavailable result
```

The cache is keyed by the canonical property ID, not browser URL text. A completed comparison remains fresh for seven days. Refresh requests deliberately bypass the fresh-return branch, while retaining the saved result as a fallback if the provider is unavailable.

## LangChain Tools

The tools are created with `tool()` from `@langchain/core/tools` in `server/str-comparator/tools.ts`:

- `lookup_comparison_cache` reads the newest completed comparison for a canonical property and classifies it as fresh, stale, or missing.
- `discover_nearby_strs` invokes the injected Airbnb provider only when the graph determines that collection is needed.

`server/workflow/str-comparator-graph.ts` invokes these tools from named graph nodes and uses explicit conditional edges for every branch. Supabase persistence remains a controlled graph step rather than a freely callable tool because it writes immutable audit history.

## Why This Pattern

- Avoids repeat Apify charges while saved evidence is fresh.
- Keeps routing explainable and testable without probabilistic model behavior.
- Preserves useful stale evidence during temporary provider failures.
- Keeps provider credentials, raw payloads, cache keys, and database identifiers server-side.
- Retains every refreshed comparison as a separate immutable run.

Automated tests inject repository and provider doubles. They verify cache hits, misses, refreshes, stale fallback, tool names, and deterministic invocation without consuming provider credits or writing to Supabase.
