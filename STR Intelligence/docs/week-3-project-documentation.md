# STR Intelligence

## Week 3 Agentic AI Project Documentation

**Build track:** Code-heavy TypeScript with LangChain and LangGraph
**Surface:** Responsive React web application
**Repository:** `kajalpatel222/STR-intelligence`

## Project Overview

STR Intelligence began with a real problem: my husband was spending too much time moving between Zillow, Airbnb, and spreadsheets to locate and evaluate potential short-term-rental investments. I built one guided application that can discover properties, screen them against investment criteria, retrieve nearby STR evidence, calculate a financial base case, and perform an on-demand qualitative review of a property's STR potential.

**Agent goal:** STR Intelligence helps a short-term-rental investor complete a multi-step property review in one web application, replacing manual tab switching and spreadsheet assembly. It autonomously retrieves, validates, ranks, and reuses evidence through bounded tools; it asks the user to initiate paid or qualitative analysis and leaves the final investment decision with the human.

Success is measured end to end: a user should be able to move from a property-search sentence to a defensible shortlist, comparable evidence, and financial analysis in minutes rather than assembling the same evidence manually.

## User Workflow and Control Flow

1. The user describes a property search in natural language, such as “3+ bedroom homes under $500k in Oakhurst.”
2. A deterministic parser extracts property type, supported location, maximum price, and minimum bedrooms. The server validates the same structured request again.
3. LangGraph routes the request to the Home, Land, or invalid-request branch. Home and Land nodes invoke the shared ingestion pipeline.
4. Apify runs the configured Zillow Actor. The pipeline normalizes, validates, deduplicates, and stores accepted records as immutable Supabase snapshots.
5. For Homes, the user applies editable investment criteria. A deterministic evaluator produces Attention and Confidence scores, reasons, evidence gaps, and a priority band.
6. When requested, the comparator graph checks Supabase first. Fresh evidence is returned without another provider call; missing or stale evidence invokes the Airbnb Actor, ranks matches, and persists a new comparison.
7. The user can calculate and save an editable financial base case. The server recalculates the result before storing an immutable analysis version.
8. From the Financial Dashboard, the user can explicitly request a multimodal STR-potential evaluation. The graph checks its cache, assembles bounded evidence, conditionally invokes OpenRouter, and persists a structured result.

## Agentic Patterns

### Deterministic conditional routing

The property-search LangGraph uses the shared workflow state and an authoritative TypeScript selector to route Home, Land, and invalid requests. An LLM does not control ingestion routing.

### Sequential pipeline

Listing ingestion follows a controlled sequence: collect, normalize, validate, deduplicate, and persist. Each node returns typed state updates, and provider errors are contained rather than leaked to the browser.

### Retrieval-first cache-aside with stale-if-error

The STR comparator uses LangChain tools inside a LangGraph state machine. It checks Supabase before making a paid Apify request. Fresh evidence is reused, stale evidence triggers refresh, and stale saved evidence can be returned when a refresh fails.

### Conditional multimodal evaluation

The STR-potential workflow checks for a fresh saved evaluation, assembles listing facts and images, and verifies that enough evidence exists before calling a vision-capable model through OpenRouter. The model performs qualitative interpretation only; deterministic code controls routing, validation, persistence, and budget arithmetic.

### Human-in-the-loop

The user initiates property collection, comparison discovery, financial saving, and multimodal evaluation. Financial assumptions remain editable, explanations remain visible, and no model makes the final investment decision. Secret-backed writes are performed only by the Node server.

## Tools and Actions

- **Apify Zillow Actor (read):** collects up to five current Home or Land records for a validated search.
- **Apify Airbnb Actors (read):** collect nearby entire-home candidates and bounded calendar evidence.
- **Supabase repositories (read/write):** retrieve cached evidence and append immutable source runs, listing snapshots, comparisons, analyses, and evaluations.
- **LangChain cache and provider tools (read or bounded invocation):** expose deterministic capabilities with typed inputs and outputs.
- **OpenRouter multimodal provider (read/analysis):** interprets supplied facts and images only after explicit user action.
- **Deterministic calculators and evaluators (local):** calculate Attention, Confidence, priority bands, financing, expenses, returns, and break-even occupancy.

## State and Memory

LangGraph carries typed workflow state through each graph execution, including the search request, provider references, normalized records, errors, deduplication results, persistence references, timestamps, and criteria snapshot. Supabase provides cross-session memory through canonical properties and append-only evidence history. Comparator evidence has a defined freshness window, while financial and STR-potential records retain immutable versions for auditability.

## Safety, Limits, and Failure Recovery

- Provider credentials and the Supabase service-role key remain server-side and never enter React DTOs.
- Home and Land records have distinct source identities. Land fails closed when a provider returns residential records.
- Price and bedroom constraints are sent to Zillow and checked again after collection.
- An Actor “No results found” sentinel becomes an honest empty result rather than a false outage.
- Malformed provider rows are normalized into contained errors; raw payloads and internal IDs never cross the public API boundary.
- Comparator refresh failures can fall back to useful stale evidence.
- Sparse STR-potential evidence produces an insufficient-evidence result rather than fabricated certainty.
- Financial outputs are deterministic planning estimates, not investment, tax, insurance, or lending advice.

