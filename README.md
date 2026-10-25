<div align="center">
  <img src="public/sprout-logo.png" alt="Sprout logo" width="110" />
  <h1>Sprout</h1>
  <p><strong>Verified climate-action rewards platform built with Next.js, TypeScript, Supabase, and Claude Vision.</strong></p>
  <p>
    Turn local environmental action into proof sponsors can count.
    </br></br>Try it out: https://hackachusetts-build.vercel.app/
  </p>
</div>

## Why Sprout

Environmental programs often struggle to prove that funded actions actually happened.

Sprout connects sponsors and participants through a simple **mission → proof → verification → reward** workflow:

- a sponsor backs a cleanup goal
- a participant submits before-and-after photos
- Sprout verifies the evidence
- each accepted cleanup advances the campaign
- participants earn points and rewards

The result is an auditable link between individual action and sponsor-funded impact.

## Core features

- **Before-and-after cleanup missions**
  - participants commit a before photo, complete the cleanup, then submit an after photo
  - the app guides users to keep landmarks and framing consistent

- **AI-assisted verification**
  - Claude compares both images and evaluates whether they show the same place and a meaningful cleanup
  - the final PASS / REJECT decision is calculated by server-side policy rather than trusting the model alone

- **Fraud and replay protection**
  - perceptual image hashes detect reused or near-duplicate evidence
  - EXIF location and capture time are used as additional integrity signals
  - rejected submissions do not earn points or advance campaign progress

- **Sponsor-funded progress**
  - each newly verified cleanup advances the campaign by one unit
  - the funded bar shows progress toward the sponsor threshold

- **Points and rewards**
  - verified actions earn campaign-configured points
  - a user's first successful cleanup can unlock a café reward
  - repeated verification cannot award the same submission twice

- **Impact proof trail**
  - accepted actions appear in an impact ledger
  - sponsor metrics show verified outcomes, campaign value, and remaining progress

- **Private evidence + authentication**
  - accounts are backed by Supabase Auth
  - cleanup photos are stored in a private Supabase Storage bucket
  - server-side identity checks prevent users from modifying another user's submission

- **Demo fallback mode**
  - Sprout can run without live Supabase or Claude credentials
  - seeded fixtures keep the full verification flow demonstrable offline

## Technical highlights

### 1) Server-authoritative verification pipeline

Verification follows a fixed sequence:

1. validate the submission
2. check for duplicate evidence
3. calculate location and time signals
4. ask Claude to compare the photos
5. calculate the final verdict
6. award points and campaign progress only after a PASS

The current score weights Claude visual confidence most heavily, with geographic and time signals contributing additional confidence.

### 2) Perceptual duplicate detection

Sprout uses Sharp to normalize images and generate a **64-bit perceptual average hash**.

Hamming distance is then used to compare new evidence against previously accepted images and known blocked fingerprints.

This catches resized or recompressed copies that ordinary file hashes would miss.

### 3) Atomic sponsor accounting

Successful verification is finalized through a PostgreSQL function that updates:

- the submission
- campaign progress
- the user's points
- verified cleanup counts
- first-cleanup reward state
- accepted image hashes

A `counted` guard prevents repeated or concurrent requests from crediting the same cleanup twice.

### 4) Private evidence boundaries

Uploaded cleanup photos are treated as private evidence.

Supabase sessions determine the active user, uploads are scoped to that user, and raw evidence paths are handled only through server-side code.

Public impact views expose the verified outcome without exposing private source photos.

### 5) Live + demo runtime modes

Sprout supports both:

- a live Supabase + Claude workflow
- a seeded local demo workflow

If a live dependency fails, the app can fall back to isolated demo state without writing fake verification results into persistent sponsor data.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Custom CSS |
| Animation | Framer Motion, canvas-confetti |
| Backend | Next.js Route Handlers |
| Authentication | Supabase Auth |
| Database | Supabase Postgres |
| Storage | Private Supabase Storage |
| AI verification | Anthropic Claude Vision |
| Image processing | Sharp |
| Metadata | exifr |
| Testing | Vitest, Testing Library |

## Architecture overview

```text
app/
  page.tsx                 -> campaign dashboard
  login/page.tsx           -> authentication
  mission/page.tsx         -> cleanup mission
  verify/page.tsx          -> before/after verification
  impact/page.tsx          -> impact ledger

  api/
    campaign/route.ts      -> campaign snapshot
    submissions/route.ts   -> create submission
    upload-url/route.ts    -> retain private evidence
    verify/route.ts        -> verification endpoint

components/
  home-client.tsx
  mission-content.tsx
  verify-client.tsx
  impact-client.tsx
  funded-bar.tsx

lib/
  pipeline.ts              -> verification pipeline
  verdict.ts               -> verdict + funding logic
  phash.ts                 -> duplicate detection
  geotime.ts               -> EXIF scoring
  claude.ts                -> visual assessment
  services.ts              -> live/demo boundary
  supabase-store.ts        -> persistent data layer

supabase/
  schema.sql
  functions.sql
  seed.sql
```

## Local setup

### 1) Requirements

- Node.js **20.9+**
- npm
- Supabase credentials for persistent auth/storage
- Anthropic API key for live AI verification

### 2) Install dependencies

```bash
npm install
```

### 3) Run locally

```bash
npm run dev
```

Then open `http://localhost:3000`.

Without external credentials, Sprout runs using seeded demo data.

### 4) Configure live services

```bash
cp .env.local.example .env.local
```

Populate:

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

SPROUT_DATA_MODE=auto
SPROUT_AI_MODE=auto
```

Then apply:

```text
supabase/schema.sql
supabase/functions.sql
```

Optional demo seed:

```bash
npm run seed
```

### 5) Run tests

```bash
npm test
```

Production build:

```bash
npm run build
```

## Example user flows

### Verified cleanup flow
1. Open the featured cleanup mission.
2. Submit a before photo.
3. Complete the cleanup.
4. Submit a matching after photo.
5. Sprout checks duplicate, location, time, and visual signals.
6. On PASS, the user earns points and the campaign advances.
7. The verified action appears in the impact ledger.

### Fraud-rejection flow
1. Load intentionally reused evidence.
2. Run the same verification pipeline.
3. Duplicate signals trigger a rejection.
4. No points or sponsor progress are awarded.

## Future improvements

- support sponsor-created campaigns and missions
- add sponsor dashboards and downloadable impact reports
- integrate real funding and reward redemption
- move rate limiting to a distributed store
- add automatic evidence-retention policies
- strengthen manipulation and near-duplicate detection
- add end-to-end tests against staged live services
- support environmental actions beyond photo-based cleanups

## License

MIT
