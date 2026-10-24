### Explain the problem

Climate funding has a last-mile proof problem. Sponsors can fund cleanups and sustainability programs, but often receive participation counts or reports instead of action-level proof that each dollar produced real environmental work. At the same time, students lack immediate incentives to take small climate actions.

**Sprout turns sustainability budgets into verified local impact:** sponsors pledge toward a measurable goal, and progress advances only when a real cleanup is verified.

Our app not only **helps environmental organizations show concrete impact to sponsors hence securing future fundings** but motivates everyday citizens to contribute to environmental services—**and get recognized.**

### Describe the features and functionality of your Project

Sprout is a rewards app for verified climate action.

A student chooses a cleanup mission, locks in a **before photo**, completes the cleanup, and submits an **after photo**. Sprout runs a server-authoritative verification pipeline using image validation, perceptual-hash duplicate detection, EXIF location/time signals, and Claude multimodal comparison.

When verified:

- **1 cleanup = 1 auditable impact unit**
- The sponsor-funded bar advances: for example, **$500 toward 100 verified cleanups**
- The student receives **points, sponsor multipliers, and a first-cleanup café reward**
- Sponsors get a retained proof trail instead of a trust-based impact report

Fraudulent or reused evidence is rejected without moving sponsor progress. This creates a scalable incentive loop: **climate action → proof → reward → measurable sponsor impact.**

### How did you use Kiro to build your project?

We used **Kiro IDE, Quick Spec, Steering, Plan Mode, sub-agents, checkpoints, and correctness/property-based testing** as a complete end-to-end development workflow.

**Quick Spec:** We turned Sprout’s core idea into the `.kiro/specs/sprout-verified-cleanup/` spec: `requirements.md`, `design.md`, and `tasks.md`. Instead of loosely implementing “AI-verified cleanups,” Kiro forced us to define exact invariants: a PASS moves sponsor progress by exactly one, a REJECT moves it by zero, duplicate evidence rejects, the first-cleanup coupon is awarded once, and repeated/concurrent verification cannot double-count a submission. `design.md` then converted those requirements into the fixed pipeline **validation → duplicate detection → geo/time → Claude → server verdict**, while `tasks.md` gave us an implementation order.

**Steering:** Our always-on `.kiro/steering/design-system.md` kept Kiro consistent across UI work. It defined Sprout as a **mobile-first consumer rewards app**, made the funded progress bar the visual centerpiece, assigned green to verified/progress states and earth tones to the coupon, required `prefers-reduced-motion`, and reserved the 37→38 funded-bar animation as the main demo beat. This prevented different Kiro sessions from producing disconnected styles.

**Plan Mode:** We used Plan Mode to inspect the existing repo before making changes and captured the result in `PLANNING_NOTES.md`. Kiro identified what was already implemented versus stubbed, then helped us lock scope for a one-day hackathon. A major decision was to keep **one real verified-cleanup/sponsor flow** while making additional tasks and sponsors a presentation layer. It also separated sponsor accounting from gamification: points and the **2× multiplier** could reward the user, but could never determine whether the funded bar advanced. That decision became `lib/points.ts` plus the server-authoritative verification flow.

**Sub-agents:** We delegated independent reviews instead of asking one conversation to reason about the entire product. A reward-integrity review focused specifically on replay/double-award risks and surfaced the danger of the same verified submission crediting progress or rewards multiple times. We addressed that with the `counted` guard and idempotent `finalizePass`/`increment_progress` path. `lib/pipeline.test.ts` now verifies that **five repeated requests still produce one increment**, and even **eight concurrent verification requests result in exactly one counted submission** and zero extra points. A separate usability review helped us keep verification understandable to students, reflected in the Verify UI's **“Why before-first?”** explanation and **“Private proof”** assurance.

**Checkpoints:** We used Kiro checkpoints around high-risk verification and reward changes so we could experiment without losing a known-good implementation. Our planning document also deliberately marks development checkpoints after the core data/verification layer, after the complete demo loop, and before the final build. We used those recovery points while iterating on anti-fraud and reward behavior; we did not need to restore a failed checkpoint.

**Correctness / Property-Based Testing:** We used Kiro to test rules that must hold across many inputs—not whether Claude “understands” every possible photograph. Our deterministic property harness in `lib/test-support/property.ts` runs generated cases with reproducible seeds. Tests exercise properties such as duplicate hashes always rejecting, funded-bar ratios staying bounded, milestones resolving correctly, geo/time scores remaining valid, and rejected submissions awarding nothing. For reward integrity, we combined those properties with repeated/concurrent pipeline tests to enforce the key rule: **a verified submission can contribute rewards and sponsor progress at most once; rejected or replayed submissions contribute zero.**

Kiro gave us a traceable workflow from **product idea → specification → scoped plan → specialized review → implementation → correctness tests**, which was significantly faster and safer than independently prompting for features and stitching them together afterward.

### Video URL

https://www.youtube.com/watch?v=NxQ9FZDpnw8

### Additional info

**Live demo:** https://hackachusetts-build.vercel.app/

**Track:** Energy & climate tech

**Source Code:** https://github.com/suri-ng/hackachusetts-build

Sprout is built with Next.js/TypeScript, Supabase, and Claude multimodal vision. The repository includes the required root `.kiro` directory with our specs and development artifacts. Sponsor offers and monetary values in the MVP are illustrative; no real payment is processed.
