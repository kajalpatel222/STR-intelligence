begin;

alter table public.str_market_listing_snapshots
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7);

alter table public.str_market_listing_snapshots
  add constraint str_market_listing_snapshots_latitude_range
    check (latitude is null or latitude between -90 and 90),
  add constraint str_market_listing_snapshots_longitude_range
    check (longitude is null or longitude between -180 and 180),
  add constraint str_market_listing_snapshots_coordinate_pair
    check ((latitude is null) = (longitude is null));

create index if not exists str_market_listing_snapshots_coordinates_idx
  on public.str_market_listing_snapshots (latitude, longitude)
  where latitude is not null and longitude is not null;

comment on column public.str_market_listing_snapshots.latitude is
  'Provider-observed Airbnb listing latitude retained for deterministic spatial matching.';
comment on column public.str_market_listing_snapshots.longitude is
  'Provider-observed Airbnb listing longitude retained for deterministic spatial matching.';

commit;
