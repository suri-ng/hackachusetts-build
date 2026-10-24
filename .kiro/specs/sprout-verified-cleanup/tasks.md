# Implementation Plan: Sprout — Verified-Impact Cleanup

## Overview

This plan recreates the deleted Next.js/TypeScript scaffold, builds the pure `lib/` verification core with Vitest coverage, wires the single server-enforced `POST /api/verify` pipeline in the exact §9a order, stands up the resettable Supabase schema/seed, and ships the screens in demo-priority order (Campaign Home first, Impact last/optional).

Tasks are ordered so an end-to-end demoable slice — scaffold → data → pure core → `/api/verify` → Campaign Home + Verify — comes together before any optional polish. The implementation language is TypeScript (from the design). Per the degrade-gracefully order, the EXIF/geo soft-signal is the first capability to soften and the Impact screen is the first to cut; tasks for both are explicitly marked so the team knows what is droppable without breaking the hero moment (the funded-bar animation, never cut).

## Tasks

- [x] 1. Recreate the Next.js / TypeScript / Supabase / Vitest scaffold
  - Create `package.json` with scripts `dev`, `build`, `test`, `seed` and deps (next, react, typescript, @anthropic-ai/sdk, @supabase/supabase-js, sharp, exifr, vitest)
  - Create `next.config.mjs`, `tsconfig.json` (strict), `vitest.config.ts` (node + jsdom projects), `vitest.setup.ts`
  - Create `.env.local.example` with `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, unprefixed) and `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-visible)
  - Create empty `app/` route skeletons (`/`, `/mission`, `/verify`, `/impact`) and `app/api/` route handler stubs (`upload-url`, `verify`, `campaign`)
  - Create `lib/` module skeletons (`verdict.ts`, `phash.ts`, `geotime.ts`, `claude.ts`, `pipeline.ts`) and `supabase/` file skeletons (`schema.sql`, `functions.sql`, `seed.sql`)
  - Verify `npm run build` and `npm test` run on the empty scaffold
  - _Requirements: 13.1_

- [x] 2. Supabase data layer: schema, RLS, storage, atomic increment, resettable seed
  - [x] 2.1 Write `supabase/schema.sql` with tables and RLS
    - Create `demo_user`, `campaign` (with `milestones '{25,50,75,100}'`), `submission` (+ `submission_state` enum, `committed_at`, `counted` guard), `cafe_coupon`, `known_phash`
    - Enable RLS on all tables; restrict `campaign`/`submission` state writes to the service-role server path; configure storage bucket + signed-upload access control
    - _Requirements: 2.1, 2.4, 3.2, 6.2, 11.4, 13.2, 17.1, 18.4_

  - [x] 2.2 Write `supabase/functions.sql` with `increment_progress(p_submission_id)`
    - Single conditional `UPDATE submission SET counted=true WHERE id=? AND counted=false`; on no-row return current state unchanged; else bump `campaign.progress` and set `pool_unlocked = (progress+1) >= threshold` in the same statement
    - _Requirements: 10.3, 12.1, 12.2_

  - [x] 2.3 Write resettable `supabase/seed.sql`
    - Campaign pool 500 / threshold 100 / progress 37, `pool_unlocked=false`; one `before_committed` submission (demo starts mid-flow); one staged-fraud submission (phash in `known_phash` + out-of-area coords); `cafe_coupon` with `redeemable=false`; `demo_user` `verified_count=0`, `coupon_awarded=false`
    - Make it re-runnable (truncate/upsert canonical rows) so a second run yields identical state
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 2.4 Write property test for atomic idempotent increment
    - **Property 21: The progress increment is atomic and idempotent**
    - **Validates: Requirements 12.1, 12.2**
    - Drive repeated and concurrent calls for one submission id against the SQL function (or a faithful in-memory model); assert net delta of exactly one

  - [ ]* 2.5 Write property test for pool-unlocked threshold crossing
    - **Property 19: Reaching the threshold enters the pool-unlocked state**
    - **Validates: Requirements 10.3**

  - [ ]* 2.6 Write property test for seed-reset idempotence
    - **Property 22: Re-running the seed script resets to the canonical starting state**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5**