## Data Sources and Stored Data

- **Zillow listing data through Apify:** address, price, beds, baths, living area, parcel size, coordinates, property type, status, images, description, and source URL when available.
- **Airbnb comparable data through Apify:** title, location, distance derived from coordinates, property characteristics, guest capacity, observed current rate, ratings, reviews, Superhost signal, images, and bounded booked-or-blocked calendar observations when available.
- **User assumptions:** investment criteria and financial inputs such as financing, ADR, occupancy, taxes, insurance, utilities, management, maintenance, and guest-paid charges.
- **Multimodal evidence:** bounded Zillow images, listing text and facts, saved financial context, and comparable characteristics supplied to the OpenRouter model.
- **Supabase:** markets, sources, source runs, canonical properties, source mappings, immutable listing snapshots, attention history, STR comparisons, financial analyses, and STR-potential evaluations.

## Representative Vibe-Coding Prompts

The build was developed iteratively with Codex. Representative prompts included:

- “Create the typed shared workflow state that will later be passed through LangGraph.”
- “Add deterministic routing logic for existing homes, land, and invalid requests.”
- “Replace the home proof marker with a real ingestion node using dependency injection and fixture tests.”
- “Use a retrieval-first cache-aside pattern with LangChain tools; do not use an LLM for routing.”
- “Create a deterministic Attention evaluator with separate Attention and Confidence scores and transparent reasons.”
- “Build an editable financial-analysis workspace with explicit owner and guest-paid assumptions.”
- “Evaluate STR potential from listing facts and photos only when the user requests it, and preserve evidence limitations.”
- “Replace duplicate search controls with one natural-language query and validated provider filters.”

Prompts consistently constrained scope, required source-agnostic contracts, protected secrets, requested injected test doubles, and prohibited live provider calls during automated tests.

## Major Iterations

1. **Provider reliability:** Bright Data's Zillow crawler failed against provider-side page changes, so the active ingestion path moved to an Apify Zillow Actor behind the same source-agnostic transport contract.
2. **End-user UI:** A developer-oriented status dashboard was replaced by a product-facing search and results experience.
3. **Land correctness:** Mixed residential results were rejected server-side, home-only fields were removed from Land cards, and alternate nested acreage shapes were normalized without displaying zero as parcel size.
4. **Attention Screen:** Criteria, deterministic scoring, confidence, reasons, priority bands, and score ordering were introduced incrementally. Manual Promote/Hold/Dismiss controls were later removed to reduce unnecessary friction.
5. **Comparator cost control:** Paid discovery was moved behind an explicit user action and a Supabase-first cache check. A shared STR Library exposes saved comparable evidence without another Actor call.
6. **Revenue evidence:** A deep-revenue experiment was removed when the selected Actor did not supply reliable dated prices. The product now labels calendar unavailability honestly and leaves ADR/occupancy as explicit financial assumptions.
7. **Financial analysis:** A deterministic 365-day calculator and immutable Financial Dashboard were added, with county-prefilled tax context and editable assumptions.
8. **Multimodal evaluation:** OpenRouter was added only for evidence-grounded qualitative STR-potential analysis.
9. **Natural-language search:** The search UI was simplified to one sentence. Live debugging corrected Zillow's listing-price filter key and distinguished a valid empty search from provider unavailability.

## Testing and Evaluation

The automated suite covers shared contracts, parsing, validation, provider mapping, Home/Land routing, graph branches, fixture ingestion, cache behavior, stale fallback, scoring, financial calculations, repositories, safe API DTOs, and responsive component rendering. Provider clients and repositories are injected in tests, so automated verification consumes no Apify credits and performs no live Supabase writes.

The final verification commands are:

```text
npm test
npm run server:check
npm run check
npm run build
```

Live verification is deliberately small and user-triggered. Success signals include correct graph routing, accepted records matching requested constraints, immutable persistence, cache hits avoiding paid calls, transparent empty and error states, and a complete user journey through the dashboards.

## Learnings and Observations

- Agentic quality depends more on state, bounded tools, error handling, and explicit control flow than on a long prompt.
- Deterministic logic is preferable for routing, validation, scoring, and financial mathematics; an LLM adds value mainly for qualitative image and text interpretation.
- Provider success does not guarantee usable data. Adapters must distinguish valid listings, warnings, malformed rows, and legitimate empty searches.
- Persistent evidence and freshness policies reduce cost and improve resilience.
- Missing evidence should lower confidence or stop evaluation, not silently lower investment attractiveness or create invented facts.
- UI iteration matters as much as backend orchestration. Removing controls and technical explanations made the workflow easier to understand.

## Current Limitations and Next Steps

Property discovery currently supports Oakhurst and Mariposa because each market has validated map bounds and Supabase market context. Arbitrary-location support requires a trustworthy location-to-boundary resolver and dynamic market persistence. Comparator rates are observations, while ADR and occupancy remain editable assumptions rather than verified historical performance. Future work includes broader location support, a stored-property library, scenario and sensitivity analysis, portfolio-level ranking, authentication and per-user profiles, scheduling, tracing, and formal evaluation datasets.
