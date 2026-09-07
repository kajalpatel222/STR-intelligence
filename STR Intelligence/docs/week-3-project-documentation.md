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
6. When requested, the comparator graph reads saved Airbtics market snapshots from Supabase, finds entire-home listings within a selected 1, 2, 5, or 10-mile radius, and persists the reproducible comparison set. Opening the comparison never invokes a paid provider.
7. The user can calculate and save an editable financial base case. The server recalculates the result before storing an immutable analysis version.
8. From the Financial Dashboard, the user can explicitly request a multimodal STR-potential evaluation. The graph checks its cache, assembles bounded evidence, conditionally invokes OpenRouter, and persists a structured result.

## Agentic Patterns

### Deterministic conditional routing

The property-search LangGraph uses the shared workflow state and an authoritative TypeScript selector to route Home, Land, and invalid requests. An LLM does not control ingestion routing.

### Sequential pipeline

Listing ingestion follows a controlled sequence: collect, normalize, validate, deduplicate, and persist. Each node returns typed state updates, and provider errors are contained rather than leaked to the browser.

### Deterministic retrieval-first comparison

The STR comparator uses a LangChain retrieval tool inside a LangGraph state machine. The tool queries previously collected Airbtics market snapshots in Supabase, deduplicates overlapping gateway collections, calculates distance from saved coordinates, and returns only entire-home listings within the selected radius. Paid market collection is a separate, explicit operation rather than a side effect of opening a comparison.

### Conditional multimodal evaluation

The STR-potential workflow checks for a fresh saved evaluation, assembles listing facts and images, and verifies that enough evidence exists before calling a vision-capable model through OpenRouter. The model performs qualitative interpretation only; deterministic code controls routing, validation, persistence, and budget arithmetic.

### Human-in-the-loop

The user initiates property collection, comparison discovery, financial saving, and multimodal evaluation. Financial assumptions remain editable, explanations remain visible, and no model makes the final investment decision. Secret-backed writes are performed only by the Node server.

## Tools and Actions

- **Apify Zillow Actor (read):** collects up to five current Home or Land records for a validated search.
- **Airbtics market snapshots (read):** provide saved listing-level LTM ADR, occupancy, revenue, coordinates, and property facts for deterministic nearby comparison.
- **Supabase repositories (read/write):** retrieve cached evidence and append immutable source runs, listing snapshots, comparisons, analyses, and evaluations.
- **LangChain retrieval tools (read):** expose deterministic Supabase lookup capabilities with typed inputs and outputs.
- **OpenRouter multimodal provider (read/analysis):** interprets supplied facts and images only after explicit user action.
- **Deterministic calculators and evaluators (local):** calculate Attention, Confidence, priority bands, financing, expenses, returns, and break-even occupancy.

## State and Memory

LangGraph carries typed workflow state through each graph execution, including the search request, provider references, normalized records, errors, deduplication results, persistence references, timestamps, and criteria snapshot. Supabase provides cross-session memory through canonical properties and append-only evidence history. Comparator runs retain the market collection timestamp, while financial and STR-potential records retain immutable versions for auditability.

## Safety, Limits, and Failure Recovery

- Provider credentials and the Supabase service-role key remain server-side and never enter React DTOs.
- Home and Land records have distinct source identities. Land fails closed when a provider returns residential records.
- Price and bedroom constraints are sent to Zillow and checked again after collection.
- An Actor “No results found” sentinel becomes an honest empty result rather than a false outage.
- Malformed provider rows are normalized into contained errors; raw payloads and internal IDs never cross the public API boundary.
- Comparator lookup is bounded to saved, coordinate-bearing entire-home records and never silently triggers a paid refresh.
- Sparse STR-potential evidence produces an insufficient-evidence result rather than fabricated certainty.
- Financial outputs are deterministic planning estimates, not investment, tax, insurance, or lending advice.

## Data Sources and Stored Data

- **Zillow listing data through Apify:** address, price, beds, baths, living area, parcel size, coordinates, property type, status, images, description, and source URL when available.
- **STR market data through Airbtics:** title, location, coordinates, property characteristics, guest capacity, LTM ADR, LTM occupancy, LTM revenue, ratings, reviews, images, and collection time when available.
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
5. **Comparator cost control:** Nearby comparison reads persisted Airbtics market evidence by coordinate and radius. Opening or resizing a comparison cannot trigger another paid provider call.
6. **Revenue evidence:** A deep-revenue experiment was removed when the selected calendar Actor did not supply reliable dated prices. Saved Airbtics LTM metrics are now displayed as historical market evidence, while financial assumptions remain explicitly editable.
7. **Financial analysis:** A deterministic 365-day calculator and immutable Financial Dashboard were added, with county-prefilled tax context and editable assumptions.
8. **Multimodal evaluation:** OpenRouter was added only for evidence-grounded qualitative STR-potential analysis.
9. **Natural-language search:** The search UI was simplified to one sentence. Live debugging corrected Zillow's listing-price filter key and distinguished a valid empty search from provider unavailability.

## Testing and Evaluation

The automated suite covers shared contracts, parsing, validation, provider mapping, Home/Land routing, graph branches, fixture ingestion, database-backed radius retrieval, scoring, financial calculations, repositories, safe API DTOs, and responsive component rendering. Provider clients and repositories are injected in tests, so automated verification consumes no provider credits and performs no live Supabase writes.

The final verification commands are:

```text
npm test
npm run server:check
npm run check
npm run build
```

Live verification is deliberately small and user-triggered. Success signals include correct graph routing, accepted records matching requested constraints, immutable persistence, database-only nearby retrieval, transparent empty and error states, and a complete user journey through the dashboards.

## Learnings and Observations

- Agentic quality depends more on state, bounded tools, error handling, and explicit control flow than on a long prompt.
- Deterministic logic is preferable for routing, validation, scoring, and financial mathematics; an LLM adds value mainly for qualitative image and text interpretation.
- Provider success does not guarantee usable data. Adapters must distinguish valid listings, warnings, malformed rows, and legitimate empty searches.
- Persistent evidence and explicit refresh policies reduce cost and improve resilience.
- Missing evidence should lower confidence or stop evaluation, not silently lower investment attractiveness or create invented facts.
- UI iteration matters as much as backend orchestration. Removing controls and technical explanations made the workflow easier to understand.

## Current Limitations and Next Steps

Property discovery accepts supported Zillow search locations, while database-backed comparisons require target coordinates and saved Airbtics coverage near that property. Airbtics LTM ADR, occupancy, and revenue are third-party estimates and remain evidence rather than verified host statements; financial assumptions stay editable. Future work includes broader saved market coverage, scenario and sensitivity analysis, portfolio-level ranking, authentication and per-user profiles, scheduling, tracing, and formal evaluation datasets.