- [ ] 3. Implement the pure verdict core (`lib/verdict.ts`)
  - [ ] 3.1 Implement `compositeVerdict`, `unlockedValue`, `fillRatio`, `nextMilestone`
    - `duplicateFlag` → immediate reject reason `"duplicate_photo"`; else `score = claudeConfidence*wC + geoScore*wG + timeScore*wT` (weights sum to 1, `wC` dominant); pass when `claudeConfidence >= claudeMin` AND `score >= passThreshold`; collect reasons `"low_confidence"` / `"out_of_area"` / `"time_mismatch"`; geo/time are soft and cannot alone reject
    - _Requirements: 1.1, 2.2, 2.3, 2.5, 4.4, 4.5, 6.2, 16.1_

  - [ ]* 3.2 Write property test for unlocked value
    - **Property 1: Unlocked value tracks the pool fraction**
    - **Validates: Requirements 1.1, 2.2**

  - [ ]* 3.3 Write property test for funded-bar fill ratio
    - **Property 4: Funded-bar fill is proportional and bounded**
    - **Validates: Requirements 2.3**

  - [ ]* 3.4 Write property test for next milestone
    - **Property 5: Next milestone is the least marker above progress**
    - **Validates: Requirements 2.5**

  - [ ]* 3.5 Write property test for rejection reasons
    - **Property 9: Rejections return their contributing reasons**
    - **Validates: Requirements 4.4, 16.1**

