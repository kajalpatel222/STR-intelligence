begin;

alter table public.str_comparison_candidates
  add column if not exists adr_ltm_usd numeric(12, 2),
  add column if not exists occupancy_ltm_percent numeric(7, 3),
  add column if not exists annual_revenue_ltm_usd numeric(14, 2),
  add column if not exists market_collected_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'str_comparison_candidates_adr_ltm_positive') then
    alter table public.str_comparison_candidates add constraint str_comparison_candidates_adr_ltm_positive
      check (adr_ltm_usd is null or adr_ltm_usd > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'str_comparison_candidates_occupancy_ltm_range') then
    alter table public.str_comparison_candidates add constraint str_comparison_candidates_occupancy_ltm_range
      check (occupancy_ltm_percent is null or occupancy_ltm_percent between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'str_comparison_candidates_revenue_ltm_nonnegative') then
    alter table public.str_comparison_candidates add constraint str_comparison_candidates_revenue_ltm_nonnegative
      check (annual_revenue_ltm_usd is null or annual_revenue_ltm_usd >= 0);
  end if;
end $$;

comment on column public.str_comparison_candidates.adr_ltm_usd is
  'Airbtics estimated average booked daily rate over the last twelve months.';
comment on column public.str_comparison_candidates.occupancy_ltm_percent is
  'Airbtics estimated occupancy percentage over the last twelve months.';
comment on column public.str_comparison_candidates.annual_revenue_ltm_usd is
  'Airbtics estimated listing revenue over the last twelve months.';
comment on column public.str_comparison_candidates.market_collected_at is
  'Collection time of the saved market snapshot used for this deterministic comparison.';

commit;
