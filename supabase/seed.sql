-- Canonical hackathon data reset. Apply only to a demo/staging Supabase project.
-- Run `npm run seed` afterward (or instead) to upload matching evidence assets.

begin;

truncate table submission, campaign, demo_user, cafe_coupon, known_phash
  restart identity cascade;

insert into demo_user (
  id, display_name, first_name, initials, verified_count,
  points_balance, actions_completed, coupon_awarded
)
values (
  '00000000-0000-0000-0000-0000000000a1',
  'Alex Morgan',
  'Alex',
  'AM',
  0,
  1240,
  8,
  false
);

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
);

insert into cafe_coupon (id, title, cafe_name, detail, code, redeemable)
values (
  '00000000-0000-0000-0000-0000000000f1',
  'Free drip coffee',
  'Common Grounds Café',
  'with any purchase',
  'SPROUT-DEMO',
  false
);

-- `npm run seed` computes the true hash for the checked-in fixture and updates
-- this row. The literal keeps SQL-only resets deterministic.
insert into known_phash (id, phash, source)
values (
  '00000000-0000-0000-0000-0000000000d1',
  'ffff0f0f3f7fffff',
  'seed_stock'
);

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
