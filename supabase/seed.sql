-- Sprout resettable seed (Task 2.3)
-- ---------------------------------------------------------------------------
-- Establishes the canonical demo starting state and resets it on every run so
-- that a second (or hundredth) execution yields byte-identical rows (Req 15.5).
--
-- Re-runnability strategy: fixed UUIDs for every seeded row + a single
-- TRUNCATE ... RESTART IDENTITY CASCADE of the demo tables, followed by plain
-- INSERTs of the fixed starting values. TRUNCATE (rather than DELETE) resets
-- any identity state and CASCADE clears submission's FK children in one pass;
-- because every inserted value is a literal constant (no now(), no random()),
-- the resulting state is deterministic and identical across runs.
--
-- Seeded contents (all per design.md "Seed script — resettable"):
--   * campaign      : pool 500, threshold 100, progress 37, pool_unlocked=false (Req 15.1)
--   * submission #1 : state 'before_committed' so the demo starts mid-flow      (Req 15.2)
--   * submission #2 : staged fraud — reused photo (phash also in known_phash)
--                     AND geo coords outside the mission area, so the pipeline
--                     rejects it with BOTH duplicate_photo and out_of_area      (Req 15.3, 16.1)
--   * cafe_coupon   : definition with redeemable=false                          (Req 15.4)
--   * demo_user     : verified_count=0, coupon_awarded=false
--
-- NOTE: applying this requires a provisioned Supabase/Postgres project with
-- schema.sql already applied (Task 2.1 defines the tables, the
-- submission_state enum, and the storage bucket this seed references).
--
-- Requirements covered: 15.1, 15.2, 15.3, 15.4, 15.5
-- ---------------------------------------------------------------------------

-- Canonical mission area (referenced by the comments below and by lib/geotime
-- at verify time): Boston Common, approx. (42.3551, -71.0657), radius ~300 m.
-- The before_committed submission sits inside this area; the staged-fraud
-- submission is placed in Los Angeles, far outside it, to force out_of_area.

begin;

-- ---------------------------------------------------------------------------
-- 1. Reset: wipe the demo tables so re-runs start from a clean slate.
--    CASCADE clears submission rows that reference demo_user/campaign; listing
--    submission explicitly keeps intent obvious. RESTART IDENTITY is harmless
--    here (all PKs are uuid) but makes the reset total and future-proof.
-- ---------------------------------------------------------------------------
truncate table submission, campaign, demo_user, cafe_coupon, known_phash
  restart identity cascade;

-- ---------------------------------------------------------------------------
-- 2. demo_user — single hardcoded student, pre-first-cleanup (Req 17.1)
--    verified_count 0 + coupon_awarded false so the first live pass awards the
--    café coupon exactly once (Req 11.1/11.3).
-- ---------------------------------------------------------------------------
insert into demo_user (id, display_name, verified_count, coupon_awarded)
values (
  '00000000-0000-0000-0000-0000000000a1',
  'Alex (Demo Student)',
  0,
  false
);

-- ---------------------------------------------------------------------------
-- 3. campaign — seeded sponsor pledge (Req 15.1)
--    pool 500 / threshold 100 / progress 37, locked. milestones default to
--    {25,50,75,100} from schema.sql but are set explicitly for a deterministic,
--    self-contained seed.
-- ---------------------------------------------------------------------------
insert into campaign (id, sponsor_name, pool, threshold, progress, milestones, pool_unlocked)
values (
  '00000000-0000-0000-0000-0000000000c1',
  'GreenLeaf Co.',
  500,
  100,
  37,
  '{25,50,75,100}',
  false
);

-- ---------------------------------------------------------------------------
-- 4. cafe_coupon — seeded, non-redeemable definition (Req 15.4, 11.4, 18.4)
-- ---------------------------------------------------------------------------
insert into cafe_coupon (id, title, cafe_name, redeemable)
values (
  '00000000-0000-0000-0000-0000000000f1',
  'Free drip coffee with any purchase',
  'Common Grounds Cafe',
  false
);

-- ---------------------------------------------------------------------------
-- 5. known_phash — seeded stock hash used by the staged-fraud submission.
--    The staged-fraud submission's before_phash/after_phash equal this value,
--    so the live pHash_Check finds a match and sets the duplicate flag (Req 6.2,
--    16.1). 64-bit aHash/dHash rendered as 16 hex chars (matches lib/phash).
-- ---------------------------------------------------------------------------
insert into known_phash (id, phash, source)
values (
  '00000000-0000-0000-0000-0000000000d1',
  'ffff0f0f3f7fffff',
  'seed_stock'
);

-- ---------------------------------------------------------------------------
-- 6. submission #1 — in-flow starter, state 'before_committed' (Req 15.2)
--    Demo opens mid-flow: a before photo is already committed, so the Verify
--    screen lands on State B (upload the after photo). Coords sit inside the
--    mission area (Boston Common) so a legit after-upload can pass live (Req 16.3).
--    committed_at is a fixed literal so re-runs are identical (not now()).
-- ---------------------------------------------------------------------------
insert into submission (
  id, user_id, campaign_id,
  before_ref, after_ref,
  before_phash, after_phash,
  before_lat, before_lon,
  before_taken_at, after_taken_at,
  state, committed_at,
  verdict_pass, confidence, rationale, reasons, counted
)
values (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000c1',
  'cleanup-photos/seed/before_committed_before.jpg',
  null,                                   -- after not uploaded yet (State B pending)
  '0f1f3f7fff7f3f1f',                     -- unique hash, NOT in known_phash
  null,
  42.3551, -71.0657,                      -- inside mission area (Boston Common)
  '2024-05-01T14:00:00Z', null,
  'before_committed',
  '2024-05-01T14:00:00Z',                 -- fixed commit timestamp (deterministic)
  null, null, null, '{}', false
);

-- ---------------------------------------------------------------------------
-- 7. submission #2 — staged fraud (Req 15.3, 16.1)
--    Two independent integrity failures so the stage demo shows BOTH reasons:
--      (a) reused photo  : before/after phash == the seeded known_phash stock
--                          hash => duplicate_photo
--      (b) out of area   : coords in Los Angeles, ~4,100 km from Boston Common
--                          => out_of_area
--    Left in 'before_committed' so it can be pushed through /api/verify live;
--    the pipeline, not the seed, produces the reject + reasons. before_taken_at
--    / after_taken_at are plausible but the geo + duplicate signals are what
--    drive the rejection.
-- ---------------------------------------------------------------------------
insert into submission (
  id, user_id, campaign_id,
  before_ref, after_ref,
  before_phash, after_phash,
  before_lat, before_lon,
  before_taken_at, after_taken_at,
  state, committed_at,
  verdict_pass, confidence, rationale, reasons, counted
)
values (
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000c1',
  'cleanup-photos/seed/staged_fraud_stock.jpg',
  'cleanup-photos/seed/staged_fraud_stock.jpg',  -- same stock image reused
  'ffff0f0f3f7fffff',                     -- == known_phash stock hash => duplicate
  'ffff0f0f3f7fffff',
  34.0522, -118.2437,                     -- Los Angeles: far outside mission area
  '2024-05-01T15:00:00Z', '2024-05-01T15:10:00Z',
  'before_committed',
  '2024-05-01T15:00:00Z',                 -- fixed commit timestamp (deterministic)
  null, null, null, '{}', false
);

commit;
