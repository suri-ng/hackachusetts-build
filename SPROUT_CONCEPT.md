# Sprout — Concept Brief (Working Draft)

> **Status:** Ideation locked on direction, scope being finalized. No code yet.
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
2. **AI verification is assistive, not fraud-proof.** Before/after photos can be staged or reused. Claude gives confidence + rationale and flags obvious mismatches (different location, trash still present, staged). Frame it as "raising the cost of cheating," not "fraud-proof." Metadata/geotag/timestamp checks are an obvious next layer, not built for MVP.
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
- **Supabase** — database, auth, photo storage
- **Claude multimodal API** — before/after image assessment
- **Next.js API routes** — backend logic

---

## 9. Proposed MVP scope (to be finalized)

**Mission type:** ONE — litter cleanup of a defined area, before/after photos.

**Hero of demo:** Sponsor (campaign funded by a seeded sponsor, shown from student capture side).

**Likely screens (tentative, ~4):**
1. **Home / Campaign** — the sponsor's funded progress bar (hero), goal + threshold, community progress, a "verify a cleanup" CTA.
2. **Mission detail** — instructions, what to photograph (before/after), the sponsor, the reward pool.
3. **Verify** — upload before + after → Claude assessment with confidence + rationale → accept/reject → animated contribution to the funded bar.
4. **Impact** — verified cleanups so far, community total, the sponsor's progress toward payout.

**Must-have:** before/after upload, Claude assessment with confidence + rationale, the funded progress bar animation, one seeded sponsor campaign, verified-cleanup history.

**Mock / simplified:** auth (single demo user or magic link), sponsor (seeded, no dashboard), escrow/payout (seeded "pool unlocked" state), XP (secondary signal, not the headline).

**Cut:** leaderboards, badges, levels, streaks, multiple mission types, real payments, EXIF/geo fraud detection, organizer dashboard.

---

## 10. OPEN QUESTION (not yet decided)

**Does the threshold payout resolve into a real redeemable reward, or stay abstract?**

- **Option A — Real seeded reward:** hitting the threshold unlocks a tangible shop discount/coupon shown as a card (seeded, not actually redeemable). Pro: tangible payoff, plants the business model. Con: extra surface.
- **Option B — Abstract payout:** threshold hit shows a "reward pool unlocked / funds released to cleanup effort" state. Pro: simpler, keeps focus on the escrow mechanic. Con: less tangible.

**Decision pending — flag for team discussion.**

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
- [ ] Resolve open question (real reward vs. abstract payout)
- [ ] Finalize minimum screens + exact end-to-end journey
- [ ] Lock must-have vs. mock vs. cut
- [ ] Then: Quick Spec / implementation (NOT before the above)

> Still in ideation + requirements refinement. No code, files, implementation plans, or Quick Specs until scope is agreed.
