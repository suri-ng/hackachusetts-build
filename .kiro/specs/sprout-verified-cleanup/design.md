# Design Document

## Overview

Sprout is a mobile-first Next.js (App Router) application that implements **verified-impact escrow**: a sponsor's seeded reward pool unlocks only as AI-verified litter cleanups advance a funded progress bar toward a threshold. The product centerpiece is the funded-bar animation; its hero moment fires the instant Claude's rationale returns and the bar climbs while a personal café coupon pops.

The repository is currently docs-only (`README.md`, `SPROUT_CONCEPT.md`). This design therefore includes **recreating the scaffold** (TypeScript, Next.js/React App Router, Supabase, Vitest) as the first build step, then layering the single server-enforced verification pipeline on top.

All anti-fraud logic lives server-side inside one endpoint, `POST /api/verify`, which runs a fixed-order pipeline and is the only path that can move the funded bar. Nothing trusts the client.

### Design goals (in priority order, matching the brief's guardrails)

1. One polished, fully-working end-to-end flow: before-commit → clean → after-upload → verify → coupon + bar animation.
2. Server-authoritative composite verdict with atomic, idempotent progress increment.
3. Graceful reject/low-confidence path (protects the demo if a judge uploads a bad photo).
4. Visible anti-fraud: seeded staged-fraud submission caught live by duplicate + geo signals.

### Degrade-gracefully order (if time runs short)

Per §6a/§9 of the concept brief, cut capability in this order and no further:

1. **First to soften:** EXIF/geo/time soft-signal. It is a *soft* input to the verdict (missing metadata already lowers but never auto-rejects), so it can be stubbed to a neutral score with the pipeline shape intact.
2. **Second to cut:** the Impact screen (#4); fold its proof-trail content into Campaign Home.
3. **Never cut:** the funded-bar animation and the pass/reject rationale display. That animation *is* the product.

## Architecture

```
┌──────────────────────────── Next.js App Router (TypeScript) ───────────────────────────┐
│                                                                                          │
│  CLIENT (React, mobile-first, animated)                                                  │
│   ├─ /                 Campaign Home   (Funded_Bar + milestone markers + feed + CTA)     │
│   ├─ /mission          Mission Detail  (instructions + before/after guidance)            │
│   ├─ /verify           Verify (State A before-commit / State B after + verdict)          │
│   └─ /impact           Impact proof trail (first to cut → folds into Home)               │
│          │ fetch (multipart) + signed-URL upload                                         │
│          ▼                                                                               │
│  SERVER (Route Handlers — the ONLY place keys/verdict logic live)                        │
│   ├─ POST /api/upload-url   issue Supabase signed upload URL (validated)                 │
│   ├─ POST /api/verify       the single verification pipeline (§9a order)                 │
│   └─ GET  /api/campaign     read campaign + feed for Home/Impact                         │
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
            ── Storage  (before/after photos, RLS + signed upload URLs)
            ── SQL function increment_progress(submission_id)  (atomic + idempotent)
            ── seed.sql (resettable demo data: campaign 500/100/37, staged fraud, coupon)
```

### Key architectural decisions

- **Single trusted entry point.** Only `POST /api/verify` can change `progress`. The client never sends a verdict; it sends photo references and the target submission id.
- **Pure core in `lib/`.** The verdict math, scoring, hashing, and pipeline ordering are pure functions that take already-extracted signals. This keeps the testable logic I/O-free so Vitest can exercise it with generated inputs (the focus areas: pipeline, composite verdict, idempotent increment).
- **Atomicity pushed into Postgres.** The increment is a single conditional SQL statement/function keyed on `submission.id`, so "at most once per submission" holds even under retries or concurrency — not enforced in JavaScript.
- **Server-only secrets.** The Claude API key and the Supabase service-role key are read only in route handlers; no `NEXT_PUBLIC_` prefix, so they never enter the client bundle.

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
                        NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
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
  pass: boolean;
  confidence: number;       // surfaced to the student on BOTH outcomes
  rationale: string;        // one line, shown on BOTH outcomes
  reasons: string[];        // contributing reasons (populated on reject)
}

// finalVerdict = f(claudeConfidence, geoScore, timeScore, duplicateFlag)
// Hard fail: duplicateFlag. Otherwise composite of confidence + soft signals
// against server-side thresholds. Geo/time are SOFT and cannot alone reject.
export function compositeVerdict(s: VerdictSignals): Verdict;

