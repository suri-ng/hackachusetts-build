# Requirements Document

## Introduction

Sprout turns a sponsor's sustainability budget into provable, AI-verified real-world cleanups. A sponsor pledges a reward pool toward a cleanup goal; students perform litter cleanups of a defined area and upload before/after photos; a server-side verification pipeline (perceptual-hash duplicate detection, EXIF/geo/time soft-signal scoring, and a Claude multimodal assessment with a safety fallback) produces a composite integrity verdict. Each verified cleanup atomically and idempotently advances the sponsor's funded progress bar toward a payout threshold, and a student's first verified cleanup unlocks a seeded local café coupon.

The core value is **verified-impact escrow**: sponsor money is tied to AI-verified before/after proof rather than a trust-based report. The funded progress bar is the product centerpiece and its animation is the hero moment of the demo.

This is a one-day hackathon build. The repository is docs-only, so the TypeScript (Next.js / React) scaffold must be recreated. Many actors and flows are intentionally mocked or seeded (hardcoded demo user, seeded sponsor, seeded pool-unlocked payout). This document specifies the observable behavior of the system; implementation choices (the "how") are deferred to design.

## Glossary

- **Sprout_System**: The overall Sprout application, comprising the Next.js/React client and its server-side API routes and data layer.
- **Campaign_Home**: The hero screen showing the sponsor campaign, the funded progress bar with milestone markers, the latest-verified feed, and the primary "Verify a cleanup" call to action.
- **Mission_Detail_Screen**: The screen describing the cleanup mission, what to photograph, the sponsor, and the cleanup's contribution.
- **Verify_Screen**: The two-state screen where a student commits a before photo (State A) and later uploads an after photo to trigger verification (State B).
- **Impact_Screen**: The proof-trail screen showing the student's verified cleanups, the community total, and the sponsor's progress toward payout.
- **Verification_Pipeline**: The server-side process behind a single `POST /api/verify` request that validates input, detects duplicates, scores geo/time signals, performs Claude assessment, computes a composite verdict, and updates state.
- **Claude_Assessor**: The server-side Claude multimodal assessment step that evaluates the before and after photos together.
- **Composite_Verdict**: The server-computed pass/review/reject decision derived from Claude confidence, geo score, time score, and duplicate flag, expressed as `finalVerdict = f(claudeConfidence, geoScore, timeScore, duplicateFlag)`.
- **Pending_Review**: A no-reward state for borderline, non-duplicate evidence; the exact pair is frozen until an authorized reviewer decides it or the owner withdraws.
- **Authorized_Reviewer**: An operator authenticated by a server-only bearer token; this role has an API but no product dashboard.
- **Funded_Bar**: The communal progress bar representing `progress ÷ threshold`, framed in the sponsor's money.
- **Sponsor_Campaign**: The seeded conditional pledge defined by pool, threshold, and progress, with milestone markers at 25, 50, 75, and 100.
- **Pool**: The money/value the sponsor puts up (seeded value $500).
- **Threshold**: The number of verified cleanups that unlocks the pool (seeded value 100).
- **Progress**: The count of verified cleanups so far (seeded starting value 37).
- **Milestone_Markers**: Fixed visual markers on the Funded_Bar at 25, 50, 75, and 100 verified cleanups.
- **Submission**: A student's cleanup attempt, holding its before photo, after photo, and state.
- **Submission_State**: The lifecycle state of a Submission, one of `before_committed`, `pending_review`, or `complete`.
- **Café_Coupon**: The seeded, non-redeemable local café coupon awarded to a student on their first verified cleanup.
- **Demo_User**: The single hardcoded student account used for the demo; no real login exists.
- **pHash_Check**: The perceptual-hash duplicate-photo detection step.
- **Geo_Time_Score**: The soft-signal integrity score derived from EXIF GPS location and before/after timestamp proximity.
- **Seed_Script**: The versioned SQL seed script, run against the data store, that establishes and resets demo data.

## Requirements

### Requirement 1: Verified-impact escrow core

