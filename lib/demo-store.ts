import { randomUUID } from 'node:crypto';
import {
  DEMO_CAMPAIGN,
  DEMO_COUPON,
  DEMO_FEED,
  DEMO_IDS,
  DEMO_SPONSORS,
  DEMO_TASKS,
  DEMO_USER,
} from './demo-data';
import type {
  CampaignPayload,
  FeedItem,
  ReviewDecisionResult,
  ReviewQueueClaim,
  ReviewStatusView,
  VerificationResult,
} from './domain';
import type {
  PipelineDeps,
  PipelineSubmission,
} from './pipeline';
import { pointsForCleanup } from './points';
import { unlockedValue } from './verdict';

type DemoScenario = 'legit' | 'fraud' | 'review';

export class DemoOwnershipError extends Error {
  constructor() {
    super('This cleanup does not belong to the signed-in account.');
    this.name = 'DemoOwnershipError';
  }
}

export class DemoTransitionError extends Error {
  constructor(message = 'This cleanup is no longer in that state.') {
    super(message);
    this.name = 'DemoTransitionError';
  }
}

interface StoredSubmission extends PipelineSubmission {
  scenario: DemoScenario;
  committedAt: string;
  reviewId?: string;
  reviewDecision?: 'approved' | 'denied' | 'withdrawn';
  reviewedBy?: string;
  reviewedAt?: string;
  lastResult?: {
    pass: boolean;
    confidence: number;
    rationale: string;
    reasons: string[];
  };
}

interface DemoState {
  campaign: typeof DEMO_CAMPAIGN;
  user: typeof DEMO_USER;
  feed: FeedItem[];
  submissions: Map<string, StoredSubmission>;
  attemptTimes: Map<string, number[]>;
}

declare global {
  // eslint-disable-next-line no-var
  var __sproutDemoState: DemoState | undefined;
}

function copyCampaign(): typeof DEMO_CAMPAIGN {
  return { ...DEMO_CAMPAIGN, milestones: [...DEMO_CAMPAIGN.milestones] };
}

function copyUser(): typeof DEMO_USER {
  return { ...DEMO_USER };
}

function makeState(): DemoState {
  const committedAt = new Date().toISOString();
  const submissions = new Map<string, StoredSubmission>();
  submissions.set(DEMO_IDS.pendingSubmission, {
    id: DEMO_IDS.pendingSubmission,
    userId: DEMO_IDS.user,
    campaignId: DEMO_IDS.campaign,
    beforeRef: 'demo://photos/amherst-before',
    afterRef: null,
    state: 'before_committed',
    counted: false,
    scenario: 'legit',
    committedAt,
  });
  submissions.set(DEMO_IDS.fraudSubmission, {
    id: DEMO_IDS.fraudSubmission,
    userId: DEMO_IDS.user,
    campaignId: DEMO_IDS.campaign,
    beforeRef: 'demo://photos/reused-stock',
    afterRef: 'demo://photos/reused-stock',
    state: 'before_committed',
    counted: false,
    scenario: 'fraud',
    committedAt,
  });
  submissions.set(DEMO_IDS.reviewSubmission, {
    id: DEMO_IDS.reviewSubmission,
    userId: DEMO_IDS.user,
    campaignId: DEMO_IDS.campaign,
    beforeRef: 'demo://photos/borderline-before',
    afterRef: 'demo://photos/borderline-after',
    state: 'before_committed',
    counted: false,
    scenario: 'review',
    committedAt,
  });

  return {
    campaign: copyCampaign(),
    user: copyUser(),
    feed: DEMO_FEED.map((item) => ({ ...item })),
    submissions,
    attemptTimes: new Map(),
  };
}

function state(): DemoState {
  globalThis.__sproutDemoState ??= makeState();
  return globalThis.__sproutDemoState;
}

function moneyUnlocked(progress: number): number {
  return Number(
    unlockedValue(DEMO_CAMPAIGN.pool, progress, DEMO_CAMPAIGN.threshold).toFixed(2),
  );
}

