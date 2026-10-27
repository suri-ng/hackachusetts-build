# Sprout — Concept Brief (Working Draft)

> **Status:** Live Claude vision, Supabase retention, and a secured human-review fallback are implemented with automatic local-demo fallback.
> **Event:** One-day hackathon · Energy & Climate Tech track.
> **Read this first** if you're a teammate (or a teammate's Kiro) joining the project.

> **What's actually in the repo right now:** a complete Next.js/TypeScript app with four responsive screens, real photo uploads, Claude before/after analysis, pass/review/reject triage, token-authorized review of borderline evidence, Supabase Storage/Postgres retention, points/multiplier gamification, anti-fraud checks, atomic reward finalization, and automatic local fallback. Credentials and the Supabase schema still need to be configured per `README.md` and `.env.local.example`.

---

## 1. One-liner

**Sprout turns a sponsor's sustainability budget into provable, AI-verified real-world cleanups.**

A sponsor (local shop, university sustainability office, or environmental group) pledges a reward pool toward a cleanup goal. Students go clean a littered area and upload before/after photos. Claude's vision model verifies each cleanup. Every verified cleanup fills the sponsor's funded progress bar toward a payout threshold.

---

## 2. The core differentiator (read this carefully)

The before/after cleanup + AI verification mechanic is **NOT** our differentiator. It already exists many times over — #trashtag (viral since 2019), plus recent builds like EcoHunt/TrashTitans, Sweepify, LitterLoot, LitterTrace, xLitter, Litterbugs, CleanCoin, ecosnap. Treat AI before/after verification as **table stakes**, not the pitch.

Our actual differentiator is **verified-impact escrow**:

> **Sponsor money is pledged against a goal and unlocks only as AI-verified cleanups hit the threshold — so the dollar is provably tied to a real before/after, not a trust-based report.**

### Why this is a real gap (from research)
- **Consumer cleanup apps** (Litterati, etc.) have verification + data, but **no sponsor-funds-a-threshold mechanic**. Litterati monetizes by selling aggregated litter *data* to brands/cities.
- **Corporate/nonprofit cleanup sponsorship** (Surfrider, National CleanUp Day) is big but runs on **manual, trust-based partnerships**: write a check, get a logo on a banner and an after-the-fact PDF report.
- The documented pain: sponsors now demand **verified impact and measurable unit economics**, and **~half don't renew** because the impact data is weak.
- **Nobody has connected the two layers** — automated per-action verification feeding an automatic funding/payout mechanic. That's the space we own.

Sources (for the curious): #trashtag (Wikipedia), EcoHunt (Devpost), Litterati (litterati.org), ocean-plastic corporate partnership playbooks (ecodrive.community). Research summarized/rephrased for licensing compliance.

---

## 3. Who it's for

Two-sided, but we pick a hero for the demo.

| Side | Who | Their pain |
|------|-----|-----------|
| **Demand (pays) — HERO** | Local shops, university sustainability offices, environmental groups | Can't verify their money produced real results → fund cautiously, rarely renew |
| **Supply (does the work)** | Massachusetts university students / clubs | Willing to clean up but have no funding, recognition, or way to prove their work |

**Demo hero = the SPONSOR.** The walkthrough is framed around the sponsor's unmet, monetizable need: provable, attributable impact. The student app is the capture front-end that produces that proof.

---

## 4. Positioning summary

- **Problem statement:** Organizations that want to fund local cleanups can't verify that their money produced real results, so they fund cautiously and rarely renew — while students who'd happily clean up have no funding, recognition, or reason to prove their work.
- **Value proposition:** Sprout lets a sponsor pledge money toward a cleanup goal and releases it only as AI-verified before/after cleanups hit the threshold — turning sustainability budgets into provable, counted real-world results.
- **Memorable differentiator:** **Verified-impact escrow.** "Pledge $500 for 100 verified cleanups" — and watch the bar fill with real, AI-checked evidence.
- **Why users return:** Students return because a real funded pool is being filled by the whole community and their verified cleanup moves it. Sponsors return because they get a live, credible proof trail instead of a trust-me PDF.

---

## 5. The reward loop

```
Sponsor pledges pool toward a goal (e.g. $500 for 100 verified cleanups)
        │
        ▼
Student picks a cleanup mission
        │
        ▼
Uploads BEFORE photo FIRST → it is committed + timestamped (submission now "pending")
        │
        ▼
Student cleans the area, then returns
        │
        ▼
Uploads AFTER photo → submission is complete → sent to Claude
        │
        ▼
Claude verifies: is it the same spot? is trash actually gone? staged/faked?
        │  (returns confidence score + one-line rationale)
        ▼
Verified cleanup → 2 things happen at once:
   • COMMUNAL: sponsor's funded bar ticks up toward the threshold
   • PERSONAL: student unlocks a milestone reward (e.g. café coupon)
        │
        ▼
Threshold hit → "reward pool unlocked" moment
```