**User Story:** As a sponsor, I want my pledged money released only as AI-verified cleanups accumulate, so that every dollar is provably tied to real before/after evidence rather than a trust-based report.

#### Acceptance Criteria

1. THE Sprout_System SHALL tie the unlocked value of the Pool to the count of verified cleanups, computed as `Pool × (Progress ÷ Threshold)`.
2. WHEN a cleanup Submission passes the Verification_Pipeline, THE Sprout_System SHALL increment Progress by exactly one unit.
3. IF a cleanup Submission does not pass the Verification_Pipeline, THEN THE Sprout_System SHALL leave Progress unchanged.
4. THE Sprout_System SHALL count each verified cleanup as exactly one unit toward Threshold, independent of assessed cleanup magnitude.

### Requirement 2: Sponsor campaign model

**User Story:** As a sponsor, I want my pledge expressed as a pool, a threshold, and current progress with milestone markers, so that supporters see real stakes and a near-term goal.

#### Acceptance Criteria

1. THE Sponsor_Campaign SHALL store a Pool value, a Threshold value, and a Progress value.
2. THE Campaign_Home SHALL display the Pool, the Threshold, the Progress, and the unlocked value computed as `Pool × (Progress ÷ Threshold)`.
3. THE Funded_Bar SHALL render fill proportional to `Progress ÷ Threshold`.
4. THE Funded_Bar SHALL render Milestone_Markers at 25, 50, 75, and 100 verified cleanups.
5. THE Campaign_Home SHALL display the next unreached Milestone_Marker relative to the current Progress.

### Requirement 3: Single mission type and two-step submission

**User Story:** As a student, I want to commit a before photo first and then upload an after photo, so that my cleanup of a defined litter area is captured as credible before/after evidence.

#### Acceptance Criteria

1. THE Sprout_System SHALL offer exactly one mission type: litter cleanup of a defined area using before and after photos.
2. WHEN a student uploads a before photo on the Verify_Screen, THE Sprout_System SHALL create a Submission, record a commit timestamp, and set Submission_State to `before_committed`.
3. WHILE a Submission is in Submission_State `before_committed`, THE Verify_Screen SHALL present State B prompting the student to upload an after photo.
4. WHEN a student uploads an after photo for a Submission in Submission_State `before_committed` and the Submission passes the Verification_Pipeline, THE Sprout_System SHALL set Submission_State to `complete`.
5. IF a student attempts to upload an after photo before a before photo is committed, THEN THE Sprout_System SHALL reject the after upload and prompt the student to commit a before photo first.
6. WHEN borderline non-duplicate evidence requires review, THE Sprout_System SHALL atomically set Submission_State to `pending_review`, freeze the assessed pair, and award no points, coupon, or Progress.
7. WHILE Submission_State is `pending_review`, THE Sprout_System SHALL reject evidence replacement and re-verification; an authorized denial or authenticated owner withdrawal SHALL return the same Submission to `before_committed` for a new after photo.

### Requirement 4: Verification pipeline order and endpoint

**User Story:** As a sponsor, I want every cleanup checked by a single server-enforced pipeline in a fixed order, so that only genuinely verified cleanups advance my funded bar.

#### Acceptance Criteria

1. THE Verification_Pipeline SHALL expose a single server-side endpoint `POST /api/verify`.
2. WHEN a verification request is received, THE Verification_Pipeline SHALL execute its steps in the order: input validation, pHash_Check, EXIF/geo/time extraction and scoring, Claude_Assessor assessment, Composite_Verdict computation.
3. WHEN the Composite_Verdict is `pass`, THE Verification_Pipeline SHALL atomically and idempotently complete the Submission, increment Progress, award configured points, apply the first-cleanup coupon rule, and update pool-unlocked state.
4. WHEN the Composite_Verdict is `review`, THE Verification_Pipeline SHALL freeze the non-duplicate evidence in `pending_review` and leave every reward and Progress unchanged.
5. WHEN the Composite_Verdict is `reject`, THE Verification_Pipeline SHALL return the contributing reasons and leave the same before commit retryable without rewards.
6. IF the duplicate flag is true, THE Composite_Verdict SHALL always be `reject` and SHALL never be human-approvable.
7. THE Verification_Pipeline SHALL compute pass/review/reject on the server from Claude confidence, Geo_Time_Score components, and the duplicate flag, without trusting client-supplied verdict or reward data.