function demoReviewStatus(current: DemoState, ownerId: string): ReviewStatusView | undefined {
  const submissions = [...current.submissions.values()].filter(
    (submission) => submission.userId === ownerId,
  );
  const pending = submissions
    .filter((submission) => submission.state === 'pending_review' && !submission.counted)
    .sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0];
  if (pending) {
    return {
      submissionId: pending.id,
      reviewId: pending.reviewId ?? '',
      status: 'pending',
      rationale: pending.lastResult?.rationale ?? 'This cleanup is awaiting review.',
      updatedAt: pending.committedAt,
    };
  }

  const decided = submissions
    .filter((submission) => submission.reviewDecision === 'approved' || submission.reviewDecision === 'denied')
    .sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? ''))[0];
  if (!decided || (decided.reviewDecision !== 'approved' && decided.reviewDecision !== 'denied')) {
    return undefined;
  }
  return {
    submissionId: decided.id,
    reviewId: decided.reviewId ?? '',
    status: decided.reviewDecision,
    rationale: decided.lastResult?.rationale ?? (
      decided.reviewDecision === 'approved'
        ? 'An authorized reviewer approved this cleanup.'
        : 'An authorized reviewer requested a clearer after photo.'
    ),
    updatedAt: decided.reviewedAt ?? decided.committedAt,
  };
}

export function getDemoSnapshot(
  mode: 'seeded-demo' | 'fallback-demo' = 'seeded-demo',
  ownerId: string = DEMO_IDS.user,
): CampaignPayload {
  const current = state();
  const pendingSubmission = [...current.submissions.values()]
    .filter((submission) =>
      submission.userId === ownerId &&
      submission.state === 'before_committed' &&
      !submission.counted &&
      submission.afterRef === null &&
      submission.scenario !== 'fraud' &&
      submission.scenario !== 'review')
    .sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0];
  const reviewStatus = demoReviewStatus(current, ownerId);
  return {
    campaign: {
      ...current.campaign,
      milestones: [...current.campaign.milestones],
    },
    user: { ...current.user },
    feed: current.feed.map((item) => ({ ...item })),
    tasks: DEMO_TASKS.map((task) => ({ ...task })),
    sponsors: DEMO_SPONSORS.map((sponsor) => ({ ...sponsor })),
    coupon: { ...DEMO_COUPON },
    pendingSubmissionId: pendingSubmission?.id ?? '',
    fraudSubmissionId: DEMO_IDS.fraudSubmission,
    ...(reviewStatus ? { reviewStatus } : {}),
    mode,
    aiMode: 'seeded',
    generatedAt: new Date().toISOString(),
  };
}

export function resetDemoStore(): CampaignPayload {
  globalThis.__sproutDemoState = makeState();
  return getDemoSnapshot();
}

export function createDemoSubmission(
  beforeRef: string,
  ownerId: string = DEMO_IDS.user,
): {
  id: string;
  state: 'before_committed';
  committedAt: string;
} {
  if (!beforeRef.startsWith('demo://uploads/')) {
    throw new Error('Invalid demo upload reference.');
  }
  const id = randomUUID();
  const committedAt = new Date().toISOString();
  state().submissions.set(id, {
    id,
    userId: ownerId,
    campaignId: DEMO_IDS.campaign,
    beforeRef,
    afterRef: null,
    state: 'before_committed',
    counted: false,
    scenario: 'legit',
    committedAt,
  });
  return { id, state: 'before_committed', committedAt };
}

export function attachDemoAfter(
  submissionId: string,
  afterRef: string,
  ownerId: string = DEMO_IDS.user,
): boolean {
  if (!afterRef.startsWith('demo://')) return false;
  const submission = state().submissions.get(submissionId);
  if (!submission) return false;
  if (submission.userId !== ownerId) throw new DemoOwnershipError();
  if (submission.state === 'pending_review') {
    throw new DemoTransitionError('This cleanup is awaiting review and its evidence is frozen.');
  }
  if (submission.state === 'complete') return submission.afterRef === afterRef;
  submission.afterRef = afterRef;
  submission.reviewId = undefined;
  submission.reviewDecision = undefined;
  submission.reviewedBy = undefined;
  submission.reviewedAt = undefined;
  return true;
}