The demo centerpiece: **submit → Claude verifies with visible rationale → the student gets a real coupon AND the sponsor's funded bar ticks up → (eventually) threshold hit → pool unlocked.**

---

## 5a. Reward system (how points/thresholds/coupons actually work)

There are **two layers** of reward, and they're deliberately kept separate:

### Layer 1 — Communal funded bar (the SPONSOR story)
- A sponsor makes a **conditional pledge** defined by three numbers:
  - **Pool** — money/value the sponsor puts up (e.g. **$500**).
  - **Threshold (goal)** — how many verified cleanups unlock it (e.g. **100**).
  - **Progress** — verified cleanups so far (e.g. **37 / 100**).
- The **funded bar** = `progress ÷ threshold`, framed in the sponsor's money so it feels like real stakes.
- **Binary counting: 1 verified cleanup = 1 unit.** No magnitude scoring, no small-vs-big weighting. (See note below on why.)
- **Milestone markers** sit on the bar at 25 / 50 / 75 / 100 so there's always a near-term goal, not just one distant payout.

```
MASSPIRG — Clean Amherst Commons
$500 reward pool · unlocks at 100 verified cleanups

[██████████░░░░░░░░░░░░░░░░░░]  37 / 100 verified
$185 of $500 unlocked      next milestone: 50
```

### Layer 2 — Personal milestone coupons (the STUDENT payoff)
- Tied to **your own** verified-cleanup count, not the community's.
- **1st verified cleanup → a real (seeded) local café coupon.** This is the tangible payoff that makes the loop satisfying.
- A later personal milestone shows a slightly better perk as a "keep going" carrot.
- The communal bar (Layer 1) still ticks up in parallel from the same single action — so one cleanup produces both a personal reward and communal progress.

### Why ONE system, no tiers
We are NOT building small-task vs. big-task reward tiers for the MVP. Tiering would force Claude to *estimate magnitude* ("how much trash was removed?"), which is far less reliable than a binary "cleaned: yes/no," and it invites gaming and balancing headaches. Keeping it binary also gives the sponsor clean unit economics ("$500 → 100 verified cleanups = $5 each, here's the proof"). 
- **Say this in the pitch:** "Every verified cleanup counts as one unit today; weighting cleanups by assessed magnitude is the deliberate next version." That reads as maturity, not a gap.

### What the small reward is
**A local café coupon** (e.g. "$1 off" or "free drip coffee with any purchase"). Chosen because: coffee is the universal student currency, it's believable as a real local-shop offer, it reinforces the "local shops benefit" side of the pitch, and it renders beautifully as a seeded coupon card. It is **seeded/mocked** (not a real redeemable code) — say so in the pitch.

### Demo rule for rewards
Make the **first milestone reachable in a single cleanup**, so the demo shows the full loop (clean → verify → coupon unlocked) without faking 25 submissions. The bigger milestones (25/50/100) appear as visible markers on the bar for the story, but only the first one needs to fire live.

---

## 6. Honest limitations (say these out loud in the pitch)

Being upfront about these builds credibility rather than losing it.

1. **No real money moves in the MVP.** Pledge/escrow is seeded data with a visible "funds released" state. The *mechanic* is the pitch; real payouts (Stripe etc.) are deferred.
2. **AI verification is assistive, not fraud-proof.** Before/after photos can be staged or reused. Claude gives confidence + rationale and flags obvious mismatches (different location, trash still present, staged). Frame it as "raising the cost of cheating," not "fraud-proof."
   **Update:** a scoped anti-fraud layer is now IN the MVP (see section 9a). EXIF/geotag/timestamp is read as a *soft signal* (missing metadata lowers the integrity score but does not auto-reject), combined with perceptual-hash duplicate detection and a server-enforced composite verdict. Still not fraud-proof — it raises the cost of cheating.
3. **Two-sided marketplace, one actor in the demo.** We seed ONE sponsor campaign and demo from the student's side, with the sponsor's funded bar visible. No sponsor dashboard gets built.

---

## 6a. Screens & demo journey

### Hero vs. instrument (resolves the "sponsor hero + student phone" tension)
The **sponsor is the hero of the NARRATIVE**; the **student phone is the INSTRUMENT** that proves it. Open and close the demo on the sponsor's funded campaign (their money, goal, proof trail). In the middle, pick up the student phone to show *how a verified cleanup is created*, then cut back to the sponsor's bar moving. The student flow exists to make the sponsor's proof tangible — not to be the star.

