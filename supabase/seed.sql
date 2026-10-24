-- Canonical hackathon data reset. Apply only to a demo/staging Supabase project.
-- It resets only fixed seed rows and preserves authenticated profiles/submissions.
-- Run `npm run seed` afterward (or instead) to upload matching evidence assets.

begin;

delete from submission
where id in (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000b2'
) or user_id = '00000000-0000-0000-0000-0000000000a1';
delete from known_phash where source = 'seed_stock';
delete from demo_user where id = '00000000-0000-0000-0000-0000000000a1';

insert into demo_user (
  id, username, auth_user_id, display_name, first_name, initials, verified_count,
  points_balance, actions_completed, coupon_awarded
)
values (
  '00000000-0000-0000-0000-0000000000a1',
  'alex',
  null,
  'Alex Morgan',
  'Alex',
  'AM',
  0,
  1240,
  8,
  false
)
on conflict (id) do update set
  username = excluded.username,
  auth_user_id = excluded.auth_user_id,
  display_name = excluded.display_name,
  first_name = excluded.first_name,
  initials = excluded.initials,
  verified_count = excluded.verified_count,
  points_balance = excluded.points_balance,
  actions_completed = excluded.actions_completed,
  coupon_awarded = excluded.coupon_awarded;

insert into campaign (
  id, sponsor_name, sponsor_mark, sponsor_label, title, location,
  pool, threshold, progress, milestones, pool_unlocked,
  base_points, points_multiplier, ends_label,
  mission_lat, mission_lon, mission_radius_meters
)
values (
  '00000000-0000-0000-0000-0000000000c1',
  'MASSPIRG',
  'MP',
  'Illustrative sponsor campaign',
  'Clean Amherst Common',
  'Amherst Common · Amherst, MA',
  500,
  100,
  37,
  '{25,50,75,100}',
  false,
  80,
  2,
  'Weekend boost · 2 days left',
  42.375,
  -72.5199,
  1200
)
on conflict (id) do update set
  sponsor_name = excluded.sponsor_name,
  sponsor_mark = excluded.sponsor_mark,
  sponsor_label = excluded.sponsor_label,
  title = excluded.title,
  location = excluded.location,
  pool = excluded.pool,
  threshold = excluded.threshold,
  progress = excluded.progress,
  milestones = excluded.milestones,
  pool_unlocked = excluded.pool_unlocked,
  base_points = excluded.base_points,
  points_multiplier = excluded.points_multiplier,
  ends_label = excluded.ends_label,
  mission_lat = excluded.mission_lat,
  mission_lon = excluded.mission_lon,
  mission_radius_meters = excluded.mission_radius_meters;

insert into cafe_coupon (id, title, cafe_name, detail, code, redeemable)
values (
  '00000000-0000-0000-0000-0000000000f1',
  'Free drip coffee',
  'Common Grounds Café',
  'with any purchase',
  'SPROUT-DEMO',
  false
)
on conflict (id) do update set
  title = excluded.title,
  cafe_name = excluded.cafe_name,
  detail = excluded.detail,
  code = excluded.code,
  redeemable = excluded.redeemable;

-- `npm run seed` computes the true hash for the checked-in fixture and updates
-- this row. The literal keeps SQL-only resets deterministic.
insert into known_phash (id, phash, source)
values (
  '00000000-0000-0000-0000-0000000000d1',
  'ffff0f0f3f7fffff',
  'seed_stock'
)
on conflict (id) do update set
  phash = excluded.phash,
  source = excluded.source;

insert into submission (
  id, user_id, campaign_id, before_ref, state, committed_at, counted
)
values (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000c1',
  'seed/amherst-before.png',
  'before_committed',
  now(),
  false
);

insert into submission (
  id, user_id, campaign_id, before_ref, after_ref,
  before_phash, after_phash, before_lat, before_lon, after_lat, after_lon,
  state, committed_at, counted
)
values (
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000c1',
  'seed/staged-fraud.png',
  'seed/staged-fraud.png',
  'ffff0f0f3f7fffff',
  'ffff0f0f3f7fffff',
  34.0522,
  -118.2437,
  34.0522,
  -118.2437,
  'before_committed',
  now(),
  false
);

commit;