function getStoredSubmission(id: string): StoredSubmission | undefined {
  return state().submissions.get(id);
}

export function createDemoPipelineDeps(
  mode: 'seeded-demo' | 'fallback-demo' = 'seeded-demo',
  ownerId: string = DEMO_IDS.user,
): PipelineDeps {
  return {
    dataMode: mode,
    async loadSubmission(id) {
      const submission = getStoredSubmission(id);
      return submission ? { ...submission } : null;
    },

    async validateSubmission(submission) {
      if (submission.state === 'pending_review') {
        throw new Error('This cleanup is already awaiting review.');
      }
      if (submission.state === 'complete' && !submission.counted) {
        throw new Error('This cleanup has an invalid completion state.');
      }
      if (!submission.beforeRef) {
        throw new Error('A committed before photo is required.');
      }
      if (!submission.afterRef) {
        throw new Error('Add an after photo before verification.');
      }
      if (submission.userId !== ownerId || submission.campaignId !== DEMO_IDS.campaign) {
        throw new Error('This cleanup does not belong to the active campaign.');
      }
    },

    async allowAttempt(userId) {
      const current = state();
      const now = Date.now();
      const windowStart = now - 60_000;
      const recent = (current.attemptTimes.get(userId) ?? []).filter(
        (timestamp) => timestamp >= windowStart,
      );
      if (recent.length >= 12) return false;
      recent.push(now);
      current.attemptTimes.set(userId, recent);
      return true;
    },

    async checkDuplicate(submission) {
      return getStoredSubmission(submission.id)?.scenario === 'fraud';
    },

    async scoreGeoTime(submission) {
      const scenario = getStoredSubmission(submission.id)?.scenario;
      if (scenario === 'fraud') return { geoScore: 0.06, timeScore: 0.92 };
      if (scenario === 'review') return { geoScore: 0.4, timeScore: 0.5 };
      return { geoScore: 0.5, timeScore: 0.5 };
    },

    async assess(submission) {
      const scenario = getStoredSubmission(submission.id)?.scenario;
      if (scenario === 'fraud') {
        return {
          confidence: 0.82,
          rationale: 'The frames are nearly identical, so a new cleanup cannot be confirmed.',
          source: 'seeded' as const,
        };
      }
      if (scenario === 'review') {
        return {
          confidence: 0.55,
          rationale: 'The scene looks improved but the match is not conclusive.',
          source: 'seeded' as const,
        };
      }
      return {
        confidence: 0.94,
        rationale: 'Same location and viewpoint; visible litter was removed from the path.',
        source: 'seeded' as const,
      };
    },

    async finalizePass(submission, verdict) {
      const current = state();
      const stored = current.submissions.get(submission.id);
      if (!stored) throw new Error('Submission disappeared during verification.');

      if (stored.counted) {
        return {
          previousProgress: current.campaign.progress,
          progress: current.campaign.progress,
          unlockedValue: moneyUnlocked(current.campaign.progress),
          poolUnlocked: current.campaign.poolUnlocked,
          pointsAwarded: 0,
          pointsBalance: current.user.pointsBalance,
          couponAwarded: false,
          wasCounted: false,
        };
      }

      const previousProgress = current.campaign.progress;
      const pointsAwarded = pointsForCleanup(
        current.campaign.basePoints,
        current.campaign.pointsMultiplier,
      );
      const couponAwarded = !current.user.couponAwarded;

      stored.counted = true;
      stored.state = 'complete';
      stored.lastResult = {
        pass: true,
        confidence: verdict.confidence,
        rationale: verdict.rationale,
        reasons: [],
      };
      current.campaign.progress += 1;
      current.campaign.poolUnlocked =
        current.campaign.progress >= current.campaign.threshold;
      current.user.pointsBalance += pointsAwarded;
      current.user.verifiedCleanups += 1;
      current.user.actionsCompleted += 1;
      current.user.couponAwarded = true;
      current.feed.unshift({
        id: `feed-${submission.id}`,
        name: 'You',
        initials: current.user.initials,
        location: 'Amherst Common',
        timeLabel: 'Just now',
        points: pointsAwarded,
        confidence: verdict.confidence,
        accent: 'leaf',
        isCurrentUser: true,
      });

      return {
        previousProgress,
        progress: current.campaign.progress,
        unlockedValue: moneyUnlocked(current.campaign.progress),
        poolUnlocked: current.campaign.poolUnlocked,
        pointsAwarded,
        pointsBalance: current.user.pointsBalance,
        couponAwarded,
        ...(couponAwarded ? { coupon: { ...DEMO_COUPON } } : {}),
        wasCounted: true,
      };
    },

    async recordReject(submission, result) {
      const current = state();
      const stored = current.submissions.get(submission.id);
      if (stored) stored.lastResult = { pass: false, ...result };
      return {
        progress: current.campaign.progress,
        unlockedValue: moneyUnlocked(current.campaign.progress),
        pointsBalance: current.user.pointsBalance,
      };
    },

    async recordReview(submission, result) {
      const current = state();
      const stored = current.submissions.get(submission.id);
      if (stored && stored.state === 'before_committed' && !stored.counted && stored.afterRef) {
        stored.state = 'pending_review';
        stored.reviewId = randomUUID();
        stored.reviewDecision = undefined;
        stored.reviewedBy = undefined;
        stored.reviewedAt = undefined;
        stored.lastResult = { pass: false, ...result };
      } else {
        throw new Error('This cleanup cannot enter review from its current state.');
      }
      return {
        progress: current.campaign.progress,
        unlockedValue: moneyUnlocked(current.campaign.progress),
        pointsBalance: current.user.pointsBalance,
        reviewId: stored.reviewId,
      };
    },
  };
}

