# Sprout

**Small actions. Verified impact. Real momentum.**

Sprout is a Fetch Rewards-style climate action app. Students complete simple local environmental missions, submit before-and-after proof, earn points and perks, and move sponsor-funded community goals. Its core product is **verified-impact escrow**: sponsor value advances only when evidence passes a server-authoritative verification pipeline.

## What works

- Real before/after image uploads with decoded-byte, format, dimension, pixel, and 10 MB validation
- Private evidence retention in Supabase Storage
- Campaign, user, submission, verdict, points, and coupon persistence in Supabase Postgres
- One Claude multimodal request comparing both photos, with strict `{ confidence, rationale }` parsing
- Perceptual-hash duplicate checks plus EXIF location/time soft signals
- Atomic, idempotent database finalization of progress, points, coupon, hashes, and submission state
- Automatic local demo fallback when either service is missing or unavailable
- Four responsive routes with Framer Motion, confetti, reduced-motion support, and accessible controls
- A legitimate 37→38 flow and a staged duplicate/out-of-area rejection flow

## Quick start in local demo mode

No credentials are required:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With missing credentials, the header shows **Seeded demo** and all state stays in the local server process.

## Configure the live Claude + Supabase stack

Sprout activates live mode only when **both** services are configured. It does not expose either server key to the browser.

### 1. Create `.env.local`

```powershell
Copy-Item .env.local.example .env.local
```

Fill in:

```dotenv
# Anthropic server credentials
ANTHROPIC_API_KEY=sk-ant-your-key
# Use a vision-capable model available to your Anthropic account.
# If omitted, Sprout defaults to claude-sonnet-4-5.
ANTHROPIC_MODEL=claude-sonnet-4-5

# Supabase project settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-or-secret-key

# Automatically choose live or fallback mode
SPROUT_DATA_MODE=auto
SPROUT_AI_MODE=auto
```

Security rules:

- Never prefix `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` with `NEXT_PUBLIC_`.
- Never commit `.env.local`; it is ignored by Git.
- Use a dedicated hackathon/demo Supabase project for the seeded reset.
- Restart the Next.js process after changing environment values.

### 2. Apply the Supabase schema

In the Supabase SQL editor, run these files in order:

1. `supabase/schema.sql`
2. `supabase/functions.sql`

The schema creates the private `cleanup-photos` bucket, tables, indexes, RLS posture, and fields used by the app. The functions file installs restricted service-role RPCs for atomic pass/reject persistence.

### 3. Seed the live demo

```powershell
npm run seed
```

This uploads the checked-in PNG evidence fixtures to the private bucket, computes their real perceptual hashes, and creates the canonical 37/100 campaign, demo user, coupon, pending submission, and fraud sample.

You can alternatively run `supabase/seed.sql` in the SQL editor first, but `npm run seed` is still recommended because SQL alone cannot upload the image objects.

### 4. Run

```powershell
npm run dev
```

The header should show **Supabase live**. If it shows **Seeded demo**, configuration is missing or either mode variable is forcing demo. If it shows **Fallback demo**, a configured service failed and Sprout opened its five-minute safety circuit. Fix the service and restart the process to retry immediately.

## Fallback policy

- Missing Supabase or Claude configuration selects local demo mode before any workflow begins.
- A Supabase read/upload/write failure or Claude timeout/API/malformed-response failure opens a five-minute circuit and switches the complete workflow to local fallback mode.
- Validation failures and low-confidence Claude verdicts do not trigger fallback; they return normal user-facing rejection states.
- A seeded AI result never finalizes the Supabase-funded ledger. The database RPC requires `assessor_source = 'claude'`.
- The local store is process-memory state. It is reliable for the single-process hackathon demo and resets when the server restarts.

To deliberately force offline mode:

```dotenv
SPROUT_DATA_MODE=demo
SPROUT_AI_MODE=seeded
```

## Recommended demo path

1. Start at `/` and frame the sponsor problem: organizations get promises and PDFs, not action-level proof.
2. Open **Do this cleanup** and show the 2× boost and before-first integrity measure.
3. Continue to `/verify`. Seeded live data includes a before photo already secured; an unseeded project starts at before capture.
4. Click **Verify my cleanup** to show upload, duplicate, metadata, and Claude comparison stages.
5. Read the rationale, show +160 points and the café coupon, then click **Watch the funded bar move**.
6. Open `/impact` to show the retained sponsor proof ledger and Kiro development story.
7. Optional: open `/verify?scenario=fraud` for the deterministic duplicate + out-of-area rejection. This special judge demo stays local and never touches live sponsor progress.

## Architecture

```text
Next.js App Router UI
  ├─ /                campaign, wallet, tasks, community proof
  ├─ /mission         mission guidance + sponsor contribution
  ├─ /verify          real photo capture + verdict + rewards
  └─ /impact          retained sponsor ledger + Kiro story
          │ multipart image bytes / JSON
Next.js server routes
  ├─ GET/POST /api/campaign
  ├─ POST     /api/upload-url     (server-side private upload)
  ├─ POST     /api/submissions
  └─ POST     /api/verify
          │
Verification pipeline
  validation → pHash → EXIF/geo/time → Claude → composite verdict
          │
  ┌───────┴────────────────┐
SupabaseRepository       DemoStore
(private durable data)   (automatic local fallback)
```

Important implementation files:

- `lib/claude.ts` — image normalization, Claude request, response validation, seeded error result
- `lib/supabase-store.ts` — private storage, durable reads/writes, evidence loading, pipeline adapter
- `lib/services.ts` — live selection, workflow fallback, and circuit breaker
- `lib/runtime-mode.ts` — secret-safe configuration and mode resolution
- `lib/pipeline.ts` — fixed server-authoritative verification order
- `supabase/functions.sql` — atomic idempotent reward finalization

Points never alter sponsor progress. One accepted cleanup always counts as exactly one funded unit; points and multipliers provide the consumer reward layer.

## Validation

```powershell
npm test
npm run build
```

The integration was also manually validated with actual multipart PNG bytes in forced demo mode and with deliberately unreachable service endpoints to confirm `fallback-demo` behavior.

## How Kiro was used

- **Kiro Plan tool:** analyzed the concept, repository state, hackathon constraints, and competing scope choices. The planning record is in `PLANNING_NOTES.md`.
- **Kiro Specs:** `.kiro/specs/sprout-verified-cleanup/` records requirements, design, correctness properties, and task ordering.
- **Kiro Steering:** `.kiro/steering/design-system.md` kept the visual roles, accessibility rules, mobile behavior, and animation priorities consistent.
- **Agentic implementation:** repository exploration, pure verification logic, API and service adapters, UI implementation, production builds, live HTTP-flow validation, and screenshot QA were carried through as one traced workflow.
- **Strategic fallback design:** real integrations remain the primary path without making the stage demo dependent on network health.

## Honest product boundaries

- Sponsor names, offers, coupon, and money are illustrative seeded data; no partnership or redeemability is claimed.
- No real payment moves in this MVP.
- Private evidence is sent to Anthropic for analysis when Claude mode is live. A production launch needs explicit consent, retention, and deletion policies.
- The hardcoded demo user is appropriate for the hackathon, not multi-user production. Add Supabase Auth before public deployment.
- AI verification raises the cost of cheating; it does not make photo evidence fraud-proof.