### Screens (4, mobile-first)

1. **Campaign Home (hero screen)** — sponsor name/logo, the pledge ("$500, unlocks at 100 verified cleanups"), the **funded progress bar** with milestone markers (25/50/75/100) and "$X of $500 unlocked," a live "latest verified cleanups" feed, and the primary CTA **"Verify a cleanup."** Demo starts and ends here.
2. **Mission Detail** — what to do, what to photograph (before + after of the same spot), the sponsor, what your cleanup contributes. CTA → Verify.
3. **Verify (the engine) — TWO states:**
   - **State A (Before):** "Upload your before photo to start." Upload → "Before locked in at 2:14pm. Go clean, then come back." Submission becomes `before_committed` (pending).
   - **State B (After):** returning to a pending submission → "Upload your after photo" → submit → Claude verifies before+after together → **confidence + one-line rationale shown either way** → clear passes unlock the reward; duplicates/conclusive failures reject with retry; borderline non-duplicate evidence is frozen in `pending_review` with no reward and an owner withdrawal/retry option.
4. **Impact / Proof trail** — your verified cleanups, the community total, the sponsor's progress toward payout, framed as the **credible proof trail a sponsor gets instead of a PDF.** This screen sells the sponsor value even though a student holds the phone.

### End-to-end demo script
1. **Open on Campaign Home.** "MASSPIRG pledged $500, released only when 100 cleanups are *verified*. They're at 37, $185 unlocked — all backed by before/after proof, not a report." (Sponsor = hero in 10s.)
2. **Tap "Verify a cleanup" → Mission Detail → Verify.** Pick up the student-phone framing: "Here's how a cleanup becomes proof."
3. **Before-first:** show the before already locked in (see demo trick below), describe the go-clean-and-return step verbally.
4. **Upload the after → submit.**
5. **Claude returns confidence + rationale** read aloud ("same spot, trash removed, not staged — 0.91, verified"). This preempts the fraud question by *showing* the assistive check.
6. **The hero moment fires:** success animation → **personal café coupon pops** (student reward) → cut back to **Campaign Home** where the **funded bar animates 37 → 38** and dollars unlocked tick up (sponsor proof).
7. **Tap Impact.** "This is what the sponsor actually buys — a live, verifiable proof trail. The $500-check-and-a-PDF world can't give them this."

Open on sponsor, close on sponsor. Student flow is the bridge.

### The single most impressive demo moment
**Step 6:** the instant Claude's rationale returns and the funded bar climbs with real dollars unlocking while the coupon pops. Money-meets-proof in one animated beat. **All polish budget goes here.**

### Seeded "before already committed" demo trick
Because the two-step flow has a real-world gap (go clean, come back), seed ONE submission already in the `before_committed` state. On stage you only upload the after and trigger verification — no awkward "imagine time passed." Describe the before-first step while showing it; complete it live.

