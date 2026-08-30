update public.investment_criteria_profiles
set minimum_purchase_budget_usd = 0,
    updated_at = now()
where profile_key = 'default';
