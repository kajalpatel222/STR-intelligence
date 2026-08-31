begin;

alter table public.str_analysis_runs
  add column if not exists methodology_version text,
  add column if not exists property_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists assumptions_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists result_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists monthly_pre_tax_cash_flow numeric(14, 2),
  add column if not exists annual_pre_tax_cash_flow numeric(14, 2),
  add column if not exists net_operating_income numeric(14, 2),
  add column if not exists cap_rate numeric(10, 6),
  add column if not exists break_even_occupancy numeric(10, 6),
  add column if not exists total_cash_invested numeric(14, 2),
  add column if not exists expected_adr numeric(14, 2),
  add column if not exists expected_occupancy numeric(10, 6);

create index if not exists idx_str_analysis_latest_saved
  on public.str_analysis_runs (canonical_property_id, analysis_version desc, created_at desc);

comment on column public.str_analysis_runs.property_snapshot is
  'Safe display-only property context captured when the immutable analysis version is saved.';
comment on column public.str_analysis_runs.assumptions_snapshot is
  'Validated calculator input snapshot. Server-side writes only.';
comment on column public.str_analysis_runs.result_snapshot is
  'Deterministic calculator result generated server-side from assumptions_snapshot.';

-- Existing RLS remains intentionally closed; the Node service-role boundary owns all access.
commit;
