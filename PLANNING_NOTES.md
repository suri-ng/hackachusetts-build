# Sprout — Planning Notes

> **Produced with the Kiro Plan tool.** This document records that the Kiro Plan
> tool was used to plan the remaining Sprout build, and captures the full plan it
> produced. `SPROUT_CONCEPT.md` remains the product source-of-truth brief; this
> file is the implementation planning record.

---

## How this plan was produced

- **Tool:** Kiro Plan tool (planning/analysis mode — read & analyze only, no code edits).
- **Inputs:** `SPROUT_CONCEPT.md`, the existing `.kiro/specs/sprout-verified-cleanup`
  spec (`requirements.md`, `design.md`, `tasks.md`, `tasks.meta.json`), the
  `.kiro/steering/design-system.md`, and a direct read of the current repo state
  (scaffold, `lib/` stubs, `supabase/` SQL, API route stubs, screens).
- **New product direction folded in:** make Sprout feel like Fetch Rewards —
  constant simple tasks, multiple sponsors/nonprofits/groups, sponsor-funded
  point multipliers, limited-time seasonal/event tasks, heavy gamification with
  bouncy/fluid/cute animations and a clean minimalist style.

---

## Decisions (locked for this one-day hackathon MVP)

1. **Gamified skin, same core.** Keep ONE real verified cleanup mission + ONE
   real sponsor flowing through the live Claude/Supabase pipeline (de-risked,
   half-built). Present all additional breadth — task catalog, extra sponsors,
   seasonal/event tasks, multipliers — as a seeded/mocked presentation layer on
   top of the same data and pipeline.
2. **Funded bar stays the centerpiece; points layered on.** The sponsor funded
   bar is the hero and the pitch. A Fetch-style points wallet + sponsor
   multiplier is the gamification wrapper. One verified cleanup simultaneously
   moves the funded bar (+1 unit, server-authoritative) AND credits points with
   a visible sponsor multiplier (presentation-derived, never gates the bar).
3. **Framer Motion + canvas-confetti.** Standardized for the bouncy/cute/fluid
   feel, the bar climb, the coupon pop, and the confetti hero beat.
   `prefers-reduced-motion` fallbacks required (already stubbed in globals.css).

---

## Current state (verified by reading the repo)

- Scaffold EXISTS and builds: Next.js App Router + TS (strict) + Supabase + Vitest.
  `package.json` deps include `@anthropic-ai/sdk`, `@supabase/supabase-js`,
  `sharp`, `exifr`. The `SPROUT_CONCEPT.md` "docs-only" claim is stale — real
  code exists.
- **Task 1 done** — scaffold, route skeletons, lib skeletons, globals.css design
  tokens, `scaffold.test.ts` passing.
- **Task 2 done (SQL authored)** — `supabase/schema.sql` (tables + RLS + storage
  bucket), `supabase/functions.sql` (`increment_progress` atomic/idempotent),
  `supabase/seed.sql` (campaign 500/100/37, before_committed submission,
  staged-fraud submission, coupon). `scripts/seed.ts` runner is still a
  `not_implemented` stub, and the SQL has not been applied to a live project.
- **Everything else is stubbed** (`throw new Error('not_implemented')`):
  `lib/verdict.ts`, `lib/phash.ts`, `lib/geotime.ts`, `lib/claude.ts`,
  `lib/pipeline.ts`, all three API routes, all four screens.
- No gamification concepts exist yet (no points, multipliers, task catalog,
  multiple sponsors, seasonal tasks).

---

## Scope additions to the existing spec (the gamified layer)

These extend, not replace, the locked requirements. `requirements.md`,
`design.md`, and `tasks.md` should be updated to record them, framed explicitly
as seeded/presentation so the "scope locked" integrity is preserved.

- **Points wallet** — running balance derived from verified cleanups. Pure
  `pointsForCleanup(base, multiplier)` + `walletTotal(...)` in a new `lib/points.ts`.
- **Sponsor multiplier** — each seeded sponsor/task can carry a multiplier (e.g.
  2x). The real campaign's mission shows its multiplier; a verified cleanup
  animates "+X points (2x sponsor bonus!)".