### Requirement 5: Input validation and rate limiting

**User Story:** As a platform operator, I want uploads validated and submissions rate limited, so that malformed or abusive requests are rejected before costly processing.

#### Acceptance Criteria

1. WHEN a verification request is received, THE Verification_Pipeline SHALL validate the uploaded file type and file size before any further step.
2. IF an uploaded file fails type or size validation, THEN THE Verification_Pipeline SHALL reject the request and return a validation reason.
3. WHEN the submission rate for the Demo_User exceeds the configured rate limit, THE Verification_Pipeline SHALL reject the request and return a rate-limit reason.

### Requirement 6: Duplicate-photo detection

**User Story:** As a sponsor, I want reused or stock photos detected, so that a cleanup cannot be claimed twice from the same imagery.

#### Acceptance Criteria

1. WHEN the Verification_Pipeline reaches the pHash_Check step, THE Verification_Pipeline SHALL compute a perceptual hash for each uploaded photo.
2. IF an uploaded photo's perceptual hash matches a prior submission's photo or seeded stock imagery, THEN THE Verification_Pipeline SHALL set the duplicate flag and reject the Submission with a duplicate reason.

### Requirement 7: EXIF/geo/time soft-signal scoring

**User Story:** As a sponsor, I want location and timing signals factored into the verdict as a soft signal, so that integrity is assessed without penalizing phones that strip metadata.

#### Acceptance Criteria

1. WHEN the Verification_Pipeline reaches the EXIF/geo/time step, THE Verification_Pipeline SHALL extract EXIF GPS location and timestamps from the uploaded photos where present.
2. THE Verification_Pipeline SHALL compute a Geo_Time_Score from GPS proximity to the mission area and from before/after timestamp proximity.
3. IF EXIF metadata is absent, THEN THE Verification_Pipeline SHALL lower the Geo_Time_Score and continue the pipeline without auto-rejecting the Submission.

### Requirement 8: Claude assessment with safety fallback

**User Story:** As a presenter, I want a live Claude assessment that falls back to a seeded verdict on failure, so that the hero moment never hard-fails during the demo.

#### Acceptance Criteria

1. WHEN the Verification_Pipeline reaches the Claude_Assessor step, THE Claude_Assessor SHALL submit the before and after photos together to the Claude multimodal model via a server-side call.
2. THE Claude_Assessor SHALL return a confidence score and a one-line rationale.
3. IF the Claude multimodal call returns an error or exceeds its timeout, THEN THE Claude_Assessor SHALL substitute a seeded verdict so that the Verification_Pipeline continues to completion.

### Requirement 9: Verdict and review feedback

**User Story:** As a student, I want a clear pass, review, or reject explanation and a recovery action when no reward is issued.

#### Acceptance Criteria

1. WHEN verification completes, THE Verify_Screen SHALL display a confidence score and one-line rationale for pass, review, and reject outcomes.
2. WHEN the Composite_Verdict is `reject`, THE Verify_Screen SHALL leave the Funded_Bar unchanged and offer an after-photo retry.
3. WHEN the Composite_Verdict is `review`, THE Verify_Screen SHALL show a warning-styled pending state, disclose authorized human inspection, show no reward, and offer authenticated owner withdrawal for retry.
4. WHILE review remains pending, THE Mission_Detail_Screen and Verify_Screen SHALL expose owner-visible status without adding a fifth product route.
5. WHEN the Composite_Verdict is `pass`, THE Verify_Screen SHALL display the rationale and success state.

### Requirement 10: Communal funded bar reward

**User Story:** As a student, I want my single verified cleanup to visibly move the sponsor's funded bar, so that I see my action contribute to a shared, real-stakes goal.

