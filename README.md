<div align="center">
  <img src="public/sprout-logo.png" alt="Sprout logo" width="110" />
  <h1>Sprout</h1>
  <p><strong>Verified climate-action rewards built with Next.js, TypeScript, Supabase, and Claude Vision.</strong></p>
  <p>
    Turn local environmental action into proof sponsors can count.<br /><br />
    Try it: https://hackachusetts-build.vercel.app/
  </p>
</div>

## Why Sprout

Environmental programs often struggle to prove that funded actions actually happened. Sprout connects sponsors and participants through a simple **mission → proof → verification → reward** workflow:

- a sponsor backs a cleanup goal;
- a participant commits a before photo, completes the cleanup, and submits an after photo;
- Sprout validates ownership, duplicate, location/time, and visual signals;
- clear evidence passes, duplicate or conclusively weak evidence rejects, and borderline non-duplicate evidence enters protected review;
- each approved cleanup advances the campaign and awards configured points exactly once.

The result is an auditable link between individual action and sponsor-funded impact.

## Core features

- **Camera-first cleanup evidence**
  - real before/after image capture with decoded-byte, format, dimension, pixel, and 10 MB validation;
  - the before photo is committed first, then the user returns with a matching after photo;
  - live mode hides demo fixtures and requests the rear camera on supported phones.

- **AI-assisted, server-authoritative verification**
  - a low-effort Claude Haiku request compares both private images together;
  - the server combines Claude confidence with pHash and EXIF geo/time signals;
  - the client cannot submit an authoritative outcome or reward instruction.

- **Three-way integrity outcome**
  - `pass`: atomically complete and award;
  - `review`: freeze borderline, non-duplicate evidence without points or campaign progress;
  - `reject`: protect the sponsor pool and let the owner retry where appropriate;
  - duplicate evidence is always a hard reject and cannot be human-approved.

- **Secure exceptional human review**
  - `/api/review` fails closed behind a server-only bearer token;
  - live evidence is exposed only through read-only signed URLs that expire after five minutes;
  - a generated `reviewId` binds approve, deny, and owner-withdraw actions to the exact held evidence;
  - append-only audit rows survive later retries and seed resets;
  - there is no organizer or reviewer dashboard.

- **Owner-visible recovery**
  - Mission and Verify show pending and denied review status in the existing product routes;
  - owners can withdraw a pending claim or submit a clearer after photo after denial;
  - pending evidence cannot be replaced or re-verified.

- **Atomic sponsor accounting and rewards**
  - successful automatic and human approvals use database row locks and `counted` guards;
  - campaign progress, points, verified counts, and first-cleanup coupon state update transactionally;
  - repeated or concurrent approval cannot count the same submission twice.

- **Private evidence and authentication**
  - Supabase Auth provides cookie-backed accounts;
  - evidence lives in a private Supabase Storage bucket;
  - owner checks prevent users from reading or mutating another user’s submission;
  - versioned consent covers Claude processing and exceptional authorized human inspection.

- **Reliable demo fallback**
  - the app runs without live Supabase or Claude credentials;
  - the legitimate seeded flow deterministically awards points;
  - demo unknown, foreign-owned, or pending-review submissions fail closed rather than minting fallback rewards.

## Technical highlights

### 1. Fixed verification pipeline

```text
validate owner + state + image + rate
  → perceptual duplicate check
  → EXIF location/time soft scoring
  → Claude before/after comparison
  → server composite outcome: pass | review | reject
```

Missing EXIF is a soft signal, not an automatic rejection. Duplicate evidence dominates every other signal and always rejects.

### 2. Evidence-bound review

A live review hold locks the submission, confirms the assessed `after_ref` is still current, stores the exact pHashes/metadata/verdict, and generates a unique `review_id`. Reviewer and owner actions must present that ID, so stale decisions cannot resolve a newer photo pair.

### 3. Atomic approval

PostgreSQL functions lock the submission, campaign, and user records. Human approval of a held claim completes the exact evidence and applies campaign progress and rewards in one transaction. Exact replays return without awarding again.

### 4. Reset-safe audit history

`review_audit` stores held, approved, denied, and withdrawn events under stable submission/review UUIDs. It intentionally does not foreign-key active demo submissions, allowing canonical seed rows to be deleted and recreated without erasing history or blocking reset.

### 5. Live and demo isolation

A seeded result never mutates the persistent Supabase-funded ledger. Integration failures may switch the user workflow to isolated local demo state, while ownership, lifecycle, and malformed-input errors remain explicit 4xx responses.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Custom CSS, mobile-first responsive design |
| Animation | Framer Motion, canvas-confetti |
| Backend | Next.js Route Handlers |
| Authentication | Supabase Auth |
| Database | Supabase Postgres |
| Storage | Private Supabase Storage |
| AI verification | Anthropic Claude Haiku Vision |
| Image processing | Sharp |
| Metadata | exifr |
| Testing | Vitest, Testing Library |

