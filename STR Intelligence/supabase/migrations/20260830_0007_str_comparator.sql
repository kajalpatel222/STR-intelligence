begin;

create table if not exists public.str_comparison_runs (
  id uuid primary key default gen_random_uuid(),
  public_reference uuid not null default gen_random_uuid() unique,
  canonical_property_id uuid not null references public.canonical_properties(id) on delete cascade,
  listing_snapshot_id uuid references public.listing_snapshots(id) on delete set null,
  status text not null check (status in ('running', 'discovered', 'enriched', 'partial', 'failed')),
  stage text not null check (stage in ('discovery', 'evidence')),
  request_snapshot jsonb not null default '{}'::jsonb,
  summary jsonb,
  methodology_version text not null default 'str-comparator-v1',
  cache_key text not null,
  idempotency_key text,
  candidate_count integer not null default 0,
  selected_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (canonical_property_id, idempotency_key)
);

create index if not exists str_comparison_runs_cache_idx
  on public.str_comparison_runs (canonical_property_id, cache_key, completed_at desc);

create table if not exists public.str_comparison_candidates (
  id uuid primary key default gen_random_uuid(),
  comparison_run_id uuid not null references public.str_comparison_runs(id) on delete cascade,
  provider_source text not null,
  provider_listing_key text not null,
  listing_url text,
  title text,
  image_url text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  distance_miles numeric(10, 3),
  property_type text,
  room_type text,
  bedrooms numeric(6, 2),
  bathrooms numeric(6, 2),
  guest_capacity integer,
  rating numeric(4, 2),
  review_count integer,
  is_superhost boolean,
  amenities jsonb not null default '[]'::jsonb,
  observed_nightly_price_usd numeric(12, 2),
  observed_check_in date,
  observed_check_out date,
  similarity_score numeric(8, 3),
  match_reasons jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (comparison_run_id, provider_source, provider_listing_key)
);

create table if not exists public.str_rate_observations (
  id uuid primary key default gen_random_uuid(),
  comparison_candidate_id uuid not null references public.str_comparison_candidates(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  night_count integer not null check (night_count > 0),
  nightly_rate_usd numeric(12, 2) not null check (nightly_rate_usd > 0),
  stay_total_usd numeric(12, 2),
  observed_at timestamptz not null,
  raw_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.str_calendar_snapshots (
  id uuid primary key default gen_random_uuid(),
  comparison_candidate_id uuid not null references public.str_comparison_candidates(id) on delete cascade,
  window_start date not null,
  window_end date not null,
  available_nights integer not null default 0,
  unavailable_nights integer not null default 0,
  unknown_nights integer not null default 0,
  unavailability_rate numeric(7, 6),
  daily_observations jsonb not null default '[]'::jsonb,
  raw_evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (window_end >= window_start)
);

create table if not exists public.str_comparable_selections (
  comparison_run_id uuid not null references public.str_comparison_runs(id) on delete cascade,
  comparison_candidate_id uuid not null references public.str_comparison_candidates(id) on delete cascade,
  included boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (comparison_run_id, comparison_candidate_id)
);

alter table public.str_comparison_runs enable row level security;
alter table public.str_comparison_candidates enable row level security;
alter table public.str_rate_observations enable row level security;
alter table public.str_calendar_snapshots enable row level security;
alter table public.str_comparable_selections enable row level security;

comment on table public.str_comparison_runs is
  'Server-managed immutable STR comparison executions; public_reference is the only browser-safe identifier.';
comment on table public.str_comparable_selections is
  'Mutable single-user inclusion choices; collected provider evidence remains append-only.';

commit;