### Scope fallback
Four screens + Claude + Supabase + a genuinely polished animated bar is a full one-day build. If time gets tight, **cut the Impact screen (#4) first** — fold its "proof trail" content into Campaign Home. **Never** cut the funded-bar animation; that *is* the product. Ship 3 beautiful screens over 4 rough ones.

---

## 7. What verification can and can't prove

- **Can reasonably assess:** a littered area in the "before," a visibly cleaner same-looking area in the "after," gross mismatches, obviously staged/stock imagery.
- **Can't prove from photos alone:** exact location truth, timestamp truth, that the same person did both, that trash wasn't just moved out of frame. (Future: EXIF/geotag/timestamp.)
- **Mission choice reflects this:** we deliberately pick **litter cleanup of a defined area (before/after)** because the photo genuinely *is* the evidence — unlike "turned off lights" or "biked to class," which a photo can't confirm.

### Two-step "before-first" commit (anti-staging measure)
The before photo is uploaded and **committed/timestamped FIRST**, before the cleanup happens. The after is uploaded only after the student returns. This raises the cost of the classic staging scam (find a clean spot → dump trash → shoot "before" → remove your own trash → shoot "after"), because the before is locked in up front rather than fabricated after the fact alongside the after.
- **Honest framing (say it this way):** "Committing the before first raises the cost of staging. It is NOT fraud-proof — timestamp / geolock / same-device checks are the next layer." Do not claim this prevents fraud; it just makes cheating harder.
- **What it does NOT prove:** location continuity (before at spot A, after at spot B) or that the same mess was actually cleaned. Still assistive, not conclusive.
- **Submission gains one guarded hold state:** `before_committed` awaits or retries an after photo, `pending_review` freezes an inconclusive pair, and `complete` is terminal after an automatic or human approval. Review status and withdrawal stay inside the existing Mission/Verify screens; no dashboard or fifth product route is added.

---

## 8. Implemented tech stack

Optimized for one-day speed and demo reliability. The app automatically uses Claude plus Supabase when both are configured and healthy; missing credentials or service failures switch the complete workflow to the local seeded demo.

- **Next.js / React** (mobile-first, highly animated)
- **Supabase** — database, auth, photo storage (RLS + signed upload URLs)
- **Claude multimodal API** — before/after image assessment (server-side only)
- **Next.js API routes** — backend logic + server-enforced verification pipeline
- **sharp + pHash** — perceptual-hash duplicate-photo detection
- **exifr** — EXIF / GPS / timestamp extraction for the geo/time soft-signal check
- **Vitest** — unit / component / e2e tests for the verification pipeline

---

## 9. MVP scope — FINALIZED

**Mission type:** ONE — litter cleanup of a defined area, before/after photos.

**Hero of demo:** Sponsor (campaign funded by a seeded sponsor, shown from student capture side).

**Screens (4):** see §6a for the full breakdown + demo script.
1. **Campaign Home** — sponsor's funded progress bar (hero), goal/threshold, milestone markers, community feed, "verify a cleanup" CTA.
2. **Mission Detail** — instructions, what to photograph (before/after), the sponsor, the reward pool.
3. **Verify (existing route, four stages)** — commit BEFORE, upload AFTER, run Claude/integrity checks, then render pass/review/reject. Pass reveals coupon + contribution; reject offers retry; review shows a warning hold with no reward and lets the owner withdraw for clearer photos.
4. **Impact / proof trail** — verified cleanups, community total, sponsor's progress toward payout. (First to cut if time-constrained — fold into Campaign Home.)

### Must-have (the demo breaks without these)
- Before-first / after upload with guarded transitions (`before_committed` → `pending_review` or `complete`).
- **Claude assessment** returning confidence + one-line rationale for pass, review, and reject.
- **Reject / review recovery handled gracefully** — show the rationale, never advance the funded bar without approval, let rejects retry immediately, and let owners withdraw pending evidence to retry.
- **Funded progress bar animation** (the hero moment — gets the polish budget).
- **One seeded sponsor campaign** (pool, threshold, current progress, milestone markers).
- **Personal milestone café coupon** firing on the first verified cleanup.
- **Verified-cleanup history** (feeds the community feed + Impact/proof trail).
- **Seeded `before_committed` submission** so the live demo starts mid-flow.
- **Anti-fraud layer (see §9a):** EXIF/geo soft-signal check, pHash duplicate detection, server-enforced composite verdict + atomic/idempotent bar increment, a seeded staged fraud submission, and platform hardening (server-only keys, storage RLS + signed URLs, upload validation, rate limiting).

### Mock / simplified
- **Auth → hardcoded demo user, no real login** (primary choice; magic link is a stretch goal only — avoid email/deliverability risk on demo day).
- **Sponsor → seeded, no dashboard** (demoed from the student side).
- **Escrow / payout → seeded "pool unlocked" state** (no real money, no Stripe).
- **XP → secondary signal, not the headline** (optional to show at all).

### Cut entirely
Leaderboards, badges, levels, streaks, multiple mission types, real payments, organizer/reviewer dashboards, magnitude/tier scoring, and real redeemable coupon codes. A token-protected server API for exceptional review is allowed, but it is not a product screen and never overrides duplicate rejection.

---

## 9a. Security & anti-fraud layer (in scope)

Every security feature here strengthens the core differentiator — making the sponsor's dollar provably tied to a real cleanup. All anti-fraud signals live **inside** the Verify step and feed **one combined integrity verdict** shown alongside Claude's rationale. **No new screens**; the funded progress bar stays the centerpiece.

**Three visible anti-fraud checks (in the Verify step):**
1. **EXIF/geo soft-signal check** — GPS inside the mission area + before/after timestamp proximity. Missing metadata lowers the score but **never auto-rejects** (demo-safe, since phone uploads often strip EXIF).
2. **Duplicate-photo detection (pHash)** — perceptual-hash every upload; reject photos reused from prior submissions or seeded stock imagery.
3. **Server-enforced composite verdict** — the bar increments and the pool unlocks **only** when the backend confirms Claude confidence AND the integrity checks. Atomic + idempotent, so no double-counting. Nothing trusts the client:
   `finalVerdict = f(claudeConfidence, geoScore, timeScore, duplicateFlag)`.

**Invisible platform hardening (no new screens):**
- Claude and Supabase service credentials stay server-side
- Private Supabase storage with owner-scoped server uploads/downloads
- Versioned consent covers Claude plus exceptional authorized human inspection
- `SPROUT_REVIEW_TOKEN` is a 32+ character server-only bearer secret; missing/invalid authorization reveals nothing
- Review reads use five-minute, read-only signed URLs for the exact held objects
- Pending state blocks evidence replacement or re-verification; a generated `review_id` binds every decision to that exact hold
- Append-only `review_audit` rows preserve held/approved/denied/withdrawn history across retries
- Upload validation and submission rate limiting

**Pipeline order (one `POST /api/verify`):** input validation (ownership/state/type/size/rate) → pHash duplicate check → EXIF/geo/time score → Claude multimodal assessment → composite outcome. Pass uses atomic idempotent finalization; duplicate/conclusive failure rejects with reasons; borderline non-duplicate evidence is atomically frozen in `pending_review` with zero reward. A separate bearer-token operator API may approve or deny that exact held pair, while the owner may withdraw it for retry.

**Demo moment:** a seeded **reused + out-of-area** "fraud attempt" is visibly caught and rejected on stage (flagged by duplicate + geo), while a legit cleanup is accepted and moves the funded bar.

---

## 10. RESOLVED: is the reward real or abstract?

**The old open question:** when someone finishes a cleanup, do they get something *real* (an actual coupon they could use) or something *pretend* (just an on-screen "pool released" message)?

**Resolved → REAL, and early.** The milestone-coupon design answers it: the student gets a real (seeded) local café coupon after their **first** verified cleanup, instead of waiting for the final threshold. So:
- **Personal reward = real (seeded) café coupon**, delivered at an early milestone.
- **Communal payout = the "pool unlocked" state** at the final threshold (seeded, no real money moves).

Both exist; they're the two layers in §5a. No remaining open question here.

---

## 11. Guardrails for this build

- Prioritize ONE polished, fully-working end-to-end flow over feature quantity.
- Don't reintroduce multiple unrelated mission types — breadth is the enemy of a one-day build.
- Don't let XP/points become the headline; the **funded, verified progress bar** is the emotional and technical centerpiece.
- Lead the pitch with the **verified-impact escrow** mechanic, not "AI checks photos."
- Keep human review exceptional and server-operated: no organizer/reviewer dashboard or fifth product route.

---

## 12. Status / next steps

- [x] Direction chosen: sponsor-funded verified-cleanup escrow
- [x] Demo hero chosen: sponsor
- [x] Reward model decided: communal funded bar + personal milestone café coupon; binary 1-cleanup-1-unit, no tiers
- [x] Reward real-vs-abstract question resolved: real (seeded) coupon, delivered early
- [x] Two-step before-first/after verification flow decided (anti-staging)
- [x] Screens + end-to-end demo journey finalized (§6a): 4 screens, sponsor-hero/student-instrument, hero moment = step 6
- [x] Security & anti-fraud layer scoped and locked (§9a); EXIF/geo + pHash + server-enforced verdict moved into must-have
- [x] Must-have vs. mock vs. cut LOCKED (§9) — incl. reject-path handling + hardcoded demo user
- [x] **Ideation + requirements refinement COMPLETE**
- [x] Next.js scaffold + responsive four-screen UI implemented
- [x] Seeded server-authoritative verification flow implemented (pass, review, reject, points, coupon, and funded-bar animation)
- [x] Pending review hardened with frozen evidence, token-authorized five-minute reads, atomic decisions, owner status/withdrawal, and no-reward holds
- [x] pHash, EXIF/geo/time, composite verdict, upload validation, rate limiting, and idempotent demo finalization implemented
- [x] Fetch-style task catalog, sponsor multiplier, points wallet, and illustrative seasonal tasks implemented
- [x] Claude multimodal before/after analysis implemented with strict response parsing and timeout fallback
- [x] Supabase private photo storage, Postgres repository, atomic finalization RPC, and seed uploader implemented
- [x] Missing/failed service configuration automatically falls back to a coherent local demo workflow
- [ ] Configure project credentials, apply `supabase/schema.sql` + `supabase/functions.sql`, then run `npm run seed`

> The app is complete and runs either on the live Claude/Supabase stack or without credentials in local demo mode. `README.md` contains setup, fallback behavior, the walkthrough, and the Kiro development record. The funded progress bar remains the centerpiece.
