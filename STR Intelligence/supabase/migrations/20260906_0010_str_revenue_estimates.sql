begin;

create table if not exists public.str_revenue_estimates (
  id uuid primary key default gen_random_uuid(),
  canonical_property_id uuid not null references public.canonical_properties(id) on delete cascade,
  listing_snapshot_id uuid references public.listing_snapshots(id) on delete set null,
  provider text not null check (provider = 'airbtics'),
  provider_report_reference text not null,
  estimated_adr_usd numeric not null check (estimated_adr_usd > 0),
  estimated_occupancy_percent numeric not null check (estimated_occupancy_percent between 0 and 100),
  estimated_annual_revenue_usd numeric not null check (estimated_annual_revenue_usd > 0),
  comparable_count integer check (comparable_count is null or comparable_count >= 0),
  input_snapshot jsonb not null,
  raw_payload jsonb not null,
  collected_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_str_revenue_estimates_latest on public.str_revenue_estimates (canonical_property_id, collected_at desc);
alter table public.str_revenue_estimates enable row level security;

comment on table public.str_revenue_estimates is 'Immutable server-managed STR revenue estimates. RLS remains closed until authenticated user policies exist.';
comment on column public.str_revenue_estimates.raw_payload is 'Provider response retained only behind the server service-role boundary and never returned to browser clients.';

commit;
