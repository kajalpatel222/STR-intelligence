# STR Intelligence

STR Intelligence is an agentic short-term-rental investment assistant created to reduce the manual work of moving between Zillow, Airbnb, and spreadsheets. It combines conversational property discovery, deterministic screening, cached STR comparisons, financial analysis, and on-demand multimodal STR-potential evaluation in one stateful workflow.

## Architecture

- **React + Vite + TypeScript** provides the natural-language property search, ranked listing cards, STR library, and financial dashboard.
- **Node.js** validates browser requests and keeps provider and database credentials server-side.
- **LangGraph + LangChain tools** route deterministic ingestion, retrieval-first STR comparison, and an on-demand multimodal STR-potential evaluation.
- **Apify** runs the configured Zillow Search Actor with source-specific filters and a five-record maximum.
- **OpenRouter** provides the server-side multimodal model used only when a user explicitly evaluates a saved property's STR potential.
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
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_MODEL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_NAME`
- `VITE_DEFAULT_LOOKBACK_DAYS`
- `VITE_MAX_LOOKBACK_DAYS`

`APIFY_API_TOKEN`, `APIFY_ZILLOW_ACTOR_ID`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENROUTER_API_KEY` are server-only. Never prefix secrets with `VITE_`.

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
- Natural-language queries support Homes or Land, either supported location, dynamic maximum purchase price, and minimum bedrooms for Homes. The server validates the parsed request before invoking Apify and does not silently guess unsupported constraints.
- The same dynamic constraints are encoded into Zillow `searchQueryState` and checked again after collection. A valid empty Actor result is shown as no matching listings, not as a provider outage.
- Default lookback: 7 days.
- Maximum provider records per request: 5.
- **Homes:** accepts existing-home Zillow records and displays home and lot details when available.
- **Land:** accepts parcel-only Zillow records and displays price, location, image, source descriptors, and parcel acreage/area when available.
- **Investment criteria defaults:** Home results start with the approved maximum budget, improvement reserve, and Strict/Flexible defaults. Users can edit the current analysis without rerunning the property search.
- Criteria are captured in workflow state and can be applied to the current Home results without rerunning the property search. They still do not change ingestion or routing.
- Each evaluated Home card shows a deterministic Attention Score, a separate evidence-based Confidence Score, and concise reasons. Land remains outside the Attention Screen.
- Evaluated Homes receive a transparent priority band: Review now, Promising, Low priority, or Ineligible. Review now requires Attention 75+ and Confidence 65+; strict-limit violations and unscorable listings are Ineligible.
- After criteria are applied, current Home results are ordered by highest Attention Score, then Confidence Score; unevaluated Home and Land searches retain provider order.
- Evaluated Home cards show their priority band and scores, with detailed evidence behind a compact disclosure.
- Applying criteria exposes **Compare nearby STRs**. The [documented retrieval-first agentic pattern](docs/comparator-agentic-pattern.md) runs only when that button is clicked, checks Supabase first, returns a fresh comparison without an Actor call, or collects and ranks the five strongest entire-home matches when evidence is missing or stale.
- Comparator evidence remains fresh for seven days. If refresh collection fails, the graph returns the latest stored comparison when one exists instead of discarding useful evidence.
- The read-only **STR Library** aggregates unique saved Airbnb comparables across Zillow properties and sorts them by recent observation, rating, closest recorded distance, or highest booked-or-blocked signal without calling Apify.
- **Phase 6.2 financial workspace:** each priced Home result can open an editable base-case analysis prefilled with its Zillow asking price. The workspace uses the shared [365-day calculator](docs/financial-calculator-methodology.md) to show cash flow, cash-on-cash return, cap rate, DSCR, break-even occupancy, and transparent calculation details. Property tax is estimated from purchase price and an editable planning rate, while insurance and miscellaneous utilities remain explicit assumptions. Guest-paid cleaning fees, an editable 15% platform-fee default, county-prefilled transient occupancy tax, and an estimated all-in nightly total are shown separately from owner operating expenses. **Save to dashboard** creates an immutable, server-calculated Supabase version; the Financial Dashboard shows the latest version per Home and defaults to highest cash-on-cash return. It does not infer ADR/occupancy from comparator evidence.
- **Phase 7 STR potential:** the Financial Dashboard exposes an explicit **Evaluate STR potential** action. The [conditional evaluation workflow](docs/str-potential-evaluation.md) checks saved evidence first, evaluates listing facts, text, multiple photos, and comparable characteristics only on demand, then stores an immutable result with strengths, risks, missing evidence, improvement ideas, and rough cost ranges.
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
npm run test:str-potential
npm run server:check
npm run check
npm run build
```

Automated tests use fixtures and injected repositories; they do not consume Apify credits or write to live Supabase.

## Project Documentation

- [Week 3 project documentation](docs/week-3-project-documentation.md)
- [STR comparator agentic pattern](docs/comparator-agentic-pattern.md)
- [Financial calculator methodology](docs/financial-calculator-methodology.md)
- [STR-potential evaluation workflow](docs/str-potential-evaluation.md)
- [Data model](docs/data-model.md)

## Roadmap

- **Phases 1-2 complete:** application foundation, schema, provider ingestion, normalization, validation, deduplication, and immutable snapshots.
- **Phase 3 complete:** shared workflow state, deterministic routing, LangGraph Home/Land execution, live Node API, and React integration.
- **Phase 4 - Attention Screen:** criteria controls with approved application defaults, deterministic Attention/Confidence scoring, stored-home batch evaluation history, priority bands, and score-ranked results are complete. The optional stored-listings screen remains deferred.
- **Phase 5 complete:** criteria-gated, Airbnb-backed comparable discovery, deterministic ranking, cached current-rate and calendar evidence, and a dedicated responsive workspace. Migration `20260830_0007_str_comparator.sql` is part of the required schema setup.
- **Phase 6 complete for the current scope:** the validated calculator, editable Home workspace, immutable Supabase saves, and cash-on-cash-ranked Financial Dashboard are available. Scenario comparison remains deferred.
- **Phase 7:** on-demand multimodal STR-potential evaluation, evidence-aware findings, improvement planning, and immutable evaluation history are implemented. Broader portfolio ranking and human review refinements remain future work.
- **Later:** stored-listings workspace, weekly automation, and operational scheduling.
