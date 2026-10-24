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
  VerificationResult,
} from './domain';
import type {
  PipelineDeps,
  PipelineSubmission,
} from './pipeline';
import { pointsForCleanup } from './points';
import { unlockedValue } from './verdict';

type DemoScenario = 'legit' | 'fraud';

interface StoredSubmission extends PipelineSubmission {
  scenario: DemoScenario;
  committedAt: string;
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

export function getDemoSnapshot(
  mode: 'seeded-demo' | 'fallback-demo' = 'seeded-demo',
): CampaignPayload {
  const current = state();
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
    pendingSubmissionId: DEMO_IDS.pendingSubmission,
    fraudSubmissionId: DEMO_IDS.fraudSubmission,
    mode,
    aiMode: 'seeded',
    generatedAt: new Date().toISOString(),
  };
}

export function resetDemoStore(): CampaignPayload {
  globalThis.__sproutDemoState = makeState();
  return getDemoSnapshot();
}

export function createDemoSubmission(beforeRef: string): {
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
    userId: DEMO_IDS.user,
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

export function attachDemoAfter(submissionId: string, afterRef: string): boolean {
  const submission = state().submissions.get(submissionId);
  if (!submission || !afterRef.startsWith('demo://')) return false;
  if (submission.state === 'complete') return true;
  submission.afterRef = afterRef;
  return true;
}

function getStoredSubmission(id: string): StoredSubmission | undefined {
  return state().submissions.get(id);
}

export function createDemoPipelineDeps(
  mode: 'seeded-demo' | 'fallback-demo' = 'seeded-demo',
): PipelineDeps {
  return {
    dataMode: mode,
    async loadSubmission(id) {
      const submission = getStoredSubmission(id);
      return submission ? { ...submission } : null;
    },

    async validateSubmission(submission) {
      if (!submission.beforeRef) {
        throw new Error('A committed before photo is required.');
      }
      if (!submission.afterRef) {
        throw new Error('Add an after photo before verification.');
      }
      if (submission.userId !== DEMO_IDS.user || submission.campaignId !== DEMO_IDS.campaign) {
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
      return getStoredSubmission(submission.id)?.scenario === 'fraud'
        ? { geoScore: 0.06, timeScore: 0.92 }
        : { geoScore: 0.5, timeScore: 0.5 };
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
  };
}

export function demoVerificationSummary(
  result: VerificationResult,
): VerificationResult {
  return { ...result, reasons: [...result.reasons] };
}
