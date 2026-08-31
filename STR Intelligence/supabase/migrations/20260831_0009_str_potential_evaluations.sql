begin;

create table if not exists public.str_potential_evaluations (
  id uuid primary key default gen_random_uuid(),
  public_reference uuid not null default gen_random_uuid() unique,
  canonical_property_id uuid not null references public.canonical_properties(id) on delete cascade,
  listing_snapshot_id uuid references public.listing_snapshots(id) on delete set null,
  financial_analysis_run_id uuid references public.str_analysis_runs(id) on delete set null,
  evaluation_version integer not null,
  status text not null check (status in ('completed', 'insufficient_evidence')),
  evidence_snapshot jsonb not null,
  evaluation_snapshot jsonb not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  evaluated_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (canonical_property_id, evaluation_version)
);

create index if not exists idx_str_potential_latest
  on public.str_potential_evaluations (canonical_property_id, evaluated_at desc);

alter table public.str_potential_evaluations enable row level security;

comment on table public.str_potential_evaluations is
  'Server-managed immutable STR-potential evaluations. RLS remains closed until authenticated user policies exist.';
comment on column public.str_potential_evaluations.evidence_snapshot is
  'Sanitized property evidence supplied to the evaluator; provider raw payloads are never copied here.';

commit;
