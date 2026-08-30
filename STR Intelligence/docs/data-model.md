# STR Intelligence Data Model

This document defines the initial Supabase/PostgreSQL model for STR Intelligence.

## Scope

- Primary market: Oakhurst, CA 93644 and Madera County.
- Discovery sources:
  - Apify Zillow existing-home listings
  - Apify Zillow land listings, stored under a distinct parcel source identity
- Weekly cadence: Saturday runs.
- Default lookback: 7 days, configurable up to 30 days.

## Design Principles

- Canonical relational tables are the source of truth.
- Listing snapshots are immutable and append-only.
- Scrape/source runs are stored separately from listings.
- Derived semantic search data lives in a separate pgvector table.
- Ranking is primarily by cash-on-cash return.
- Human review flags stay first-class in the schema.

## Core Entities

### `markets`

Stores the operational market configuration.

- `name`
- `state`
- `zip_code`
- `county`
- `default_lookback_days`
- `max_lookback_days`
- `run_day_of_week`

### `sources`

Defines the source adapters.

- `source_key`
- `source_name`
- `source_kind`
- `is_active`

### `source_runs`

One row per ingest attempt or discovery pass.

- `source_id`
- `market_id`
- `scheduled_for`
- `started_at`
- `finished_at`
- `status`
- `lookback_days`
- `run_mode`
- `notes`

### `canonical_properties`

Canonical property and parcel records.

- `property_kind` for existing-home, land parcel, or derived concept
- `normalized_address`
- `parcel_apn`
- `city`, `state`, `zip_code`, `county`
- `lat`, `lng`
- `lot_sqft`, `building_sqft`, `beds`, `baths`
- `current_use`
- `zoning_text`
- `str_eligibility_status`
- `eligibility_notes`

### `property_source_ids`

Deduplicates source identifiers against canonical properties.

- `source_id`
- `external_id`
- `canonical_property_id`

### `listing_snapshots`

Immutable observations of a source listing.

- `source_run_id`
- `source_id`
- `canonical_property_id`
- `external_id`
- `observed_at`
- `listing_url`
- `status_text`
- `list_price`
- `beds`, `baths`
- `sqft`, `lot_sqft`
- `description`
- `amenities`
- `raw_payload`

### `investment_criteria_profiles`

Stores the reusable Attention Screen defaults managed through the Node API.

- `profile_key` is constrained to the single `default` profile while the app has no authentication.
- Purchase budget minimum/maximum and improvement reserve are stored in USD.
- `mode` is `strict` or `flexible`.
- RLS is enabled with no browser policy; only the server service role may access this table.
- A later authentication phase can replace the singleton key with user ownership without changing the public criteria contract.

### `str_analysis_runs`

Stores the structured financial analysis for a property or listing snapshot.

- `canonical_property_id`
- `listing_snapshot_id`
- `analysis_version`
- `purchase_price`
- `down_payment_pct`
- `interest_rate`
- `loan_term_years`
- `monthly_piti`
- `annual_revenue`
- `annual_expenses`
- `cash_on_cash_return`
- `rank_score`
- `explanation`
- `pros`
- `cons`
- `human_review_status`

### `str_revenue_scenarios`

Projected ADR, occupancy, and revenue across concepts.

- `analysis_run_id`
- `scenario_name`
- `adr`
- `occupancy_rate`
- `annual_revenue`
- `scenario_notes`

### `str_expense_assumptions`

Expense assumptions by category.

- `analysis_run_id`
- `expense_type`
- `amount`
- `included_in_coc`

Management is stored but excluded from cash-on-cash return by default.

### `str_financing_assumptions`

Baseline financing model.

- `analysis_run_id`
- `down_payment_pct`
- `market_rate`
- `investor_spread_bps`
- `loan_term_years`
- `closing_costs`

### `str_upgrade_scenarios`

Amenity and renovation scenarios, including the later land build concepts.

- `analysis_run_id`
- `scenario_name`
- `scenario_type`
- `all_in_cap`
- `capex`
- `furnishing`
- `contingency`
- `notes`

### `str_comparables`

Property-specific STR comparables.

- `analysis_run_id`
- `comparable_property_id`
- `distance_miles`
- `adr`
- `occupancy_rate`
- `revenue`
- `notes`

### `search_documents`

Derived semantic/hybrid search layer.

- `canonical_property_id`
- `listing_snapshot_id`
- `analysis_run_id`
- `document_type`
- `search_text`
- `embedding`
- `metadata`

## Important Constraints

- Canonical properties are deduplicated by normalized address and parcel APN where available.
- Listing snapshots are deduplicated by `(source_id, external_id, observed_at)`.
- One active analysis version per property can be enforced by a unique partial index if needed later.
- `search_documents` is derived and can be rebuilt from relational tables.

## Notes On Requirements

- Existing-home target filter:
  - 3 bed
  - 2 bath
  - $350k to $400k
  - $40k upgrades/unforeseen reserve
- Land target filter:
  - residential or commercial parcels
  - uncertain STR eligibility flagged
  - later modeled build concepts capped at $450k all-in
- Ranking:
  - primary sort key is cash-on-cash return
  - secondary ordering can use confidence, review status, and recency

## Assumptions

- The schema starts with the minimum set of fields needed for ingestion, deduplication, analysis, ranking, and review.
- Additional source-specific attributes can live in `raw_payload` until they become important enough to normalize.
- Build concepts are modeled as upgrade/scenario rows rather than a separate property type.
