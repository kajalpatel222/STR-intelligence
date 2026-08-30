create table if not exists public.listing_reviews (
  canonical_property_id uuid primary key references public.canonical_properties(id) on delete cascade,
  decision text not null check (decision in ('promote', 'hold', 'dismiss')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listing_reviews enable row level security;

comment on table public.listing_reviews is
  'Current single-user manual decision per property; server service-role access only until authentication exists.';
