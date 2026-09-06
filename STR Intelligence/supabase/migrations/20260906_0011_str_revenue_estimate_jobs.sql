begin;

create table if not exists public.str_revenue_estimate_jobs (
  id uuid primary key default gen_random_uuid(),
  canonical_property_id uuid not null references public.canonical_properties(id) on delete cascade,
  listing_snapshot_id uuid references public.listing_snapshots(id) on delete set null,
  provider text not null check (provider = 'airbtics'),
  provider_report_reference text not null unique,
  status text not null check (status in ('pending', 'completed', 'failed')),
  failure_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_str_revenue_estimate_jobs_latest
  on public.str_revenue_estimate_jobs (canonical_property_id, started_at desc);
alter table public.str_revenue_estimate_jobs enable row level security;

comment on table public.str_revenue_estimate_jobs is
  'Server-only Airbtics report lifecycle. Provider references never cross the browser boundary.';

commit;
