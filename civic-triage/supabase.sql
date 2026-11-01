-- Nagrik Sahayak: database schema (run once in Supabase → SQL Editor).
-- Readable tables for the Table Editor. Each row keeps the full record in `data` (jsonb, written by the server);
-- every other column is generated from it automatically, so the tables are always in sync.

-- 1. Remove the unused objects from the first setup (never used by the app). Only the OLD `reports`
--    table (uuid id) is dropped; the new one (text id) is never touched, so this file is safe to re-run.
drop function if exists find_nearby_reports(double precision, double precision, double precision, text);
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'reports' and column_name = 'id' and data_type = 'uuid') then
    drop table public.reports cascade;
  end if;
end $$;

-- 2. Tables
create table if not exists citizens (
  id          text primary key,
  phone       text generated always as (data->>'phone') stored,
  email       text generated always as (data->>'email') stored,
  state       text generated always as (data#>>'{path,1}') stored,
  district    text generated always as (data#>>'{path,2}') stored,
  city        text generated always as (data#>>'{path,3}') stored,
  locality    text generated always as (data#>>'{path,4}') stored,
  strikes     int  generated always as (coalesce((data->>'strikes')::int, 0)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  data        jsonb not null
);

create table if not exists authorities (
  id           text primary key,
  office       text generated always as (data->>'office') stored,
  level        text generated always as (case data->>'level' when '0' then 'National' when '1' then 'State' when '2' then 'District' when '3' then 'Local' end) stored,
  department   text generated always as (data->>'dept') stored,
  state        text generated always as (data#>>'{path,1}') stored,
  district     text generated always as (data#>>'{path,2}') stored,
  city         text generated always as (data#>>'{path,3}') stored,
  phone        text generated always as (data->>'phone') stored,
  email        text generated always as (data->>'email') stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  data         jsonb not null
);

create table if not exists reports (
  id               text primary key,
  status           text generated always as (data->>'status') stored,
  category         text generated always as (data->>'category') stored,
  severity         int  generated always as ((data->>'sev')::int) stored,
  caption          text generated always as (data->>'caption') stored,
  address          text generated always as (data->>'address') stored,
  lat              double precision generated always as ((data->>'lat')::double precision) stored,
  lng              double precision generated always as ((data->>'lng')::double precision) stored,
  location_source  text generated always as (data->>'locSource') stored,
  department       text generated always as (data->>'dept') stored,
  sla_days         int  generated always as ((data->>'slaDays')::int) stored,
  needs_review     boolean generated always as (coalesce((data->>'needsReview')::boolean, false)) stored,
  ai_confidence    numeric generated always as ((data#>>'{ai,confidence}')::numeric) stored,
  ai_reasoning     text generated always as (data#>>'{ai,reasoning}') stored,
  closure_claims   int  generated always as (coalesce((data->>'claims')::int, 0)) stored,
  verdict          text generated always as (data#>>'{verdict,result}') stored,
  verdict_reason   text generated always as (data#>>'{verdict,reason}') stored,
  photo_url        text generated always as (data#>>'{media,0,url}') stored,
  after_photo_url  text generated always as (data#>>'{afterMedia,0,url}') stored,
  reporter_id      text generated always as (data->>'user') stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  data             jsonb not null
);
create index if not exists reports_status_idx on reports (status);
create index if not exists reports_created_idx on reports (created_at desc);

create table if not exists notices (
  id          text primary key,
  kind        text generated always as (data->>'kind') stored,
  status      text generated always as (data->>'status') stored,
  message     text generated always as (data->>'text') stored,
  report_id   text generated always as (data->>'reportId') stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  data        jsonb not null
);

-- 3. Only the server (service role key) can read or write. No public access.
alter table citizens enable row level security;
alter table authorities enable row level security;
alter table reports enable row level security;
alter table notices enable row level security;

-- 4. Copy anything already saved in the old app_docs table (safe to run more than once)
do $$
begin
  if to_regclass('public.app_docs') is not null then
    insert into citizens (id, data, created_at)
      select data->>'id', data, to_timestamp((data->>'createdAt')::double precision / 1000) from app_docs
      where kind = 'user' and data->>'role' = 'citizen' on conflict (id) do nothing;
    insert into authorities (id, data, created_at)
      select data->>'id', data, to_timestamp((data->>'createdAt')::double precision / 1000) from app_docs
      where kind = 'user' and data->>'role' = 'authority' on conflict (id) do nothing;
    insert into reports (id, data, created_at)
      select data->>'id', data, to_timestamp((data->>'createdAt')::double precision / 1000) from app_docs
      where kind = 'report' on conflict (id) do nothing;
    insert into notices (id, data, created_at)
      select data->>'id', data, to_timestamp((data->>'t')::double precision / 1000) from app_docs
      where kind = 'notice' on conflict (id) do nothing;
  end if;
end $$;
-- After checking the new tables, the old table can be removed with:  drop table app_docs;
