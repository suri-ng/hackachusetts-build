-- Sprout Supabase schema. Safe to apply more than once.
-- Runtime writes use the server-only service-role client; no private evidence is
-- directly readable or writable by anon/authenticated clients.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'submission_state') then
    create type submission_state as enum ('before_committed', 'complete');
  end if;
end $$;

create table if not exists demo_user (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid unique references auth.users(id) on delete set null,
  username         text constraint demo_user_username_format_check
                     check (username is null or username ~ '^[a-z0-9_]{3,24}$'),
  display_name     text not null,
  first_name       text not null default 'Alex',
  initials         text not null default 'AM',
  verified_count   int not null default 0 check (verified_count >= 0),
  points_balance   int not null default 0 check (points_balance >= 0),
  actions_completed int not null default 0 check (actions_completed >= 0),
  coupon_awarded   boolean not null default false
);

create table if not exists campaign (
  id                     uuid primary key default gen_random_uuid(),
  sponsor_name           text not null,
  sponsor_mark           text not null default 'SP',
  sponsor_label          text not null default 'Illustrative sponsor campaign',
  title                  text not null default 'Community cleanup',
  location               text not null default 'Amherst, MA',
  pool                   numeric not null check (pool >= 0),
  threshold              int not null check (threshold > 0),
  progress               int not null default 0 check (progress >= 0),
  milestones             int[] not null default '{25,50,75,100}',
  pool_unlocked          boolean not null default false,
  base_points            int not null default 80 check (base_points >= 0),
  points_multiplier      numeric not null default 1 check (points_multiplier >= 0),
  ends_label             text not null default 'Limited-time boost',
  mission_lat            double precision not null default 42.375 check (mission_lat between -90 and 90),
  mission_lon            double precision not null default -72.5199 check (mission_lon between -180 and 180),
  mission_radius_meters  int not null default 1200 check (mission_radius_meters > 0)
);

create table if not exists submission (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references demo_user(id),
  campaign_id      uuid not null references campaign(id),
  before_ref       text not null,
  after_ref        text,
  before_phash     text,
  after_phash      text,
  before_lat       double precision,
  before_lon       double precision,
  after_lat        double precision,
  after_lon        double precision,
  before_taken_at  timestamptz,
  after_taken_at   timestamptz,
  state            submission_state not null default 'before_committed',
  committed_at     timestamptz not null default now(),
  completed_at     timestamptz,
  verdict_pass     boolean,
  confidence       numeric check (confidence is null or confidence between 0 and 1),
  rationale        text,
  reasons          text[] not null default '{}',
  assessor_source  text check (assessor_source is null or assessor_source in ('claude', 'seeded')),
  points_awarded   int not null default 0 check (points_awarded >= 0),
  counted          boolean not null default false
);

create table if not exists cafe_coupon (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  cafe_name   text not null,
  detail      text not null default 'with any purchase',
  code        text not null default 'SPROUT-DEMO',
  redeemable  boolean not null default false
);

create table if not exists known_phash (
  id     uuid primary key default gen_random_uuid(),
  phash  text not null,
  source text not null
);

-- Upgrade an older Sprout schema in place.
alter table demo_user add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table demo_user add column if not exists username text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demo_user_username_format_check'
  ) then
    alter table demo_user add constraint demo_user_username_format_check
      check (username is null or username ~ '^[a-z0-9_]{3,24}$');
  end if;
end $$;
alter table demo_user add column if not exists first_name text not null default 'Alex';
alter table demo_user add column if not exists initials text not null default 'AM';
alter table demo_user add column if not exists points_balance int not null default 0;
alter table demo_user add column if not exists actions_completed int not null default 0;

alter table campaign add column if not exists sponsor_mark text not null default 'SP';
alter table campaign add column if not exists sponsor_label text not null default 'Illustrative sponsor campaign';
alter table campaign add column if not exists title text not null default 'Community cleanup';
alter table campaign add column if not exists location text not null default 'Amherst, MA';
alter table campaign add column if not exists base_points int not null default 80;
alter table campaign add column if not exists points_multiplier numeric not null default 1;
alter table campaign add column if not exists ends_label text not null default 'Limited-time boost';
alter table campaign add column if not exists mission_lat double precision not null default 42.375;
alter table campaign add column if not exists mission_lon double precision not null default -72.5199;
alter table campaign add column if not exists mission_radius_meters int not null default 1200;

alter table submission add column if not exists after_lat double precision;
alter table submission add column if not exists after_lon double precision;
alter table submission add column if not exists completed_at timestamptz;
alter table submission add column if not exists assessor_source text;
alter table submission add column if not exists points_awarded int not null default 0;

alter table cafe_coupon add column if not exists detail text not null default 'with any purchase';
alter table cafe_coupon add column if not exists code text not null default 'SPROUT-DEMO';

create unique index if not exists demo_user_auth_user_idx
  on demo_user (auth_user_id)
  where auth_user_id is not null;
create unique index if not exists demo_user_username_idx
  on demo_user (username)
  where username is not null;
create unique index if not exists known_phash_value_idx on known_phash (phash);
create index if not exists submission_campaign_completed_idx
  on submission (campaign_id, completed_at desc)
  where state = 'complete' and verdict_pass = true;
create index if not exists submission_user_pending_idx
  on submission (user_id, committed_at desc)
  where state = 'before_committed';

-- Supabase Auth owns credentials. This trigger creates the matching Sprout
-- profile and rejects unvalidated usernames even when Auth is called directly.
create or replace function public.handle_new_sprout_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_display_name text;
begin
  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'invalid_sprout_username';
  end if;

  v_display_name := initcap(replace(v_username, '_', ' '));
  insert into public.demo_user (
    id,
    auth_user_id,
    username,
    display_name,
    first_name,
    initials,
    verified_count,
    points_balance,
    actions_completed,
    coupon_awarded
  )
  values (
    new.id,
    new.id,
    v_username,
    v_display_name,
    split_part(v_display_name, ' ', 1),
    upper(left(replace(v_username, '_', ''), 2)),
    0,
    0,
    0,
    false
  )
  on conflict (id) do update set
    auth_user_id = excluded.auth_user_id,
    username = excluded.username,
    display_name = excluded.display_name,
    first_name = excluded.first_name,
    initials = excluded.initials;

  return new;
end;
$$;

revoke all on function public.handle_new_sprout_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_sprout_user();

alter table demo_user enable row level security;
alter table campaign enable row level security;
alter table submission enable row level security;
alter table cafe_coupon enable row level security;
alter table known_phash enable row level security;

-- Remove legacy broad client-read policies. Sanitized reads go through
-- GET /api/campaign; private refs, EXIF, and model output stay server-side.
drop policy if exists campaign_client_read on campaign;
drop policy if exists submission_client_read on submission;
drop policy if exists cafe_coupon_client_read on cafe_coupon;
drop policy if exists demo_user_client_read on demo_user;
revoke all on table demo_user, campaign, submission, cafe_coupon, known_phash
  from anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'cleanup-photos',
  'cleanup-photos',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are added: all uploads/downloads use the
-- server-only service-role client and the bucket remains private.
