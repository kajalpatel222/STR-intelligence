create table if not exists public.attention_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  criteria_snapshot jsonb not null,
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  total_homes integer not null default 0 check (total_homes >= 0),
  evaluated_count integer not null default 0 check (evaluated_count >= 0),
  unscorable_count integer not null default 0 check (unscorable_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.attention_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_run_id uuid not null references public.attention_evaluation_runs(id) on delete cascade,
  canonical_property_id uuid not null references public.canonical_properties(id) on delete cascade,
  listing_snapshot_id uuid not null references public.listing_snapshots(id) on delete cascade,
  outcome text not null check (outcome in ('evaluated', 'unscorable', 'failed')),
  attention_score numeric(6, 2) check (attention_score between 0 and 100),
  confidence_score numeric(6, 2) check (confidence_score between 0 and 100),
  priority_band text check (priority_band in ('review_now', 'promising', 'low_priority', 'ineligible')),
  priority_reason_code text,
  priority_reason text,
  category_breakdown jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  risk_deductions jsonb not null default '[]'::jsonb,
  strict_limit_violations jsonb not null default '[]'::jsonb,
  explanation jsonb not null default '{}'::jsonb,
  failure_message text,
  created_at timestamptz not null default now(),
  unique (evaluation_run_id, canonical_property_id, listing_snapshot_id)
);

create index if not exists idx_attention_evaluations_property_created
  on public.attention_evaluations (canonical_property_id, created_at desc);
create index if not exists idx_attention_evaluations_snapshot
  on public.attention_evaluations (listing_snapshot_id);

alter table public.attention_evaluation_runs enable row level security;
alter table public.attention_evaluations enable row level security;

comment on table public.attention_evaluation_runs is
  'Append-only Attention evaluation batches with the exact criteria snapshot used.';
comment on table public.attention_evaluations is
  'Immutable per-property Attention outcomes; server service-role access only until authentication exists.';
