# Sprout — Concept Brief (Working Draft)

> **Status:** Scope locked. Security & anti-fraud layer added to MVP. Implementation started (Next.js scaffold in progress).
> **Event:** One-day hackathon · Energy & Climate Tech track.
> **Read this first** if you're a teammate (or a teammate's Kiro) joining the project.

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
Student picks a cleanup mission → cleans a real area
        │
        ▼
Uploads BEFORE + AFTER photos
        │
        ▼
Claude verifies: is it the same spot? is trash actually gone? staged/faked?
        │  (returns confidence score + one-line rationale)
        ▼
Verified cleanup fills the sponsor's FUNDED progress bar
        │
        ▼
Threshold hit → "reward pool unlocked" moment
```

The demo centerpiece: **submit → Claude verifies with visible rationale → the sponsor's funded bar ticks up → threshold hit → pool unlocked.**

---

## 6. Honest limitations (say these out loud in the pitch)

Being upfront about these builds credibility rather than losing it.

1. **No real money moves in the MVP.** Pledge/escrow is seeded data with a visible "funds released" state. The *mechanic* is the pitch; real payouts (Stripe etc.) are deferred.
2. **AI verification is assistive, not fraud-proof.** Before/after photos can be staged or reused. Claude gives confidence + rationale and flags obvious mismatches (different location, trash still present, staged). Frame it as "raising the cost of cheating," not "fraud-proof."
   **Update:** a scoped anti-fraud layer is now IN the MVP (see section 9a). EXIF/geotag/timestamp is read as a *soft signal* (missing metadata lowers the integrity score but does not auto-reject), combined with perceptual-hash duplicate detection and a server-enforced composite verdict. Still not fraud-proof — it raises the cost of cheating.
3. **Two-sided marketplace, one actor in the demo.** We seed ONE sponsor campaign and demo from the student's side, with the sponsor's funded bar visible. No sponsor dashboard gets built.

---

## 7. What verification can and can't prove

- **Can reasonably assess:** a littered area in the "before," a visibly cleaner same-looking area in the "after," gross mismatches, obviously staged/stock imagery.
- **Can't prove from photos alone:** exact location truth, timestamp truth, that the same person did both, that trash wasn't just moved out of frame. (Future: EXIF/geotag/timestamp.)
- **Mission choice reflects this:** we deliberately pick **litter cleanup of a defined area (before/after)** because the photo genuinely *is* the evidence — unlike "turned off lights" or "biked to class," which a photo can't confirm.

---

## 8. Tentative tech stack

Optimized for one-day speed and demo reliability. Can be simplified further.

- **Next.js / React** (mobile-first, highly animated)
- **Supabase** — database, auth, photo storage (RLS + signed upload URLs)
- **Claude multimodal API** — before/after image assessment (server-side only)
- **Next.js API routes** — backend logic + server-enforced verification pipeline
- **sharp + pHash** — perceptual-hash duplicate-photo detection
- **exifr** — EXIF / GPS / timestamp extraction for the geo/time soft-signal check
- **Vitest** — unit / component / e2e tests for the verification pipeline

---

## 9. Proposed MVP scope (to be finalized)

**Mission type:** ONE — litter cleanup of a defined area, before/after photos.

**Hero of demo:** Sponsor (campaign funded by a seeded sponsor, shown from student capture side).

**Likely screens (tentative, ~4):**
1. **Home / Campaign** — the sponsor's funded progress bar (hero), goal + threshold, community progress, a "verify a cleanup" CTA.
2. **Mission detail** — instructions, what to photograph (before/after), the sponsor, the reward pool.
3. **Verify** — upload before + after → Claude assessment with confidence + rationale → accept/reject → animated contribution to the funded bar.
4. **Impact** — verified cleanups so far, community total, the sponsor's progress toward payout.

**Must-have:** before/after upload, Claude assessment with confidence + rationale, the funded progress bar animation, one seeded sponsor campaign, verified-cleanup history, plus the anti-fraud layer (section 9a): EXIF/geo soft-signal check, pHash duplicate detection, server-enforced composite verdict + atomic/idempotent bar increment, a seeded staged fraud submission, and platform hardening (server-only keys, storage RLS + signed URLs, upload validation, rate limiting).

**Mock / simplified:** auth (single demo user or magic link), sponsor (seeded, no dashboard), escrow/payout (seeded "pool unlocked" state), XP (secondary signal, not the headline).

**Cut:** leaderboards, badges, levels, streaks, multiple mission types, real payments, organizer dashboard. (Note: EXIF/geo fraud detection moved OUT of cut and into the MVP as a scoped soft-signal check — see section 9a.)

---

## 9a. Security & anti-fraud layer (in scope)

Every security feature here strengthens the core differentiator — making the sponsor's dollar provably tied to a real cleanup. All anti-fraud signals live **inside** the Verify step and feed **one combined integrity verdict** shown alongside Claude's rationale. **No new screens**; the funded progress bar stays the centerpiece.

**Three visible anti-fraud checks (in the Verify step):**
1. **EXIF/geo soft-signal check** — GPS inside the mission area + before/after timestamp proximity. Missing metadata lowers the score but **never auto-rejects** (demo-safe, since phone uploads often strip EXIF).
2. **Duplicate-photo detection (pHash)** — perceptual-hash every upload; reject photos reused from prior submissions or seeded stock imagery.
3. **Server-enforced composite verdict** — the bar increments and the pool unlocks **only** when the backend confirms Claude confidence AND the integrity checks. Atomic + idempotent, so no double-counting. Nothing trusts the client:
   `finalVerdict = f(claudeConfidence, geoScore, timeScore, duplicateFlag)`.

**Invisible platform hardening (no new screens):**
- Claude API key server-side only (never in the client bundle)
- Supabase storage access control / RLS + signed upload URLs
- Upload input validation (file type, size)
- Submission rate limiting

**Pipeline order (one `POST /api/verify`):** input validation (type/size + rate limit) → pHash duplicate check → EXIF/geo/time extract + score → Claude multimodal assess → composite verdict → if pass: atomic idempotent bar increment → threshold check → "pool unlocked" state; if fail: reject with reasons.

**Demo moment:** a seeded **reused + out-of-area** "fraud attempt" is visibly caught and rejected on stage (flagged by duplicate + geo), while a legit cleanup is accepted and moves the funded bar.

---

## 10. OPEN QUESTION (not yet decided)

**Does the threshold payout resolve into a real redeemable reward, or stay abstract?**

- **Option A — Real seeded reward:** hitting the threshold unlocks a tangible shop discount/coupon shown as a card (seeded, not actually redeemable). Pro: tangible payoff, plants the business model. Con: extra surface.
- **Option B — Abstract payout:** threshold hit shows a "reward pool unlocked / funds released to cleanup effort" state. Pro: simpler, keeps focus on the escrow mechanic. Con: less tangible.

**Decision pending — flag for team discussion.** (Current build assumes **Option B / abstract "pool unlocked"** state until decided.)

---

## 11. Guardrails for this build

- Prioritize ONE polished, fully-working end-to-end flow over feature quantity.
- Don't reintroduce multiple unrelated mission types — breadth is the enemy of a one-day build.
- Don't let XP/points become the headline; the **funded, verified progress bar** is the emotional and technical centerpiece.
- Lead the pitch with the **verified-impact escrow** mechanic, not "AI checks photos."

---

## 12. Status / next steps

- [x] Direction chosen: sponsor-funded verified-cleanup escrow
- [x] Demo hero chosen: sponsor
- [x] Security & anti-fraud layer scoped and locked (see section 9a)
- [x] Must-have vs. mock vs. cut locked (security moved into must-have)
- [x] Implementation started: Next.js scaffold + secure config baseline
- [ ] Resolve open question (real reward vs. abstract payout — build assumes Option B for now)
- [ ] Finalize minimum screens + exact end-to-end journey
- [ ] Complete verification pipeline (pHash, EXIF/geo, Claude, composite verdict, bar increment)

> Scope agreed and implementation underway. The anti-fraud layer is built inside the single Verify flow; the funded progress bar remains the centerpiece.