export function listHeldForReview(): ReviewQueueClaim[] {
  const current = state();
  const held: ReviewQueueClaim[] = [];
  for (const submission of current.submissions.values()) {
    if (submission.state === 'pending_review' && !submission.counted) {
      held.push({
        id: submission.id,
        reviewId: submission.reviewId ?? '',
        confidence: submission.lastResult?.confidence ?? 0,
        rationale: submission.lastResult?.rationale ?? 'Held for review.',
        reasons: submission.lastResult?.reasons ?? [],
        committedAt: submission.committedAt,
        beforePhotoUrl: '/demo-before.png',
        afterPhotoUrl: '/demo-after.png',
      });
    }
  }
  return held;
}

/** Approve a frozen demo claim exactly once. */
export async function approveHeldClaim(
  submissionId: string,
  reviewId: string,
  reviewerId = 'sprout-reviewer',
  mode: 'seeded-demo' | 'fallback-demo' = 'seeded-demo',
): Promise<VerificationResult> {
  const current = state();
  const stored = current.submissions.get(submissionId);
  if (
    stored?.state === 'complete' &&
    stored.counted &&
    stored.reviewDecision === 'approved' &&
    stored.reviewId === reviewId
  ) {
    return {
      outcome: 'pass',
      pass: true,
      confidence: stored.lastResult?.confidence ?? 0.7,
      rationale: stored.lastResult?.rationale ?? 'Approved by reviewer.',
      reasons: [],
      assessor: 'seeded',
      dataMode: mode,
      previousProgress: current.campaign.progress,
      progress: current.campaign.progress,
      unlockedValue: moneyUnlocked(current.campaign.progress),
      poolUnlocked: current.campaign.poolUnlocked,
      pointsAwarded: 0,
      pointsBalance: current.user.pointsBalance,
      couponAwarded: false,
      wasCounted: false,
    };
  }
  if (
    !stored ||
    stored.state !== 'pending_review' ||
    stored.counted ||
    stored.reviewId !== reviewId
  ) {
    throw new Error('No held claim with that id.');
  }

  const confidence = stored.lastResult?.confidence ?? 0.7;
  const finalized = await createDemoPipelineDeps(mode, stored.userId).finalizePass(stored, {
    confidence,
    rationale: 'Approved by an authorized reviewer.',
  });
  stored.reviewDecision = 'approved';
  stored.reviewedBy = reviewerId;
  stored.reviewedAt = new Date().toISOString();
  return {
    outcome: 'pass',
    pass: true,
    confidence,
    rationale: 'Approved by an authorized reviewer. The cleanup now counts.',
    reasons: [],
    assessor: 'seeded',
    dataMode: mode,
    ...finalized,
  };
}

