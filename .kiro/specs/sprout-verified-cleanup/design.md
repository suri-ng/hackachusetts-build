# Design Document

## Overview

Sprout is a mobile-first Next.js App Router application implementing **verified-impact escrow**. Clear evidence can pass automatically, duplicate or conclusively weak evidence rejects, and borderline non-duplicate evidence enters a no-reward `pending_review` state. The funded bar animates only after an automatic or authorized human approval commits atomically.

The implemented application uses one student mission across four product routes. Human review adds no dashboard or product route: owner status and withdrawal live in Mission/Verify, while operators use a server-only bearer-token API.

All verdict logic remains server-authoritative. `POST /api/verify` computes pass/review/reject; `GET/POST /api/review` can inspect or resolve only frozen pending evidence after token authorization. Neither browser path can supply progress, points, reviewer identity, or an authoritative verdict.

### Design goals (in priority order, matching the brief's guardrails)

1. One polished end-to-end flow: before commit → after photo → pass/review/reject → reward or recovery.
2. Server-authoritative triage with duplicate evidence always hard-rejected.
3. Atomic, idempotent automatic and human approval; pending, denied, and withdrawn claims award nothing.
4. Owner-visible pending status and retry inside existing routes, plus token-authorized five-minute evidence reads without a dashboard.

### Degrade-gracefully order (if time runs short)

Per §6a/§9 of the concept brief, cut capability in this order and no further:

1. **First to soften:** EXIF/geo/time soft-signal. It is a *soft* input to the verdict (missing metadata already lowers but never auto-rejects), so it can be stubbed to a neutral score with the pipeline shape intact.
2. **Second to cut:** the Impact screen (#4); fold its proof-trail content into Campaign Home.
3. **Never cut:** funded-bar causality, pass/review/reject rationale, duplicate hard rejection, or pending no-reward guarantees.

## Architecture

```
┌──────────────────────────── Next.js App Router (TypeScript) ───────────────────────────┐
│                                                                                          │
│  CLIENT (React, mobile-first, animated)                                                  │
│   ├─ /                 Campaign Home   (Funded_Bar + milestone markers + feed + CTA)     │
│   ├─ /mission          Mission Detail  (instructions + before/after guidance)            │
│   ├─ /verify           Verify (before / after / outcome / pending + retry)                │
│   └─ /impact           Impact proof trail                                                 │
│          │ owner-authenticated fetch                                                       │
│          ▼                                                                                 │
│  SERVER (Route Handlers — keys, verdicts, and reward writes stay here)                    │
│   ├─ POST       /api/upload-url   validate and retain owner-scoped private bytes           │
│   ├─ POST/PATCH /api/submissions  commit before / owner withdrawal                         │
│   ├─ POST       /api/verify       compute pass/review/reject                                │
│   ├─ GET        /api/campaign     campaign + owner status                                   │
│   └─ GET/POST   /api/review       bearer-authorized operator reads/decisions               │
│          │                                                                               │
│          ▼                                                                               │
│  lib/ (pure, unit-tested core — no I/O)                                                  │
│   ├─ verdict.ts     compositeVerdict(), unlockedValue(), fillRatio(), nextMilestone()    │
│   ├─ phash.ts       perceptual hash + Hamming-distance duplicate match (sharp)           │
│   ├─ geotime.ts     EXIF extract (exifr) + geoTimeScore()                                │
│   ├─ claude.ts      assessWithClaude() + seeded fallback on error/timeout                │
│   └─ pipeline.ts    orchestrates the fixed step order                                    │
│          │                                                                               │
│          ▼                                                                               │
└──────────┼───────────────────────────────────────────────────────────────────────────┘
           ▼
   Supabase ── Postgres (campaign, submission, coupon, demo_user, known_phash)
            ── private Storage (before/after photos; five-minute reviewer read URLs)
            ── service-role SQL functions for automatic finalization, review hold/resolution, and owner withdrawal
            ── seed.sql (resettable demo data: campaign 500/100/37, staged fraud, coupon)
```

### Key architectural decisions

- **Trusted server entry points.** `POST /api/verify` computes automatic outcomes; bearer-authorized `/api/review` can resolve only `pending_review`. Database guards—not request data—control reward writes.
- **Pure core in `lib/`.** Verdict math, scoring, hashing, and pipeline ordering are injected and unit-tested across live and demo adapters.
- **Atomicity in Postgres.** Automatic finalization and human approval lock the Submission and use `counted=false` guards so state, Progress, points, and the first-cleanup coupon rule cannot double-apply.
- **Frozen pending evidence.** The live hold locks the Submission, verifies the assessed after reference is still current, generates a unique `review_id`, stores pHashes/EXIF/verdict fields, and appends an immutable audit snapshot. Every decision and withdrawal must present the matching `review_id`.
- **Server-only secrets.** Claude, Supabase service role, and `SPROUT_REVIEW_TOKEN` are unprefixed server variables. Reviewer identity is read from server configuration only.

## Technology Stack & Scaffold Recreation

The repo has no code, so the build starts by recreating the scaffold.

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Framework | Next.js (App Router) + React |
| Styling / animation | CSS modules or Tailwind + Framer Motion for the funded-bar beat |
| Data / storage / auth | Supabase (Postgres, Storage, RLS) |
| Image hashing | `sharp` (decode/normalize) + perceptual hash |
| EXIF | `exifr` |
| AI | Claude multimodal API via `@anthropic-ai/sdk` (server-side only) |
| Tests | Vitest |

Files to recreate on scaffold:

```
package.json            scripts: dev, build, test, seed
next.config.mjs
tsconfig.json
vitest.config.ts        node + jsdom projects
vitest.setup.ts
.env.local.example      ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                        NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
                        SPROUT_REVIEW_TOKEN, SPROUT_REVIEWER_ID
app/                    routes + api route handlers
lib/                    verdict.ts, phash.ts, geotime.ts, claude.ts, pipeline.ts
supabase/               schema.sql, functions.sql, seed.sql
```

Environment variable split (Requirement 13.1): anything prefixed `NEXT_PUBLIC_` is client-visible and holds only the anon key + URL; `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are unprefixed and used only in server route handlers.

## Components and Interfaces

### Pure core (`lib/`) — the unit-tested surface

```typescript
// verdict.ts ---------------------------------------------------------------

export interface VerdictSignals {
  claudeConfidence: number; // 0..1 from Claude (or seeded fallback)
  geoScore: number;         // 0..1 soft signal (0.5 neutral when EXIF absent)
  timeScore: number;        // 0..1 soft signal (0.5 neutral when EXIF absent)
  duplicateFlag: boolean;   // true => hard fail
}

export interface Verdict {
  outcome: 'pass' | 'review' | 'reject';
  pass: boolean;             // true only for pass
  confidence: number;        // surfaced on all outcomes
  rationale: string;         // one-line explanation
  reasons: string[];         // contributors on review/reject
}

// finalOutcome = f(claudeConfidence, geoScore, timeScore, duplicateFlag)
// Duplicate is an unconditional reject. Non-duplicates pass above the policy,
// reject below the hard floor, and otherwise enter review.
export function compositeVerdict(s: VerdictSignals): Verdict;

export function unlockedValue(pool: number, progress: number, threshold: number): number; // pool*(progress/threshold)
export function fillRatio(progress: number, threshold: number): number;                    // clamp(progress/threshold, 0..1)
export function nextMilestone(progress: number, markers?: number[]): number | null;        // least marker > progress
```

`compositeVerdict` policy (server-tunable constants):
- `duplicateFlag === true` → immediate reject, reason `"duplicate_photo"`. (Req 6.2, 16.1)
- otherwise compute `score = claudeConfidence * wC + geoScore * wG + timeScore * wT` with weights summing to 1 and `wC` dominant.
- `pass` when `claudeConfidence >= claudeMinimum` AND the composite clears `passThreshold`.
- non-duplicate evidence below `hardRejectConfidence` rejects; the remaining middle band enters `review` with no rewards.
- reasons are collected for each failing contributor: `low_confidence`, `out_of_area`, and `time_mismatch`.

Because geo/time only *lower* the composite and never set a hard fail, a legitimate cleanup with stripped EXIF (neutral 0.5 scores) still passes on strong Claude confidence (Req 7.3). The staged-fraud case fails on `duplicateFlag` plus a low `geoScore` → two reasons (Req 16.1).

```typescript
// phash.ts -----------------------------------------------------------------
export function perceptualHash(image: Buffer): Promise<string>;         // sharp-normalized aHash/dHash
export function hammingDistance(a: string, b: string): number;
export function isDuplicate(hash: string, known: string[], maxDistance?: number): boolean;

// geotime.ts ---------------------------------------------------------------
export interface ExifMeta { lat?: number; lon?: number; takenAt?: Date; }
export function extractExif(image: Buffer): Promise<ExifMeta>;           // exifr; absent fields => undefined
export interface GeoTimeInput {
  before: ExifMeta; after: ExifMeta;
  missionArea: { lat: number; lon: number; radiusMeters: number };
}
export function geoTimeScore(i: GeoTimeInput): { geoScore: number; timeScore: number };
// Missing EXIF => neutral/lowered scores (never auto-reject). Closer GPS / closer
// before-after timestamps never produce a lower score (monotonic).

// claude.ts ----------------------------------------------------------------
export interface ClaudeResult { confidence: number; rationale: string; }
export async function assessWithClaude(
  before: Buffer, after: Buffer, opts?: { timeoutMs?: number }
): Promise<ClaudeResult>;
// On error OR timeout, returns a SEEDED fallback result so the pipeline always
// reaches completion (Req 8.3). Seeded fallback is deterministic and demo-safe.

// pipeline.ts --------------------------------------------------------------
export interface VerifyRequest {
  submissionId: string;
  demoUserId: string;
  beforeRef: string; afterRef: string;     // storage references, not raw client verdicts
}
export interface VerifyResponse {
  outcome: 'pass' | 'review' | 'reject';
  pass: boolean; confidence: number; rationale: string; reasons: string[];
  progress: number; unlockedValue: number; poolUnlocked: boolean;
  pointsAwarded: number; couponAwarded: boolean; wasCounted: boolean;
}
export async function runVerification(req: VerifyRequest, deps: PipelineDeps): Promise<VerifyResponse>;
```

### `runVerification` — the fixed §9a order (Req 4.2, 4.3)

```
1. input/state validation  owner, `before_committed`, image constraints, and rate limit
2. pHash duplicate check   compare both images with seeded/prior evidence
3. EXIF/geo/time           extract metadata and compute soft scores
4. Claude assess           compare before and after together server-side
5. composite outcome       `compositeVerdict(...)`
   ├─ PASS: `finalize_verification` atomically completes and applies one reward package
   ├─ REVIEW: `hold_for_review` stores the exact hashes/metadata/verdict and sets
   │          `pending_review`; Progress, points, and coupon remain unchanged
   └─ REJECT: record reasons; retain `before_committed` for a new after attempt
6. respond                 confidence + one-line rationale on every domain outcome
```

Validation fails before expensive work. Duplicate evidence always rejects. Application and SQL state guards prevent attaching or re-verifying new evidence while a claim is pending. A separately authenticated operator can resolve only the frozen pending row.

### API route handlers (`app/api/`)

| Route | Method | Purpose |
|---|---|---|
| `/api/upload-url` | POST | Validate and retain an owner-scoped private image |
| `/api/submissions` | POST/PATCH | Commit before evidence / owner-withdraw a pending review |
| `/api/verify` | POST | Compute the owner-scoped pass/review/reject pipeline |
| `/api/campaign` | GET | Campaign, feed, and owner-visible review status |
| `/api/review` | GET/POST | Bearer-authorized pending list with five-minute signed reads / atomic approve or deny |

Before-commit (State A) creates a `before_committed` submission and records the commit timestamp (Req 3.2); it does **not** call `/api/verify`. After-upload (State B) calls `/api/verify` for the existing submission (Req 3.4). An after-upload with no committed before is rejected with a prompt (Req 3.5).

### Screens (Req 14) — 4 mobile-first routes

1. **Campaign Home (`/`)** — hero. Sponsor identity, pledge ("$500, unlocks at 100 verified"), the **Funded_Bar** with markers at 25/50/75/100, unlocked value `pool*(progress/threshold)`, next-milestone label, latest-verified feed, and the "Verify a cleanup" CTA. The 37→38 bar animation on return from a pass is the hero beat (Req 2, 10.1). **Never cut.**
2. **Mission Detail (`/mission`)** — instructions, sponsor contribution, active pending/denied status, and context-aware resume/retry CTA.
3. **Verify (`/verify`)** — before and after capture, processing, pass/review/reject feedback, warning-styled pending status, and authenticated owner withdrawal/retry.
4. **Impact (`/impact`)** — verified cleanups, community total, sponsor progress toward payout. Pending claims never appear as approved impact.

## Data Models

Postgres schema (Supabase). RLS enabled on all tables; writes to `campaign`/`submission` state go only through the service-role server routes (Req 13.2).

```sql
-- demo_user: single hardcoded student (Req 17.1)
create table demo_user (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  verified_count int not null default 0,   -- drives first-coupon rule
  coupon_awarded boolean not null default false
);

-- sponsor campaign (Req 2.1, 15.1)
create table campaign (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,
  pool numeric not null,                    -- seeded 500
  threshold int not null,                   -- seeded 100
  progress int not null default 0,          -- seeded 37
  milestones int[] not null default '{25,50,75,100}',  -- Req 2.4
  pool_unlocked boolean not null default false
);

-- submission (Req 3, 15.2, 15.3)
create type submission_state as enum ('before_committed', 'pending_review', 'complete');
create table submission (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references demo_user(id),
  campaign_id uuid references campaign(id),
  before_ref text,                          -- storage path
  after_ref text,
  before_phash text,
  after_phash text,
  before_lat double precision, before_lon double precision,
  before_taken_at timestamptz, after_taken_at timestamptz,
  state submission_state not null default 'before_committed',
  committed_at timestamptz not null default now(),  -- before-first timestamp (Req 3.2)
  verdict_pass boolean,
  confidence numeric,
  rationale text,
  reasons text[] not null default '{}',
  assessor_source text,
  review_id uuid,                         -- immutable identity of active hold
  review_decision text,                    -- approved | denied | withdrawn
  reviewed_by text,                        -- server-sourced reviewer/owner id
  reviewed_at timestamptz,
  points_awarded int not null default 0,
  counted boolean not null default false   -- idempotency guard (Req 12)
);

-- append-only snapshots and decisions survive later retries
create table review_audit (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,              -- stable UUID; intentionally no FK so demo resets retain audit
  review_id uuid not null,
  action text not null,                     -- held | approved | denied | withdrawn
  actor text,
  after_ref text not null,
  confidence numeric,
  rationale text,
  reasons text[] not null default '{}',
  occurred_at timestamptz not null default now()
);

-- café coupon definition (Req 11, 15.4)
create table cafe_coupon (
  id uuid primary key default gen_random_uuid(),
  title text not null,                       -- e.g. "Free drip coffee with any purchase"
  cafe_name text not null,
  redeemable boolean not null default false  -- seeded, non-redeemable (Req 11.4, 18.4)
);

-- known perceptual hashes: seeded stock + prior-submission hashes (Req 6.2)
create table known_phash (
  id uuid primary key default gen_random_uuid(),
  phash text not null,
  source text not null                       -- 'seed_stock' | 'submission'
);
```

### Atomic finalization and review resolution (Req 12, 19)

`finalize_verification` locks and atomically applies an automatic Claude pass. `hold_for_review` stores the exact assessed pHashes, metadata, rationale, reasons, and existing private references before changing state. `resolve_held_claim` locks the held row plus campaign/user rows: approval completes and rewards exactly once; denial reopens after capture with no reward. `retry_held_claim` performs the same no-reward reopening only when the supplied owner id matches. All functions are executable only by `service_role`.

The retained `increment_progress` helper below illustrates the underlying `counted=false` compatibility guard; new automatic and human paths use the fuller RPCs in `supabase/functions.sql`.

```sql
create or replace function increment_progress(p_submission_id uuid)
returns table(progress int, pool_unlocked boolean, was_counted boolean)
language plpgsql as $$
declare
  v_campaign uuid;
  v_already boolean;
begin
  -- Conditionally claim this submission; UPDATE ... WHERE counted=false is the
  -- atomic guard. Row count 0 => already counted => idempotent no-op.
  update submission
     set counted = true
   where id = p_submission_id and counted = false
  returning campaign_id into v_campaign;

  if not found then
    -- already counted earlier: return current state, do NOT increment again
    select c.progress, c.pool_unlocked, false
      into progress, pool_unlocked, was_counted
      from submission s join campaign c on c.id = s.campaign_id
     where s.id = p_submission_id;
    return next; return;
  end if;

  update campaign
     set progress = progress + 1,
         pool_unlocked = (progress + 1) >= threshold   -- Req 10.3
   where id = v_campaign
  returning progress, pool_unlocked into progress, pool_unlocked;

  was_counted := true;
  return next;
end $$;
```

### Seed script (`supabase/seed.sql`) — resettable (Req 15)

Seed is written to be re-runnable: it truncates the demo tables (or upserts canonical rows) and re-inserts the fixed starting values, so running it twice yields an identical state (Req 15.5).

- campaign: pool `500`, threshold `100`, progress `37`, `pool_unlocked=false` (Req 15.1).
- one submission in `before_committed` so the demo starts mid-flow (Req 15.2).
- one staged-fraud submission: `before_ref`/`after_ref` pointing at a seeded stock image whose `phash` is in `known_phash` (duplicate) AND geo coordinates outside the mission area (out-of-area) → rejected with both reasons live on stage (Req 15.3, 16.1).
- `cafe_coupon` definition, `redeemable=false` (Req 15.4).
- `demo_user` with `verified_count=0`, `coupon_awarded=false`.

## Error Handling

| Failure | Handling | Requirement |
|---|---|---|
| Invalid file type/size | Reject before any downstream step; reason `"invalid_file"` | 5.1, 5.2, 13.3 |
| Rate limit exceeded | Reject with reason `"rate_limited"` | 5.3 |
| Duplicate photo | Hard-fail verdict, reason `"duplicate_photo"` | 6.2, 16.1 |
| Missing EXIF | Lower geo/time scores to neutral; continue (no auto-reject) | 7.3 |
| Claude error / timeout | Substitute seeded fallback verdict; pipeline completes | 8.3 |
| Composite reject | Return confidence + rationale + reasons; keep `before_committed`; progress untouched | 4, 9 |
| Borderline non-duplicate | Persist frozen `pending_review`; no reward | 3.6, 4.4, 19.2 |
| Missing/invalid reviewer token | `503` when disabled or `401` when unauthorized; disclose nothing | 13.4, 19.1 |
| Reviewer approval | Atomic, idempotent completion and reward package | 12, 19.3 |
| Reviewer denial / owner withdrawal | Reopen after-photo step with no reward | 3.7, 19.4–19.5 |
| After-upload with no committed before | Reject; prompt to commit before first | 3.5 |
| Double increment / retry | Idempotent SQL no-op after first count | 12 |

The guiding rule: every valid assessment returns a confidence score, concise rationale, and exactly one pass/review/reject outcome. Request/service failures remain API errors. Pending, denied, withdrawn, and rejected claims never move rewards or Progress.

## Testing Strategy

Vitest, focused on the verification pipeline, the composite verdict, and the idempotent increment (the brief's explicit focus). Pure `lib/` functions get property-based tests; I/O, screens, and infra get example/integration/smoke tests.

- **Property tests** (≥100 iterations each, randomized inputs): verdict math, pipeline ordering, server-authoritative verdict, validation gate, rate limit, duplicate detection, geo/time scoring, EXIF round-trip, Claude fallback, verdict feedback, pool-unlocked crossing, coupon-once, atomic-idempotent increment, next-milestone, seed-reset idempotence. Tag format: **Feature: sprout-verified-cleanup, Property {n}: {text}**.
- **Example/edge tests:** after-before-no-commit guard (3.5), rendered screen content (14), coupon card (11.2), seeded fraud reason set (16.1), seeded legit pass (16.3).
- **Integration/smoke:** Claude call shape with mock (8.1), RLS + signed URL (13.2), `/api/verify` route exists (4.1), seed row creation (15.1–15.4), non-goal absence (18).

The atomic/idempotent increment property drives repeated and concurrent calls for one submission id against the real SQL function (or a faithful in-memory model) and asserts a net delta of exactly one.

## Acceptance Criteria Testing Prework

The full per-criterion classification was performed with the prework tool before writing the properties below. Summary of consolidations applied in the reflection step:

- "exactly one unit per cleanup" (1.2, 1.4, 10.2) → one increment-by-one property.
- "reject leaves progress unchanged" (1.3, 16.2) → one reject-invariant property.
- "invalid upload rejected before downstream work" (5.1, 5.2, 13.3) → one validation-gate property.
- "coupon only on first pass" (11.1, 11.3) → one coupon-once property.
- "atomic + idempotent increment" (12.1, 12.2) → one property.
- pipeline-step order (4.2) and post-pass action order (4.3) → one fixed-order property.

UI rendering, infra/config, and single-constant criteria are covered by example/integration/smoke tests rather than properties, as recorded in the prework.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Unlocked value tracks the pool fraction

*For any* non-negative pool, progress, and positive threshold, `unlockedValue(pool, progress, threshold)` equals `pool × (progress ÷ threshold)`.

**Validates: Requirements 1.1, 2.2**

### Property 2: A pass increments progress by exactly one unit

*For any* campaign progress value, applying a passing verification once increases progress by exactly one, with no magnitude weighting.

**Validates: Requirements 1.2, 1.4, 10.2**

### Property 3: A reject leaves progress unchanged

*For any* submission whose composite verdict is reject, the campaign progress after verification equals the progress before it.

**Validates: Requirements 1.3, 9.2, 16.2**

### Property 4: Funded-bar fill is proportional and bounded

*For any* progress between 0 and threshold, `fillRatio(progress, threshold)` equals `progress ÷ threshold` and lies within [0, 1].

**Validates: Requirements 2.3**

### Property 5: Next milestone is the least marker above progress

*For any* progress value and the markers {25, 50, 75, 100}, `nextMilestone(progress)` returns the smallest marker strictly greater than progress, or none when progress is at or beyond the highest marker.

**Validates: Requirements 2.5**

### Property 6: Before-commit yields a timestamped before_committed submission

*For any* before-photo upload, the resulting submission has state `before_committed` and a recorded commit timestamp.

**Validates: Requirements 3.2**

### Property 7: After-upload on a passing before_committed submission completes it

*For any* submission in state `before_committed` whose after-upload passes the pipeline, its state becomes `complete`.

**Validates: Requirements 3.4**

### Property 8: The pipeline executes its steps in the fixed order

*For any* verification request, the steps run in the order input-validation → pHash → EXIF/geo/time → Claude → composite verdict, and on a pass the post-verdict actions run in the order increment → threshold check → pool-unlocked update.

**Validates: Requirements 4.2, 4.3**

### Property 9: Rejections return their contributing reasons

*For any* request whose composite verdict is reject, the response contains a non-empty set of reasons corresponding to the failing signals.

**Validates: Requirements 4.4, 16.1**

### Property 10: The verdict is server-authoritative

*For any* request carrying an arbitrary client-supplied verdict field, the returned verdict equals `f(claudeConfidence, geoScore, timeScore, duplicateFlag)` computed on the server and is independent of the client field.

**Validates: Requirements 4.5**

### Property 11: Invalid uploads are rejected before any downstream work

*For any* upload failing file-type or file-size validation, the request is rejected with a validation reason and no pHash, EXIF, or Claude step is invoked.

**Validates: Requirements 5.1, 5.2, 13.3**

### Property 12: Requests beyond the rate limit are rejected

*For any* sequence of submissions exceeding the configured rate limit, every request past the limit is rejected with a rate-limit reason.

**Validates: Requirements 5.3**

### Property 13: Duplicate photos set the flag and reject

*For any* uploaded photo whose perceptual hash matches a prior submission or seeded stock image within the match threshold, the duplicate flag is set and the submission is rejected with a duplicate reason; non-matching photos do not set the flag.

**Validates: Requirements 6.1, 6.2**

### Property 14: EXIF extraction round-trips embedded metadata

*For any* photo with embedded GPS coordinates and a timestamp, extraction returns those same coordinates and timestamp.

**Validates: Requirements 7.1**

### Property 15: Geo/time score is monotonic in proximity

*For any* before/after pair, the Geo_Time_Score lies within [0, 1], and increasing the GPS distance from the mission area or the before/after time gap never increases the score.

**Validates: Requirements 7.2**

### Property 16: Missing EXIF lowers the score without auto-rejecting

*For any* submission, removing its EXIF metadata produces a Geo_Time_Score no higher than the same submission with favorable EXIF, and the pipeline continues rather than rejecting solely due to the missing metadata.

**Validates: Requirements 7.3**

### Property 17: Claude failure falls back to a seeded verdict

*For any* error or timeout from the Claude multimodal call, the assessor returns the seeded fallback result and the pipeline still reaches a completed verdict.

**Validates: Requirements 8.3**

### Property 18: Confidence and rationale are returned on all outcomes

*For any* completed verification, the response contains a numeric confidence score and a non-empty one-line rationale whether the outcome is pass, review, or reject.

**Validates: Requirements 8.2, 9.1**

### Property 19: Reaching the threshold enters the pool-unlocked state

*For any* campaign whose progress reaches or exceeds its threshold after a passing increment, the pool-unlocked state is entered; below the threshold it is not.

**Validates: Requirements 10.3**

### Property 20: The café coupon is awarded exactly once, on the first verified cleanup

*For any* sequence of one or more passing cleanups by the demo user, the café coupon is awarded exactly once and only on the first pass.

**Validates: Requirements 11.1, 11.3**

### Property 21: The progress increment is atomic and idempotent

*For any* submission id, applying the increment one or more times (including concurrently) changes the campaign progress by exactly one in total for that submission.

**Validates: Requirements 12.1, 12.2**

### Property 22: Re-running the seed script resets to the canonical starting state

*For any* prior data-store state, running the seed script yields the fixed seeded starting values (campaign 500/100/37, one before_committed submission, the staged-fraud submission, the coupon), and running it again leaves that state unchanged.

**Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5**


### Property 23: Pending review freezes evidence and rewards

*For any* non-duplicate borderline Submission entering `pending_review`, its stored evidence fields remain unchanged until resolution and its campaign progress, points, coupon, and counted flag remain unchanged.

**Validates: Requirements 3.6, 4.4, 19.2**

### Property 24: Reviewer authorization fails closed

*For any* missing, placeholder, short, or incorrect reviewer token, `/api/review` returns before listing, signing, approving, or denying any claim.

**Validates: Requirements 13.4–13.5, 19.1**

### Property 25: Human approval is atomic and idempotent

*For any* held Submission and any repeated or concurrent authorized approvals, exactly one transition can set `complete`, increment Progress once, award configured points once, and apply the first-cleanup coupon rule; denial and owner withdrawal award nothing.

**Validates: Requirements 12, 19.3–19.6**