- **Task catalog** — seeded task cards (constant simple tasks like "pick up
  trash" + seasonal/event tasks with a limited-time countdown badge). Only the
  one real cleanup task wires to the live Verify flow; the rest are visibly
  "coming soon / seeded."
- **Sponsor carousel** — multiple seeded sponsor campaigns on Home; only the
  hero campaign (GreenLeaf Co.) is live.
- **Gamified components** — animated points counter, multiplier badge,
  seasonal/event task card with limited-time styling, confetti on the hero pass.
  No leaderboards/levels/streaks (stays within the spec's non-goals).

---

## Task breakdown

Continues the existing spec numbering. Optional sub-tasks marked `*`. The
demoable backbone (real escrow loop) is finished before the gamified breadth is
added; gamification is wired into the same increments so nothing is orphaned.

- [ ] **2.4 — Implement `scripts/seed.ts` runner + apply SQL to Supabase.**
  Apply `schema.sql` → `functions.sql` → `seed.sql` with the service-role key;
  add `.env.local.example` entries if missing; verify `npm run seed` resets to
  canonical state. _Demo:_ live DB with the 37/100 campaign, before_committed
  submission, and staged-fraud row.

- [ ] **3 — Pure verdict core (`lib/verdict.ts`).**
  `compositeVerdict` (hard-fail on duplicate; weighted composite, dominant Claude
  weight; reasons `low_confidence`/`out_of_area`/`time_mismatch`; geo/time soft,
  never alone reject), `unlockedValue`, `fillRatio`, `nextMilestone`.
  Tests: Properties 1, 4, 5, 9.

- [ ] **3b (NEW) — Pure points core (`lib/points.ts`).**
  `pointsForCleanup(base, multiplier)`, `walletTotal(verifiedCount, base,
  multiplier)`. Server/seed-defined constants, never client-supplied; never gates
  the funded-bar increment. Tests: linear in count and multiplier; multiplier 1 =
  base.

- [ ] **4 — Pure anti-fraud signal core.**
  - 4.1 `lib/phash.ts` — `perceptualHash`, `hammingDistance`, `isDuplicate`.
  - 4.3 `lib/geotime.ts` — `extractExif`, `geoTimeScore` (missing EXIF → neutral,
    never auto-reject; monotonic). _Softening target #1._
  - 4.7 `lib/claude.ts` — `assessWithClaude` + deterministic seeded fallback.
  Tests: Properties 13–17.

- [ ] **5 — Verification pipeline (`lib/pipeline.ts`).**
  `runVerification` in fixed §9a order: validation (type/size + rate limit,
  fail-fast) → pHash → EXIF/geo/time → Claude → `compositeVerdict`. On PASS:
  `increment_progress` → threshold check → pool-unlocked → first-cleanup coupon
  (at-most-once) → `state=complete`. On REJECT: reasons, progress untouched.
  Confidence + rationale on BOTH outcomes. Return points fields (verified count,
  multiplier) for client wallet animation. Tests: Properties 2, 3, 8, 10, 11, 12,
  18, 19, 20.

- [ ] **6 — Checkpoint: pure core + data layer verified.** All `lib/`/SQL tests
  pass; pause for questions.

- [ ] **7 — API route handlers.**
  - 7.1 `POST /api/upload-url` — validate type/size, return signed upload URL.
  - 7.2 `POST /api/verify` (State B) + State A before-commit creation; after-upload
    with no committed before rejected with a prompt.
  - 7.3 `GET /api/campaign` — campaign state + latest-verified feed + seeded
    sponsor/task/multiplier catalog.
  Tests: Properties 6, 7 + before-commit guard + signed-URL/RLS smoke.

- [ ] **8 — Campaign Home (`/`), animated hero, NEVER cut.**
  - 8.1 Sponsor identity + pledge; animated **Funded_Bar** (Framer Motion fill,
    markers 25/50/75/100, unlocked $, next-milestone label); 37→38 climb + confetti
    on return from a pass; latest-verified feed; "Verify a cleanup" CTA. Install
    `framer-motion` + `canvas-confetti`.
  - 8.1b (gamified) Animated points wallet counter, sponsor multiplier badge,
    seeded sponsor carousel, seasonal/event task card with limited-time styling.
  Tests: campaign fields/markers/feed/CTA render; bar fill proportional; wallet +
  multiplier render.

- [ ] **9 — Verify screen (`/verify`), two-state engine, animated.**
  - 9.1 State A (before-commit → "locked in" + timestamp, bouncy confirm). State B
    (upload after → `/api/verify` → confidence + rationale on pass AND reject). On
    pass: success + confetti + café coupon card pop + "+X points (2x!)" → hand back
    to Home for the bar tick. On reject: rationale, bar unchanged, bouncy retry.
  Tests: State A/B; pass success + coupon + points; reject rationale + retry + bar
  unchanged.

- [ ] **10 — Mission Detail (`/mission`).**
  - 10.1 Instructions, before/after guidance, sponsor, multiplier, contribution,
    CTA → Verify; bouncy card styling matching the catalog.
  Tests: content + CTA render.

- [ ] **11 — Checkpoint: end-to-end demoable slice complete.** Hero loop (clean →
  verify → coupon + points + bar climb) + staged-fraud reject working; pause.

- [ ] **12 — Staged-fraud + legit-pass end-to-end wiring.**
  - 12.1 Seeded fraud rejected live with both `duplicate_photo` + `out_of_area`,
    bar + points unchanged; seeded legit passes, bar + points advance.
  Tests: fraud reason set + bar unchanged; legit pass + bar advances.

- [ ] **13 (optional, FIRST TO CUT) — Impact screen (`/impact`).**
  - 13.1* Proof trail: verified cleanups, points wallet history, community total,
    sponsor progress toward payout. Fold into Home if time is short.
  - 13.2* Tests: content renders.

- [ ] **14 — Final checkpoint:** all tests pass, build clean, demo rehearsed.

---

## Degrade-gracefully order

1. Soften EXIF/geo to neutral 0.5 (pipeline shape intact).
2. Reduce seasonal/sponsor-carousel breadth to static images.
3. Cut the Impact screen (fold into Home).
4. **NEVER** cut: the funded-bar animation, the coupon pop, the pass/reject
   rationale. Points/multiplier animation rides the funded-bar beat, so it
   survives as long as the hero moment does.

## Verification approach

`npm test` (Vitest) after each `lib`/API task; `npm run build` before each
checkpoint; `npm run seed` to confirm resettable demo state. Property tests cover
the brief's focus areas (verdict, pipeline order, idempotent increment) plus the
new points math.

---

## Implementation record

The seeded hackathon MVP described above has now been implemented. It includes the four responsive routes, animated funded bar, points and multiplier layer, two-state before/after flow, success/coupon reveal, staged fraud rejection, sponsor proof trail, Kiro development story, upload validation, server-authoritative demo APIs, and a credential template.

The live Claude vision and Supabase retention adapters were implemented afterward at the project owner's request. Sprout now sends real before/after image bytes through a server-side Claude multimodal request and retains private photos, submissions, verdicts, campaign progress, points, and coupon state in Supabase. The complete live stack activates in `auto` mode only when both services are configured and healthy; otherwise a circuit breaker keeps the workflow in coherent local demo mode. See `README.md` for setup and fallback behavior.