export function unlockedValue(pool: number, progress: number, threshold: number): number; // pool*(progress/threshold)
export function fillRatio(progress: number, threshold: number): number;                    // clamp(progress/threshold, 0..1)
export function nextMilestone(progress: number, markers?: number[]): number | null;        // least marker > progress
```

`compositeVerdict` policy (server-tunable constants):
- `duplicateFlag === true` → immediate reject, reason `"duplicate_photo"`. (Req 6.2, 16.1)
- otherwise compute `score = claudeConfidence * wC + geoScore * wG + timeScore * wT` with weights summing to 1 and `wC` dominant.
- `pass` when `claudeConfidence >= claudeMin` AND `score >= passThreshold`.
- reasons collected for each failing contributor: `"low_confidence"`, `"out_of_area"` (low geoScore), `"time_mismatch"` (low timeScore). (Req 4.4, 16.1)

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
  pass: boolean; confidence: number; rationale: string; reasons: string[];
  progress?: number; unlockedValue?: number; poolUnlocked?: boolean;
  couponAwarded?: boolean;
}
export async function runVerification(req: VerifyRequest, deps: PipelineDeps): Promise<VerifyResponse>;
```

### `runVerification` — the fixed §9a order (Req 4.2, 4.3)

```
1. input validation        file type + size (Req 5.1/5.2/13.3) and rate limit (Req 5.3)
                           → fail-fast: reject BEFORE any hashing/Claude work
2. pHash duplicate check   hash both photos; compare to known_phash + prior submissions
                           → duplicateFlag; (Req 6)
3. EXIF/geo/time           extractExif → geoTimeScore → {geoScore, timeScore} (Req 7)
4. Claude assess           assessWithClaude(before, after) with seeded fallback (Req 8)
5. composite verdict       compositeVerdict({claudeConfidence, geoScore, timeScore, duplicateFlag})
   ── if PASS:
        5a. atomic idempotent increment  → increment_progress(submissionId) (Req 12)
        5b. threshold check              → poolUnlocked = newProgress >= threshold (Req 10.3)
        5c. pool-unlocked state update
        5d. first-cleanup coupon award   (Req 11, at-most-once)
        5e. set submission.state = complete (Req 3.4)
   ── if REJECT:
        return rejection with reasons; progress untouched (Req 1.3, 4.4, 9.2, 16.2)
6. respond                 confidence + one-line rationale on BOTH outcomes (Req 9.1)
```

Validation runs first and short-circuits so malformed/abusive requests never reach pHash or Claude (Req 5.1). Steps 2–5 are pure given their extracted inputs, which is what makes the ordering and the verdict unit-testable. Steps 5a–5e run only on pass and only through server-side DB calls.

### API route handlers (`app/api/`)

| Route | Method | Purpose |
|---|---|---|
| `/api/upload-url` | POST | Validate intended file type/size, return a Supabase signed upload URL (Req 13.2/13.3) |
| `/api/verify` | POST | The single verification pipeline (Req 4.1) |
| `/api/campaign` | GET | Campaign state + latest-verified feed for Home/Impact |

Before-commit (State A) creates a `before_committed` submission and records the commit timestamp (Req 3.2); it does **not** call `/api/verify`. After-upload (State B) calls `/api/verify` for the existing submission (Req 3.4). An after-upload with no committed before is rejected with a prompt (Req 3.5).

### Screens (Req 14) — 4 mobile-first routes

1. **Campaign Home (`/`)** — hero. Sponsor identity, pledge ("$500, unlocks at 100 verified"), the **Funded_Bar** with markers at 25/50/75/100, unlocked value `pool*(progress/threshold)`, next-milestone label, latest-verified feed, and the "Verify a cleanup" CTA. The 37→38 bar animation on return from a pass is the hero beat (Req 2, 10.1). **Never cut.**
2. **Mission Detail (`/mission`)** — instructions, before/after guidance, sponsor, contribution, CTA → Verify (Req 14.2).
3. **Verify (`/verify`)** — State A commit-before (locked + timestamped), State B upload-after → calls `/api/verify` → shows confidence + rationale on pass and reject, success + coupon card on pass, retry on reject (Req 3, 9, 11.2).
4. **Impact (`/impact`)** — verified cleanups, community total, sponsor progress toward payout (Req 14.4). **First screen to cut**; content folds into Home.

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
create type submission_state as enum ('before_committed', 'complete');
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
  counted boolean not null default false     -- idempotency guard (Req 12)
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

### Atomic idempotent increment (Req 12)

A single Postgres function performs the conditional update keyed on the submission id. The `counted` flag is flipped in the same statement that bumps `progress`, so a repeated or concurrent call for the same submission is a no-op after the first — "at most once per submission" is enforced by the database, not the app.

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
| Composite reject | Return confidence + rationale + reasons; progress untouched | 4.4, 9.1, 9.2 |
| After-upload with no committed before | Reject; prompt to commit before first | 3.5 |
| Double increment / retry | Idempotent SQL no-op after first count | 12 |

The guiding rule: the pipeline **always reaches a response carrying a confidence score and a one-line rationale**, pass or fail, so the demo never hard-crashes and a rejected judge upload shows a clean, explained reject (Req 9.1).

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

### Property 18: Confidence and rationale are returned on both outcomes

*For any* completed verification, the response contains a numeric confidence score and a non-empty one-line rationale, whether the outcome is pass or reject.

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
