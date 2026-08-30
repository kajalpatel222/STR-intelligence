# STR Intelligence

STR Intelligence is a short-term-rental investment research application that collects current Zillow listings, converts them into a canonical property model, and preserves listing history for later investment analysis.

## Architecture

- **React + Vite + TypeScript** provides the end-user conversational search and listing cards.
- **Node.js** validates browser requests and keeps provider and database credentials server-side.
- **LangGraph + LangChain tools** route deterministic ingestion and retrieval-first STR comparison workflows without an LLM.
- **Apify** runs the configured Zillow Search Actor with source-specific filters and a five-record maximum.
- **Supabase/PostgreSQL** stores markets, source runs, canonical homes/parcels, source mappings, and immutable listing snapshots.

The Home and Land branches share normalization, validation, deduplication, and persistence. Land ingestion fails closed on mixed provider output: only Zillow `LOT`/`LAND` records are accepted, and parcel cards omit home-only metrics.

## Setup

1. Install dependencies with `npm install`.
2. Create `.env` from `.env.example` and provide values for the required variables below.
3. Apply the SQL files in `supabase/migrations` to the configured Supabase project.
4. Run `npm run config:check` to verify server configuration without printing values.

Environment variable names:

- `APIFY_API_TOKEN`
- `APIFY_ZILLOW_ACTOR_ID`
- `APIFY_AIRBNB_DISCOVERY_ACTOR_ID` (optional; defaults to the selected discovery Actor)
- `APIFY_AIRBNB_CALENDAR_ACTOR_ID` (optional; defaults to the selected calendar Actor)
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_NAME`
- `VITE_DEFAULT_LOOKBACK_DAYS`
- `VITE_MAX_LOOKBACK_DAYS`

`APIFY_API_TOKEN`, `APIFY_ZILLOW_ACTOR_ID`, and `SUPABASE_SERVICE_ROLE_KEY` are server-only. Never prefix secrets with `VITE_`.

## Run Locally

Start the live API in the first terminal:

```bash
npm run dev:api
```

Start the frontend in a second terminal:

```bash
npm run dev
```

Vite proxies `/api` to the Node API at `http://127.0.0.1:8787`.

## Current Behavior

- Supported locations: Oakhurst, California and Mariposa, California.
- Default location: Oakhurst.
- Default lookback: 7 days.
- Maximum provider records per request: 5.
- **Homes:** accepts existing-home Zillow records and displays home and lot details when available.
- **Land:** accepts parcel-only Zillow records and displays price, location, image, source descriptors, and parcel acreage/area when available.
- **Investment criteria defaults:** Home results load and save a server-managed default budget, improvement reserve, and Strict/Flexible preference. The profile is intentionally a singleton until authentication introduces per-user ownership.
- Criteria are captured in workflow state and can be applied to the current Home results without rerunning the property search. They still do not change ingestion or routing.
- Each evaluated Home card shows a deterministic Attention Score, a separate evidence-based Confidence Score, and concise reasons. Land remains outside the Attention Screen.
- Evaluated Homes receive a transparent priority band: Review now, Promising, Low priority, or Ineligible. Review now requires Attention 75+ and Confidence 65+; strict-limit violations and unscorable listings are Ineligible.
- After criteria are applied, current Home results are ordered by highest Attention Score, then Confidence Score; unevaluated Home and Land searches retain provider order.
- Evaluated Home cards support persisted Promote, Hold, or Dismiss radio decisions. Detailed scoring evidence stays behind a compact disclosure, and a saved Promote decision unlocks STR comparison.
- A saved **Promote** decision unlocks a dedicated STR Comparator workspace. A [documented retrieval-first agentic pattern](docs/comparator-agentic-pattern.md) checks Supabase first, returns a fresh comparison without an Actor call, or collects and ranks the five strongest entire-home matches when evidence is missing or stale.
- Comparator evidence remains fresh for seven days. If refresh collection fails, the graph returns the latest stored comparison when one exists instead of discarding useful evidence.
- The read-only **STR Library** aggregates unique saved Airbnb comparables across Zillow properties and sorts them by recent observation, rating, closest recorded distance, or highest booked-or-blocked signal without calling Apify.
- Comparable cards show the current observed nightly rate and a concise **Booked or blocked** percentage based on the actual number of calendar nights observed for that listing. This signal is not presented as occupancy.
- Detailed ADR, selection controls, evidence summaries, and calendar actions are deferred to a broader stored-data analysis workspace.
- Comparator runs, candidate evidence, dated rates, and calendar snapshots are stored server-side. Provider keys, raw payloads, database IDs, and Actor metadata do not cross the browser boundary.
- The visible criteria use a maximum purchase budget and maximum improvement reserve; the hidden minimum purchase budget defaults to zero.
- The backend can evaluate the latest snapshot of every stored Home as a batch and persist immutable evaluation history. A stored-listings screen remains deferred.
- Provider payloads, credentials, workflow identifiers, and database identifiers never enter the public response DTO.

## Verification

```bash
npm test
npm run test:apify
npm run test:api
npm run test:graph
npm run test:comparator
npm run server:check
npm run check
npm run build
```

Automated tests use fixtures and injected repositories; they do not consume Apify credits or write to live Supabase.

## Roadmap

- **Phases 1-2 complete:** application foundation, schema, provider ingestion, normalization, validation, deduplication, and immutable snapshots.
- **Phase 3 complete:** shared workflow state, deterministic routing, LangGraph Home/Land execution, live Node API, and React integration.
- **Phase 4 - Attention Screen:** criteria controls and saved defaults, deterministic Attention/Confidence scoring, stored-home batch evaluation history, priority bands, score-ranked results, and persisted manual review decisions are complete. The optional stored-listings screen remains deferred.
- **Phase 5 complete:** promotion-gated, Airbnb-backed comparable discovery, deterministic ranking, cached current-rate and calendar evidence, and a dedicated responsive workspace. Migration `20260830_0007_str_comparator.sql` is part of the required schema setup.
- **Phase 6 next:** financial analysis using purchase, financing, expense, and approved comparable revenue assumptions.
- **Later:** stored-listings workspace, weekly automation, and operational scheduling.