## Architecture

```text
Exactly four product routes
  /  ·  /mission  ·  /verify  ·  /impact
                    │
                    ▼
Owner-authenticated APIs
  campaign · upload · submissions/withdraw · verify
                    │
         pass | review | reject
          │       │       └─ reject/retry, no reward
          │       └─ frozen hold, no reward
          │
          └──────────────┐
                         ▼
Bearer-authenticated /api/review (operator API only)
  five-minute evidence links · approve · deny
                         │
                         ▼
Supabase Postgres + private Storage
  atomic finalization · review audit · funded progress
```

Important files:

- `components/verify-client.tsx` — capture, consent, outcomes, review status, and recovery
- `lib/claude.ts` — image normalization and one Claude multimodal request
- `lib/pipeline.ts` — fixed server-authoritative verification order
- `lib/verdict.ts` — pass/review/reject policy
- `lib/reviewer-auth.ts` — fail-closed, constant-time operator token validation
- `lib/supabase-store.ts` — private evidence and durable review/reward operations
- `lib/services.ts` — live/demo isolation and fallback selection
- `supabase/schema.sql` — private schema, lifecycle, and reset-safe review audit
- `supabase/functions.sql` — atomic finalization, hold, resolution, and withdrawal RPCs

## Local setup

### Requirements

- Node.js **20.9+**
- npm
- Optional Supabase credentials for persistent auth/storage
- Optional Anthropic API key for live AI verification

### Install and run

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`. Without external credentials, Sprout uses seeded demo data.

### Configure live services

```env
# Server-only Claude settings
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

# Supabase Auth and trusted server access
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Server-only operator credential; leave blank to disable review
SPROUT_REVIEW_TOKEN=
# Optional server-owned audit label
SPROUT_REVIEWER_ID=

SPROUT_DATA_MODE=auto
SPROUT_AI_MODE=auto
```

Security rules:

- Never prefix `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SPROUT_REVIEW_TOKEN`, or `SPROUT_REVIEWER_ID` with `NEXT_PUBLIC_`.
- Use a random review token of at least 32 characters and send it only in `Authorization: Bearer <token>`—never in a URL, browser storage, analytics, or logs.
- Leaving `SPROUT_REVIEW_TOKEN` blank disables all review reads and mutations.
- Request bodies cannot select reviewer identity; the server reads optional attribution from `SPROUT_REVIEWER_ID`.
- Never commit `.env.local`.

### Apply schema and seed

Run these separately, in order, in the Supabase SQL editor:

1. `supabase/schema.sql`
2. `supabase/functions.sql`

Then upload/reset canonical fixtures:

```bash
npm run seed
```

The seed command fails immediately if active-row cleanup cannot complete. Audit history retains stable UUIDs without blocking reset.

## Human-review operator API

There is no reviewer web page. Every request requires the configured bearer token.

- `GET /api/review` lists current held claims. Live claims include newly generated read-only evidence URLs valid for five minutes.
- `POST /api/review` accepts:

```json
{
  "action": "approve",
  "submissionId": "<uuid>",
  "reviewId": "<uuid>"
}
```

`action` may be `approve` or `deny`. Approval is atomic and idempotent. Denial awards nothing and reopens the original committed-before submission for a new after photo.

## Validation

```bash
npm test
npm run build
```

Current local validation: **61/61 tests pass** and the production build succeeds. SQL contracts are checked statically; apply both SQL files to a disposable Supabase project before production rollout because this workspace does not include a local PostgreSQL runtime.

## Demo flows

### Legitimate cleanup

1. Open the featured mission.
2. Commit a before photo.
3. Complete the cleanup and submit a matching after photo.
4. Sprout checks duplicate, metadata, and visual signals.
5. A pass awards points and moves sponsor progress exactly once.

### Borderline review

1. Borderline non-duplicate evidence enters `pending_review`.
2. Points, coupon, and funded progress remain unchanged.
3. An authorized operator may inspect the frozen pair using expiring links.
4. Approval awards exactly once; denial or owner withdrawal permits a clearer after photo.

### Fraud rejection

1. Load intentionally reused evidence.
2. Duplicate and location signals trigger rejection.
3. No points or sponsor progress are awarded, and the attempt never enters review.

## Honest boundaries and future improvements

- Sponsor names, offers, coupon, and money are illustrative; no real payment or redeemability is claimed.
- AI plus human review raises the cost of cheating but is not fraud-proof.
- Production still needs published evidence-retention/deletion policy, individual reviewer identities, token rotation/revocation, account recovery/deletion, and distributed rate limiting.
- Future versions may support sponsor-created campaigns, downloadable impact reports, real reward redemption, and additional evidence-compatible environmental actions.
- The current MVP intentionally has no sponsor, organizer, or reviewer dashboard.

## License

MIT