- [ ] 4. Implement the pure anti-fraud signal core (`lib/phash.ts`, `lib/geotime.ts`, `lib/claude.ts`)
  - [ ] 4.1 Implement `lib/phash.ts` — `perceptualHash`, `hammingDistance`, `isDuplicate`
    - sharp-normalized hash; Hamming-distance match against `known_phash` + prior submissions within `maxDistance`
    - _Requirements: 6.1, 6.2_

  - [ ]* 4.2 Write property test for duplicate detection
    - **Property 13: Duplicate photos set the flag and reject**
    - **Validates: Requirements 6.1, 6.2**

  - [ ] 4.3 Implement `lib/geotime.ts` — `extractExif`, `geoTimeScore` (SOFTEN-FIRST capability)
    - exifr extraction (absent fields → undefined); score from GPS proximity to mission area + before/after timestamp proximity; missing EXIF → neutral/lowered score, never auto-reject; monotonic in proximity
    - NOTE (degrade-gracefully #1): if time runs short, stub `geoTimeScore` to a neutral 0.5 with the pipeline shape intact — this is the FIRST capability to soften
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 4.4 Write property test for EXIF round-trip
    - **Property 14: EXIF extraction round-trips embedded metadata**
    - **Validates: Requirements 7.1**

  - [ ]* 4.5 Write property test for geo/time monotonicity
    - **Property 15: Geo/time score is monotonic in proximity**
    - **Validates: Requirements 7.2**

  - [ ]* 4.6 Write property test for missing-EXIF soft behavior
    - **Property 16: Missing EXIF lowers the score without auto-rejecting**
    - **Validates: Requirements 7.3**

  - [ ] 4.7 Implement `lib/claude.ts` — `assessWithClaude` with seeded fallback
    - Server-side multimodal call submitting before+after together; return `{confidence, rationale}`; on error OR timeout return a deterministic seeded fallback so the pipeline always completes
    - _Requirements: 8.1, 8.2, 8.3, 13.1_

  - [ ]* 4.8 Write property test for Claude fallback
    - **Property 17: Claude failure falls back to a seeded verdict**
    - **Validates: Requirements 8.3**

- [ ] 5. Implement the verification pipeline orchestration (`lib/pipeline.ts`)
  - [ ] 5.1 Implement `runVerification` in the fixed §9a order
    - Order: input validation (type/size + rate limit, fail-fast) → pHash → EXIF/geo/time → Claude → `compositeVerdict`; on PASS: `increment_progress` → threshold check → pool-unlocked update → first-cleanup coupon award (at-most-once) → set `submission.state = complete`; on REJECT: return reasons, progress untouched; respond with confidence + rationale on BOTH outcomes
    - _Requirements: 3.4, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 8.2, 9.1, 9.2, 10.3, 11.1, 11.3, 12.1, 12.2, 13.3, 16.2_

  - [ ]* 5.2 Write property test for fixed step/action order
    - **Property 8: The pipeline executes its steps in the fixed order**
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 5.3 Write property test for server-authoritative verdict
    - **Property 10: The verdict is server-authoritative**
    - **Validates: Requirements 4.5**

  - [ ]* 5.4 Write property test for validation gate ordering
    - **Property 11: Invalid uploads are rejected before any downstream work**
    - **Validates: Requirements 5.1, 5.2, 13.3**

  - [ ]* 5.5 Write property test for rate limiting
    - **Property 12: Requests beyond the rate limit are rejected**
    - **Validates: Requirements 5.3**

  - [ ]* 5.6 Write property test for pass incrementing by exactly one
    - **Property 2: A pass increments progress by exactly one unit**
    - **Validates: Requirements 1.2, 1.4, 10.2**

  - [ ]* 5.7 Write property test for reject leaving progress unchanged
    - **Property 3: A reject leaves progress unchanged**
    - **Validates: Requirements 1.3, 9.2, 16.2**

  - [ ]* 5.8 Write property test for confidence + rationale on both outcomes
    - **Property 18: Confidence and rationale are returned on both outcomes**
    - **Validates: Requirements 8.2, 9.1**

  - [ ]* 5.9 Write property test for coupon awarded exactly once
    - **Property 20: The café coupon is awarded exactly once, on the first verified cleanup**
    - **Validates: Requirements 11.1, 11.3**

- [ ] 6. Checkpoint — pure core and data layer verified
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement the API route handlers (`app/api/`)
  - [ ] 7.1 Implement `POST /api/upload-url`
    - Validate intended file type/size, return a Supabase signed upload URL
    - _Requirements: 13.2, 13.3_

  - [ ] 7.2 Implement `POST /api/verify` and State A before-commit handling
    - `/api/verify` calls `runVerification` for an existing `before_committed` submission (State B); before-commit (State A) creates a `before_committed` submission with commit timestamp and does NOT call `/api/verify`; after-upload with no committed before is rejected with a prompt
    - _Requirements: 3.2, 3.4, 3.5, 4.1_

  - [ ] 7.3 Implement `GET /api/campaign`
    - Return campaign state (pool/threshold/progress/pool_unlocked/milestones) + latest-verified feed for Home/Impact
    - _Requirements: 2.2, 17.2, 17.3_

  - [ ]* 7.4 Write example/integration tests for before-commit state and routes
    - **Property 6: Before-commit yields a timestamped before_committed submission** (Validates 3.2)
    - **Property 7: After-upload on a passing before_committed submission completes it** (Validates 3.4)
    - After-upload-with-no-committed-before guard (3.5); `/api/verify` route exists (4.1); signed-URL + RLS smoke (13.2)
    - _Requirements: 3.2, 3.4, 3.5, 4.1, 13.2_

- [ ] 8. Build Campaign Home (`/`) — the hero screen, NEVER cut
  - [ ] 8.1 Implement Campaign Home with the animated Funded_Bar (centerpiece)
    - Sponsor identity + pledge ("$500, unlocks at 100 verified"); Funded_Bar fill `progress/threshold` with markers at 25/50/75/100; unlocked value `pool*(progress/threshold)`; next-milestone label; latest-verified feed; "Verify a cleanup" CTA; animate 37→38 on return from a pass (hero beat — all polish budget here)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 10.1, 10.2, 14.1_

  - [ ]* 8.2 Write component tests for Campaign Home
    - Assert pool/threshold/progress/unlocked-value/markers/next-milestone/feed/CTA render; bar fill proportional
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 14.1_

- [ ] 9. Build the Verify screen (`/verify`) — two-state engine
  - [ ] 9.1 Implement State A (before-commit) and State B (after-upload + verdict)
    - State A: upload before → "locked in" + timestamp; State B: upload after → call `/api/verify` → show confidence + rationale on pass AND reject; on pass: success animation + café coupon card + hand back to Home for the bar tick; on reject: show rationale, leave bar unchanged, offer retry
    - _Requirements: 3.3, 9.2, 9.3, 11.2, 14.3_

  - [ ]* 9.2 Write component tests for Verify two-state + coupon card
    - State A/State B rendering; pass success + coupon card; reject rationale + retry + bar unchanged
    - _Requirements: 9.2, 9.3, 11.2, 14.3_

- [ ] 10. Build Mission Detail (`/mission`)
  - [ ] 10.1 Implement Mission Detail screen
    - Instructions, before/after photo guidance, sponsor, cleanup contribution, CTA → Verify
    - _Requirements: 14.2_

  - [ ]* 10.2 Write component test for Mission Detail
    - Assert instructions/guidance/sponsor/contribution/CTA render
    - _Requirements: 14.2_

- [ ] 11. Checkpoint — end-to-end demoable slice complete
  - Ensure all tests pass, ask the user if questions arise. Scaffold → data → core → `/api/verify` → Campaign Home + Verify + Mission Detail must demo the full hero loop and the staged-fraud reject before any optional work below.

- [ ] 12. Staged-fraud and legit-pass end-to-end wiring
  - [ ] 12.1 Wire the seeded staged-fraud and legit submissions through the live pipeline
    - Ensure the seeded reused + out-of-area submission is rejected with both `duplicate_photo` and `out_of_area` reasons and leaves the bar unchanged; the legit submission passes and advances the bar
    - _Requirements: 16.1, 16.2, 16.3_

  - [ ]* 12.2 Write integration tests for staged-fraud reason set and legit pass
    - Seeded fraud returns both reasons + bar unchanged (16.1, 16.2); seeded legit passes + bar advances (16.3)
    - _Requirements: 16.1, 16.2, 16.3_

- [ ] 13. Impact screen (`/impact`) — FIRST TO CUT / optional
  - [ ]* 13.1 Implement the Impact proof-trail screen (optional, cut-if-time)
    - Demo user's verified cleanups, community total, sponsor progress toward payout; per degrade-gracefully #2 this is the FIRST screen to cut — fold its proof-trail content into Campaign Home if time is short
    - _Requirements: 14.4_

  - [ ]* 13.2 Write component test for Impact screen
    - Assert verified cleanups / community total / sponsor progress render
    - _Requirements: 14.4_

- [ ] 14. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (test sub-tasks and the cut-if-time Impact screen) and can be skipped for a faster demo-ready MVP.
- Degrade-gracefully order (from the design): (1) soften the EXIF/geo soft-signal first — task 4.3 can be stubbed to a neutral 0.5; (2) cut the Impact screen next — task 13; (3) NEVER cut the funded-bar animation (task 8.1) or the pass/reject rationale display (task 9.1).
- The end-to-end demoable slice is tasks 1–11; optional polish (staged-fraud integration tests, Impact) follows.
- Each task references the specific requirements and/or design properties it satisfies for traceability.
- Property tests cover the brief's focus areas: composite verdict, pipeline ordering, and the atomic/idempotent increment.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1", "4.1", "4.3", "4.7"] },
    { "id": 1, "tasks": ["2.2", "2.3", "3.2", "3.3", "3.4", "3.5", "4.2", "4.4", "4.5", "4.6", "4.8"] },
    { "id": 2, "tasks": ["2.4", "2.5", "2.6", "5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "7.1", "7.3"] },
    { "id": 4, "tasks": ["7.2", "7.4", "8.1", "9.1", "10.1", "13.1"] },
    { "id": 5, "tasks": ["8.2", "9.2", "10.2", "12.1", "13.2"] },
    { "id": 6, "tasks": ["12.2"] }
  ]
}
```
