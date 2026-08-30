create table if not exists public.investment_criteria_profiles (
  profile_key text primary key check (profile_key = 'default'),
  minimum_purchase_budget_usd numeric not null check (minimum_purchase_budget_usd >= 0),
  maximum_purchase_budget_usd numeric not null check (maximum_purchase_budget_usd >= minimum_purchase_budget_usd),
  maximum_improvement_reserve_usd numeric not null check (maximum_improvement_reserve_usd >= 0),
  mode text not null check (mode in ('strict', 'flexible')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.investment_criteria_profiles is
  'Server-managed singleton investment criteria defaults; replace profile_key with user_id after authentication is introduced.';

alter table public.investment_criteria_profiles enable row level security;

-- No browser policy is intentional: only the Node service-role boundary may read or write defaults.
insert into public.investment_criteria_profiles (
  profile_key,
  minimum_purchase_budget_usd,
  maximum_purchase_budget_usd,
  maximum_improvement_reserve_usd,
  mode
) values ('default', 350000, 400000, 40000, 'flexible')
on conflict (profile_key) do nothing;