/** Deny a frozen demo claim and reopen the same before commit for a new after photo. */
export function denyHeldClaim(
  submissionId: string,
  reviewId: string,
  reviewerId = 'sprout-reviewer',
): ReviewDecisionResult {
  const current = state();
  const stored = current.submissions.get(submissionId);
  if (
    stored?.reviewDecision === 'denied' &&
    stored.state === 'before_committed' &&
    stored.reviewId === reviewId
  ) {
    return unchangedReviewDecision('denied');
  }
  if (
    !stored ||
    stored.state !== 'pending_review' ||
    stored.counted ||
    stored.reviewId !== reviewId
  ) {
    throw new Error('No held claim with that id.');
  }
  stored.state = 'before_committed';
  stored.afterRef = null;
  stored.scenario = 'legit';
  stored.reviewId = undefined;
  stored.reviewDecision = 'denied';
  stored.reviewedBy = reviewerId;
  stored.reviewedAt = new Date().toISOString();
  stored.lastResult = {
    pass: false,
    confidence: stored.lastResult?.confidence ?? 0,
    rationale: 'An authorized reviewer requested a clearer after photo.',
    reasons: stored.lastResult?.reasons ?? ['low_confidence'],
  };
  return unchangedReviewDecision('denied');
}

/** Let the owner withdraw a pending demo claim and submit clearer evidence. */
export function retryHeldClaim(
  submissionId: string,
  reviewId: string,
  ownerId: string = DEMO_IDS.user,
): { id: string; state: 'before_committed' } {
  const stored = state().submissions.get(submissionId);
  if (!stored) throw new DemoTransitionError('This review no longer exists.');
  if (stored.userId !== ownerId) throw new DemoOwnershipError();
  if (
    stored.state !== 'pending_review' ||
    stored.counted ||
    stored.reviewId !== reviewId
  ) {
    throw new DemoTransitionError('This review is no longer current.');
  }
  stored.state = 'before_committed';
  stored.afterRef = null;
  stored.scenario = 'legit';
  stored.reviewId = undefined;
  stored.reviewDecision = 'withdrawn';
  stored.reviewedBy = stored.userId;
  stored.reviewedAt = new Date().toISOString();
  stored.lastResult = {
    pass: false,
    confidence: stored.lastResult?.confidence ?? 0,
    rationale: 'You withdrew this claim. Add a clearer after photo to try again.',
    reasons: stored.lastResult?.reasons ?? ['low_confidence'],
  };
  return { id: stored.id, state: 'before_committed' };
}

function unchangedReviewDecision(decision: 'approved' | 'denied'): ReviewDecisionResult {
  const current = state();
  return {
    decision,
    previousProgress: current.campaign.progress,
    progress: current.campaign.progress,
    unlockedValue: moneyUnlocked(current.campaign.progress),
    poolUnlocked: current.campaign.poolUnlocked,
    pointsAwarded: 0,
    pointsBalance: current.user.pointsBalance,
    couponAwarded: false,
    wasCounted: false,
  };
}

export function demoVerificationSummary(
  result: VerificationResult,
): VerificationResult {
  return { ...result, reasons: [...result.reasons] };
}
