create table if not exists public.str_market_collections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'airbtics'),
  label text not null,
  gateway text not null check (gateway in ('arch_rock', 'big_oak_flat', 'south')),
  boundary_definition jsonb not null,
  page_number integer not null check (page_number > 0),
  provider_total_count integer not null check (provider_total_count >= 0),
  saved_count integer not null check (saved_count >= 0),
  status text not null check (status in ('complete', 'failed')),
  raw_payload jsonb not null,
  collected_at timestamptz not null default now()
);

create table if not exists public.str_market_listing_snapshots (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.str_market_collections(id) on delete cascade,
  listing_url text not null,
  name text not null,
  gateway text not null check (gateway in ('arch_rock', 'big_oak_flat', 'south')),
  property_type text, room_type text, bedrooms text, bathrooms numeric, accommodates integer,
  adr_usd numeric, occupancy_percent numeric, annual_revenue_usd numeric, revenue_potential_usd numeric,
  bookings_ltm integer, active_days_ltm integer, rating_percent numeric, review_count integer,
  cleaning_fee_usd numeric, minimum_nights integer, image_url text, amenities jsonb not null default '{}'::jsonb,
  last_seen timestamptz, collected_at timestamptz not null,
  unique (collection_id, listing_url)
);

create index if not exists str_market_listing_snapshots_collection_idx on public.str_market_listing_snapshots(collection_id);
alter table public.str_market_collections enable row level security;
alter table public.str_market_listing_snapshots enable row level security;

comment on table public.str_market_collections is 'Server-only audit records for paid STR market collections.';
comment on table public.str_market_listing_snapshots is 'Immutable provider snapshots; browser access is only through narrow server DTOs.';
