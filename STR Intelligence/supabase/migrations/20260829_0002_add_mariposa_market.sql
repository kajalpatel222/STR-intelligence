begin;

insert into public.markets (name, state, zip_code, county, default_lookback_days, max_lookback_days, run_day_of_week)
values ('Mariposa', 'CA', '95338', 'Mariposa County', 7, 30, 6)
on conflict (name, state, zip_code, county) do nothing;

commit;
