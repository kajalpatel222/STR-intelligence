begin;

create extension if not exists pgcrypto;
create extension if not exists vector;

do $$
begin
  create type public.source_kind as enum ('zillow_existing_home', 'land_parcel');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.run_status as enum ('pending', 'running', 'succeeded', 'failed', 'partial');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.property_kind as enum ('existing_home', 'parcel', 'concept');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.str_eligibility_status as enum ('eligible', 'uncertain', 'ineligible', 'unknown');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.analysis_status as enum ('draft', 'needs_review', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.expense_type as enum (
    'insurance_fire_risk',
    'tot_lodging_tax',
    'cleaning',
    'property_tax',
    'pms',
    'platform_commissions',
    'management'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.scenario_type as enum ('upgrade', 'renovation', 'build_concept', 'base_case');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.review_flag as enum ('not_reviewed', 'flagged', 'in_review', 'resolved');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.markets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null check (char_length(state) = 2),
  zip_code text not null,
  county text not null,
  default_lookback_days integer not null default 7 check (default_lookback_days between 1 and 30),
  max_lookback_days integer not null default 30 check (max_lookback_days between 1 and 30),
  run_day_of_week smallint not null default 6 check (run_day_of_week between 0 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, state, zip_code, county)
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_name text not null,
  source_kind public.source_kind not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  market_id uuid not null references public.markets(id) on delete restrict,
  scheduled_for date not null,
  started_at timestamptz,
  finished_at timestamptz,
  status public.run_status not null default 'pending',
  lookback_days integer not null default 7 check (lookback_days between 1 and 30),
  run_mode text not null default 'scheduled',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, market_id, scheduled_for, run_mode)
);

create table if not exists public.canonical_properties (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id) on delete set null,
  property_kind public.property_kind not null,
  normalized_address text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip_code text,
  county text,
  parcel_apn text,
  lat numeric(10, 7),
  lng numeric(10, 7),
  lot_sqft numeric(14, 2),
  building_sqft numeric(14, 2),
  beds numeric(6, 2),
  baths numeric(6, 2),
  current_use text,
  zoning_text text,
  str_eligibility_status public.str_eligibility_status not null default 'unknown',
  eligibility_notes text,
  review_flag public.review_flag not null default 'not_reviewed',
  source_priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_id, normalized_address),
  unique (market_id, parcel_apn)
);

create table if not exists public.property_source_ids (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  canonical_property_id uuid not null references public.canonical_properties(id) on delete cascade,
  external_id text not null,
  external_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_identifier jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id),
  unique (source_id, canonical_property_id, external_id)
);

create table if not exists public.listing_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_run_id uuid not null references public.source_runs(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete restrict,
  canonical_property_id uuid references public.canonical_properties(id) on delete set null,
  external_id text not null,
  observed_at timestamptz not null default now(),
  listing_url text,
  status_text text,
  list_price numeric(14, 2),
  beds numeric(6, 2),
  baths numeric(6, 2),
  sqft numeric(14, 2),
  lot_sqft numeric(14, 2),
  price_per_sqft numeric(14, 2),
  description text,
  amenities jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, external_id, observed_at)
);

create table if not exists public.str_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  canonical_property_id uuid not null references public.canonical_properties(id) on delete cascade,
  listing_snapshot_id uuid references public.listing_snapshots(id) on delete set null,
  analysis_version integer not null default 1,
  model_version text not null default 'v1',
  purchase_price numeric(14, 2),
  renovation_budget numeric(14, 2) not null default 0,
  reserve_budget numeric(14, 2) not null default 0,
  all_in_cost numeric(14, 2),
  down_payment_pct numeric(6, 4) not null default 0.3000,
  interest_rate numeric(7, 4),
  loan_term_years integer not null default 30,
  monthly_piti numeric(14, 2),
  annual_revenue numeric(14, 2),
  annual_expenses numeric(14, 2),
  annual_management_expense numeric(14, 2) not null default 0,
  cash_on_cash_return numeric(10, 6),
  rank_score numeric(10, 6),
  explanation text,
  pros text[] not null default '{}'::text[],
  cons text[] not null default '{}'::text[],
  review_flag public.review_flag not null default 'not_reviewed',
  human_review_status public.analysis_status not null default 'draft',
  source_rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_property_id, analysis_version)
);

create table if not exists public.str_financing_assumptions (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.str_analysis_runs(id) on delete cascade,
  down_payment_pct numeric(6, 4) not null check (down_payment_pct between 0 and 1),
  market_rate numeric(7, 4) not null,
  investor_spread_bps integer not null default 0,
  loan_term_years integer not null default 30,
  closing_costs numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id)
);

create table if not exists public.str_revenue_scenarios (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.str_analysis_runs(id) on delete cascade,
  scenario_name text not null,
  adr numeric(14, 2) not null default 0,
  occupancy_rate numeric(6, 4) not null check (occupancy_rate between 0 and 1),
  annual_revenue numeric(14, 2) not null default 0,
  scenario_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id, scenario_name)
);

create table if not exists public.str_expense_assumptions (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.str_analysis_runs(id) on delete cascade,
  expense_type public.expense_type not null,
  amount numeric(14, 2) not null default 0,
  included_in_coc boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id, expense_type)
);