#### Acceptance Criteria

1. WHEN a Submission passes the Verification_Pipeline, THE Campaign_Home SHALL animate the Funded_Bar from the prior Progress to the new Progress.
2. THE Funded_Bar SHALL count each verified cleanup as one unit toward Threshold with no magnitude weighting.
3. WHEN Progress reaches Threshold, THE Sprout_System SHALL enter the seeded pool-unlocked state.

### Requirement 11: Personal café coupon reward

**User Story:** As a student, I want a real-feeling café coupon after my first verified cleanup, so that the loop delivers a tangible personal payoff.

#### Acceptance Criteria

1. WHEN the Demo_User's first cleanup passes the Verification_Pipeline, THE Sprout_System SHALL award the seeded Café_Coupon to the Demo_User.
2. WHEN the Café_Coupon is awarded, THE Verify_Screen SHALL present the Café_Coupon as a coupon card.
3. THE Sprout_System SHALL award the Café_Coupon only on the Demo_User's first verified cleanup and not on subsequent verified cleanups.
4. THE Sprout_System SHALL present the Café_Coupon as a seeded, non-redeemable reward.

### Requirement 12: Atomic idempotent progress increment

**User Story:** As a sponsor, I want progress increments to be atomic and idempotent, so that a verified cleanup is never double-counted.

#### Acceptance Criteria

1. WHEN an automatic pass or authorized human approval triggers Progress, THE database transition SHALL complete the Submission, apply the progress/points/coupon effects, and update pool state atomically.
2. IF automatic or human approval is retried or races for the same Submission, THEN THE database SHALL apply Progress and rewards at most once.
3. WHEN review is denied or withdrawn, THE transition SHALL award nothing and SHALL return the same Submission to `before_committed` with its original before evidence.

### Requirement 13: Platform hardening

**User Story:** As a platform operator, I want keys, storage, and uploads hardened, so that the verified-escrow mechanic cannot be bypassed from the client.

#### Acceptance Criteria

1. THE Sprout_System SHALL keep Claude, Supabase service-role, and reviewer bearer credentials server-side without a `NEXT_PUBLIC_` prefix.
2. THE Sprout_System SHALL keep evidence in a private bucket and perform owner-scoped upload/download operations through server-only code.
3. THE Sprout_System SHALL validate upload file type, decoded format, dimensions, pixel count, and file size before storing an upload.
4. THE `/api/review` endpoint SHALL fail closed unless a configured bearer token of at least 32 characters matches in constant time; request data SHALL NOT select reviewer identity.
5. AFTER reviewer authorization, live evidence SHALL be exposed only through read-only signed URLs that expire within five minutes.
6. THE versioned consent notice SHALL disclose Claude processing and exceptional inspection by an authorized human before evidence can enter review.

### Requirement 14: Four screens

**User Story:** As a presenter, I want four mobile-first screens that open and close on the sponsor, so that the demo frames the sponsor as hero while the student flow proves it.

#### Acceptance Criteria

1. THE Sprout_System SHALL provide a Campaign_Home presenting the sponsor identity, the pledge, the Funded_Bar with Milestone_Markers, a latest-verified-cleanups feed, and a "Verify a cleanup" call to action.
2. THE Sprout_System SHALL provide a Mission_Detail_Screen presenting the mission instructions, the before/after photo guidance, the sponsor, and the cleanup's contribution, with a call to action to the Verify_Screen.
3. THE Sprout_System SHALL provide one Verify_Screen route containing before commit, after upload, processing, pass/review/reject feedback, pending status, and owner withdrawal/retry states.
4. THE Sprout_System SHALL provide an Impact_Screen presenting the Demo_User's verified cleanups, the community total, and the sponsor's progress toward payout.

### Requirement 15: Seeded demo data and reset

**User Story:** As a presenter, I want versioned seeded demo data that can be reset between runs, so that each demo starts mid-flow and the staged-fraud case is available on stage.

#### Acceptance Criteria

