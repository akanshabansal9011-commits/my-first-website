create table if not exists public.worksheets (
  id text primary key,
  title text not null,
  subject text not null,
  class_name text not null,
  level text not null check (level in ('Easy', 'Medium', 'Complex')),
  topic text,
  description text,
  pdf_url text not null,
  thumbnail_url text,
  published_date date not null,
  status text not null default 'Draft' check (status in ('Draft', 'Published', 'Archived')),
  featured boolean not null default false,
  tags text[] not null default '{}',
  source text not null default 'google-sheets',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worksheet_sync_logs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  processed_count integer not null default 0,
  inserted_or_updated_count integer not null default 0,
  archived_count integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create index if not exists worksheets_published_listing_idx on public.worksheets (status, published_date desc, id);
create index if not exists worksheets_class_listing_idx on public.worksheets (status, class_name, published_date desc, id);
create index if not exists worksheets_subject_listing_idx on public.worksheets (status, subject, published_date desc, id);
create index if not exists worksheets_level_listing_idx on public.worksheets (status, level, published_date desc, id);
create index if not exists worksheets_filters_listing_idx on public.worksheets (status, class_name, subject, level, published_date desc, id);

alter table public.worksheets enable row level security;
alter table public.worksheet_sync_logs enable row level security;
-- The public site accesses worksheets only through the Edge Function using the service-role key.
