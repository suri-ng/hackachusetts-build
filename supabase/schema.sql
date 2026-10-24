-- Sprout schema — tables, RLS, and storage access control (Task 2.1)
-- ---------------------------------------------------------------------------
-- Verified-impact escrow data layer. Schema follows design.md "Data Models".
--
-- Trust model (Req 4.5, 13.2): the client uses the anon key and may only READ
-- public campaign/feed data. ALL writes to campaign progress and submission
-- state flow exclusively through the server route handlers using the Supabase
-- service-role key, which bypasses RLS. By enabling RLS on every table and
-- granting NO write policies to anon/authenticated, the client is structurally
-- unable to mutate progress, submission state, coupon state, or phash records.
--
-- Requirements covered: 2.1, 2.4, 3.2, 6.2, 11.4, 13.2, 17.1, 18.4
-- ---------------------------------------------------------------------------

-- gen_random_uuid() lives in pgcrypto (available by default on Supabase).
create extension if not exists pgcrypto;

-- ===========================================================================
-- Tables
-- ===========================================================================

-- demo_user: single hardcoded student, no real login (Req 17.1)
create table if not exists demo_user (
  id             uuid primary key default gen_random_uuid(),
  display_name   text not null,
  verified_count int not null default 0,          -- drives first-coupon rule
  coupon_awarded boolean not null default false
);

-- sponsor campaign (Req 2.1, 2.4, 15.1)
create table if not exists campaign (
  id            uuid primary key default gen_random_uuid(),
  sponsor_name  text not null,
  pool          numeric not null,                                     -- seeded 500
  threshold     int not null,                                         -- seeded 100
  progress      int not null default 0,                              -- seeded 37
  milestones    int[] not null default '{25,50,75,100}',             -- Req 2.4
  pool_unlocked boolean not null default false
);

-- submission lifecycle state (Req 3.2, 3.4)
-- Guarded with a DO block so re-applying the schema does not error on the enum.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'submission_state') then
    create type submission_state as enum ('before_committed', 'complete');
  end if;
end $$;

-- submission (Req 3.2, 6.2, 12)
create table if not exists submission (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references demo_user(id),
  campaign_id     uuid references campaign(id),
  before_ref      text,                            -- storage path (before photo)
  after_ref       text,                            -- storage path (after photo)
  before_phash    text,
  after_phash     text,
  before_lat      double precision,
  before_lon      double precision,
  before_taken_at timestamptz,
  after_taken_at  timestamptz,
  state           submission_state not null default 'before_committed',
  committed_at    timestamptz not null default now(),  -- before-first timestamp (Req 3.2)
  verdict_pass    boolean,
  confidence      numeric,
  rationale       text,
  reasons         text[] not null default '{}',
  counted         boolean not null default false       -- idempotency guard (Req 12)
);

-- café coupon definition — seeded, non-redeemable (Req 11.4, 18.4)
create table if not exists cafe_coupon (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,                       -- e.g. "Free drip coffee with any purchase"
  cafe_name   text not null,
  redeemable  boolean not null default false       -- Req 11.4, 18.4: never real-redeemable
);

-- known perceptual hashes: seeded stock + prior-submission hashes (Req 6.2)
create table if not exists known_phash (
  id     uuid primary key default gen_random_uuid(),
  phash  text not null,
  source text not null                             -- 'seed_stock' | 'submission'
);

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
-- RLS is enabled on every table. The service-role key used by the server route
-- handlers bypasses RLS entirely, so it retains full read/write access without
-- any explicit policy. The policies below grant the anon/authenticated client
-- ONLY the reads it needs for Campaign Home / Impact; it is granted no insert,
-- update, or delete, so progress and submission state cannot be mutated from
-- the client (Req 4.5, 13.2).

alter table demo_user    enable row level security;
alter table campaign     enable row level security;
alter table submission   enable row level security;
alter table cafe_coupon  enable row level security;
alter table known_phash  enable row level security;

-- Make RLS intent explicit and idempotent on re-apply.
drop policy if exists campaign_client_read    on campaign;
drop policy if exists submission_client_read  on submission;
drop policy if exists cafe_coupon_client_read on cafe_coupon;
drop policy if exists demo_user_client_read   on demo_user;

-- Campaign Home reads pool/threshold/progress/milestones/pool_unlocked (Req 2.2).
create policy campaign_client_read
  on campaign
  for select
  to anon, authenticated
  using (true);

-- Latest-verified feed + Impact proof trail read completed submissions (Req 14).
-- Only rows already marked complete are exposed to the client; in-flight and
-- staged-fraud rows stay server-side.
create policy submission_client_read
  on submission
  for select
  to anon, authenticated
  using (state = 'complete');

-- Coupon card needs the seeded coupon definition (Req 11.2). Read-only.
create policy cafe_coupon_client_read
  on cafe_coupon
  for select
  to anon, authenticated
  using (true);

-- Demo user display name / verified count for the proof trail (Req 17.1).
create policy demo_user_client_read
  on demo_user
  for select
  to anon, authenticated
  using (true);

-- known_phash has intentionally NO client policy: the duplicate-detection seed
-- set is server-only (Req 6.2). With RLS on and no policy, anon/authenticated
-- get zero rows; the service role still reads/writes it freely.

-- NOTE: no insert/update/delete policies exist for anon/authenticated on any
-- table. Every write path — progress increment, submission state transitions,
-- coupon award, phash inserts — is reachable only via the service-role server
-- routes (Req 4.5, 13.2).

-- ===========================================================================
-- Storage bucket for before/after photos (Req 13.2)
-- ===========================================================================
-- A private bucket paired with signed upload URLs: the server issues a scoped,
-- time-limited signed URL from POST /api/upload-url (service role), and the
-- client uploads directly to that URL. Because the bucket is private and no
-- anon storage policy is granted, the client cannot list, read, or overwrite
-- objects outside the signed grant it was handed (Req 13.2, 13.3).

insert into storage.buckets (id, name, public)
values ('cleanup-photos', 'cleanup-photos', false)
on conflict (id) do update set public = excluded.public;

-- storage.objects already ships with RLS enabled on Supabase. We add no
-- anon/authenticated policies for the 'cleanup-photos' bucket, so all object
-- access goes through server-issued signed URLs (service role). Making the
-- absence explicit and idempotent:
drop policy if exists cleanup_photos_no_client_access on storage.objects;