create table if not exists public.str_upgrade_scenarios (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.str_analysis_runs(id) on delete cascade,
  scenario_name text not null,
  scenario_type public.scenario_type not null,
  all_in_cap numeric(14, 2),
  capex numeric(14, 2) not null default 0,
  furnishing numeric(14, 2) not null default 0,
  contingency numeric(14, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id, scenario_name)
);

create table if not exists public.str_comparables (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.str_analysis_runs(id) on delete cascade,
  comparable_property_id uuid references public.canonical_properties(id) on delete set null,
  comparable_snapshot_id uuid references public.listing_snapshots(id) on delete set null,
  distance_miles numeric(10, 4),
  adr numeric(14, 2),
  occupancy_rate numeric(6, 4),
  revenue numeric(14, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_documents (
  id uuid primary key default gen_random_uuid(),
  canonical_property_id uuid references public.canonical_properties(id) on delete cascade,
  listing_snapshot_id uuid references public.listing_snapshots(id) on delete cascade,
  analysis_run_id uuid references public.str_analysis_runs(id) on delete cascade,
  document_type text not null,
  search_text text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_property_id, listing_snapshot_id, analysis_run_id, document_type)
);

create index if not exists idx_markets_active on public.markets (is_active);
create index if not exists idx_sources_kind_active on public.sources (source_kind, is_active);
create index if not exists idx_source_runs_lookup on public.source_runs (market_id, source_id, scheduled_for desc);
create index if not exists idx_canonical_properties_market_kind on public.canonical_properties (market_id, property_kind);
create index if not exists idx_canonical_properties_eligibility on public.canonical_properties (str_eligibility_status, review_flag);
create index if not exists idx_property_source_ids_external on public.property_source_ids (source_id, external_id);
create index if not exists idx_listing_snapshots_property_time on public.listing_snapshots (canonical_property_id, observed_at desc);
create index if not exists idx_listing_snapshots_source_time on public.listing_snapshots (source_id, observed_at desc);
create index if not exists idx_str_analysis_property_version on public.str_analysis_runs (canonical_property_id, analysis_version desc);
create index if not exists idx_str_analysis_rank on public.str_analysis_runs (cash_on_cash_return desc nulls last, rank_score desc nulls last);
create index if not exists idx_str_expense_type on public.str_expense_assumptions (expense_type);
create index if not exists idx_search_documents_fts on public.search_documents using gin (to_tsvector('english', search_text));
create index if not exists idx_search_documents_embedding on public.search_documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Keep all Data API access closed until explicit user-facing policies are added.
alter table public.markets enable row level security;
alter table public.sources enable row level security;
alter table public.source_runs enable row level security;
alter table public.canonical_properties enable row level security;
alter table public.property_source_ids enable row level security;
alter table public.listing_snapshots enable row level security;
alter table public.str_analysis_runs enable row level security;
alter table public.str_financing_assumptions enable row level security;
alter table public.str_revenue_scenarios enable row level security;
alter table public.str_expense_assumptions enable row level security;
alter table public.str_upgrade_scenarios enable row level security;
alter table public.str_comparables enable row level security;
alter table public.search_documents enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_markets'
  ) then
    create trigger set_updated_at_markets
    before update on public.markets
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_sources'
  ) then
    create trigger set_updated_at_sources
    before update on public.sources
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_source_runs'
  ) then
    create trigger set_updated_at_source_runs
    before update on public.source_runs
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_canonical_properties'
  ) then
    create trigger set_updated_at_canonical_properties
    before update on public.canonical_properties
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_property_source_ids'
  ) then
    create trigger set_updated_at_property_source_ids
    before update on public.property_source_ids
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_listing_snapshots'
  ) then
    create trigger set_updated_at_listing_snapshots
    before update on public.listing_snapshots
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_str_analysis_runs'
  ) then
    create trigger set_updated_at_str_analysis_runs
    before update on public.str_analysis_runs
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_str_financing_assumptions'
  ) then
    create trigger set_updated_at_str_financing_assumptions
    before update on public.str_financing_assumptions
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_str_revenue_scenarios'
  ) then
    create trigger set_updated_at_str_revenue_scenarios
    before update on public.str_revenue_scenarios
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_str_expense_assumptions'
  ) then
    create trigger set_updated_at_str_expense_assumptions
    before update on public.str_expense_assumptions
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_str_upgrade_scenarios'
  ) then
    create trigger set_updated_at_str_upgrade_scenarios
    before update on public.str_upgrade_scenarios
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_str_comparables'
  ) then
    create trigger set_updated_at_str_comparables
    before update on public.str_comparables
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_search_documents'
  ) then
    create trigger set_updated_at_search_documents
    before update on public.search_documents
    for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.markets (name, state, zip_code, county, default_lookback_days, max_lookback_days, run_day_of_week)
values ('Oakhurst', 'CA', '93644', 'Madera County', 7, 30, 6)
on conflict (name, state, zip_code, county) do nothing;

insert into public.sources (source_key, source_name, source_kind)
values
  ('bright_data_zillow_existing_home', 'Bright Data Zillow Existing Home Listings', 'zillow_existing_home'),
  ('bright_data_zillow_land_parcel', 'Bright Data Zillow Land Listings', 'land_parcel')
on conflict (source_key) do nothing;

commit;