1. THE Seed_Script SHALL create a Sponsor_Campaign with Pool 500, Threshold 100, and Progress 37.
2. THE Seed_Script SHALL create one Submission in Submission_State `before_committed` so the live demo starts mid-flow.
3. THE Seed_Script SHALL create a staged-fraud Submission that is both a reused photo and out of the mission area.
4. THE Seed_Script SHALL create the seeded Café_Coupon definition.
5. WHEN the Seed_Script is re-run, THE Seed_Script SHALL reset the demo data to its seeded starting values.

### Requirement 16: Staged-fraud detection on stage

**User Story:** As a presenter, I want the seeded fraud attempt visibly caught while a legitimate cleanup is accepted, so that the anti-fraud layer is demonstrated live.

#### Acceptance Criteria

1. WHEN the staged-fraud Submission is run through the Verification_Pipeline, THE Verification_Pipeline SHALL reject it and return the duplicate reason and the out-of-area reason.
2. WHEN the staged-fraud Submission is rejected, THE Sprout_System SHALL leave the Funded_Bar unchanged.
3. WHEN a legitimate Submission is run through the Verification_Pipeline, THE Verification_Pipeline SHALL pass it and advance the Funded_Bar.

### Requirement 17: Mocked actors and payout

**User Story:** As a builder, I want the non-core actors mocked, so that the one-day build focuses on the verified-escrow loop.

#### Acceptance Criteria

1. THE Sprout_System SHALL operate as a single hardcoded Demo_User without a real login flow.
2. THE Sprout_System SHALL present the Sponsor_Campaign from seeded data without a sponsor dashboard.
3. THE Sprout_System SHALL represent the payout as a seeded pool-unlocked state without processing real money.
4. WHERE XP is displayed, THE Sprout_System SHALL present XP as a secondary signal and not as the headline reward.

### Requirement 18: Explicit non-goals

**User Story:** As a builder, I want excluded features kept out, so that scope stays narrow enough for a one-day build.

#### Acceptance Criteria

1. THE Sprout_System SHALL exclude leaderboards, badges, levels, and streaks.
2. THE Sprout_System SHALL exclude mission types other than litter cleanup of a defined area.
3. THE Sprout_System SHALL exclude real payment processing and organizer/reviewer dashboards; the authenticated operator API SHALL NOT add a product screen.
4. THE Sprout_System SHALL exclude magnitude and tier scoring and real redeemable coupon codes.
5. Human review SHALL remain limited to borderline non-duplicate evidence and SHALL NOT override duplicate rejection.


### Requirement 19: Authorized review resolution

**User Story:** As a sponsor and student, I want borderline evidence resolved securely and exactly once, so that review cannot weaken the funded ledger.

#### Acceptance Criteria

1. GET and POST `/api/review` SHALL authenticate the operator before reading metadata, signing evidence, or mutating a Submission.
2. WHEN a non-duplicate Submission enters `pending_review`, THE database SHALL generate an immutable `review_id`, bind it to the current after reference plus persisted pHashes/metadata/verdict fields, and append a held audit row.
3. WHEN an Authorized_Reviewer approves a held Submission, the request SHALL include that `review_id` and one database transaction SHALL lock and match it, set the Submission to `complete`, increment Progress once, award configured points once, apply the first-cleanup coupon rule, and append an approval audit row.
4. WHEN an Authorized_Reviewer denies a held Submission using the matching `review_id`, the transaction SHALL award nothing, append reviewer audit attribution/time and the frozen after reference, preserve the committed before photo, clear the active after evidence, and return it to `before_committed`.
5. WHEN the authenticated owner withdraws a held Submission using its matching `review_id`, the transition SHALL append a withdrawal audit row, award nothing, and reopen that same committed-before Submission for a new after photo.
6. Repeated approval SHALL be idempotent; stale approve, deny, or withdrawal attempts SHALL not mutate evidence or rewards.
7. Mission and Verify SHALL expose pending or denied status and an appropriate recovery action without adding a reviewer dashboard or product route.
