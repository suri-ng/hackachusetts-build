import { compositeVerdict } from './verdict';
import type { DataMode, VerificationResult } from './domain';

export interface PipelineSubmission {
  id: string;
  userId: string;
  campaignId: string;
  beforeRef: string;
  afterRef: string | null;
  state: 'before_committed' | 'complete';
  counted: boolean;
}

export interface VerifyRequest {
  submissionId: string;
}

export interface PipelineAssessment {
  confidence: number;
  rationale: string;
  source: 'seeded' | 'claude';
}

export interface PipelineFinalizeResult {
  previousProgress: number;
  progress: number;
  unlockedValue: number;
  poolUnlocked: boolean;
  pointsAwarded: number;
  pointsBalance: number;
  couponAwarded: boolean;
  coupon?: VerificationResult['coupon'];
  wasCounted: boolean;
}

export interface PipelineDeps {
  readonly dataMode: DataMode;
  loadSubmission(id: string): Promise<PipelineSubmission | null>;
  validateSubmission(submission: PipelineSubmission): Promise<void>;
  allowAttempt(userId: string): Promise<boolean>;
  checkDuplicate(submission: PipelineSubmission): Promise<boolean>;
  scoreGeoTime(
    submission: PipelineSubmission,
  ): Promise<{ geoScore: number; timeScore: number }>;
  assess(submission: PipelineSubmission): Promise<PipelineAssessment>;
  finalizePass(
    submission: PipelineSubmission,
    verdict: { confidence: number; rationale: string },
  ): Promise<PipelineFinalizeResult>;
  recordReject(
    submission: PipelineSubmission,
    result: { confidence: number; rationale: string; reasons: string[] },
  ): Promise<{ progress: number; unlockedValue: number; pointsBalance: number }>;
}

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'submission_not_found'
      | 'before_required'
      | 'after_required'
      | 'invalid_submission'
      | 'rate_limited',
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

function rejectionRationale(reasons: string[], visualRationale: string): string {
  if (reasons.includes('duplicate_photo') && reasons.includes('out_of_area')) {
    return 'This photo matches earlier evidence and its location signal falls outside the mission area.';
  }
  if (reasons.includes('duplicate_photo')) {
    return 'This photo is too similar to evidence that was already submitted.';
  }
  if (reasons.includes('out_of_area')) {
    return 'The visual change looks plausible, but the location signal falls outside the mission area.';
  }
  if (reasons.includes('time_mismatch')) {
    return 'The photos look related, but their capture times are too far apart to verify this attempt.';
  }
  return visualRationale || 'The cleanup could not be verified from this evidence.';
}

/**
 * Server-authoritative verification orchestration. Integrations are injected so
 * the seeded demo and the future Supabase/Claude adapters share one flow.
 */
export async function runVerification(
  request: VerifyRequest,
  deps: PipelineDeps,
): Promise<VerificationResult> {
  const submission = await deps.loadSubmission(request.submissionId);
  if (!submission) {
    throw new PipelineError('We could not find that cleanup.', 'submission_not_found', 404);
  }

  // Fixed order: validation/rate gate → duplicate → geo/time → assessment → verdict.
  await deps.validateSubmission(submission);
  if (!(await deps.allowAttempt(submission.userId))) {
    throw new PipelineError(
      'Too many verification attempts. Take a short pause and try again.',
      'rate_limited',
      429,
    );
  }

  const duplicateFlag = await deps.checkDuplicate(submission);
  const { geoScore, timeScore } = await deps.scoreGeoTime(submission);
  const assessment = await deps.assess(submission);
  const verdict = compositeVerdict({
    claudeConfidence: assessment.confidence,
    geoScore,
    timeScore,
    duplicateFlag,
  });

  if (!verdict.pass) {
    const rationale = rejectionRationale(verdict.reasons, assessment.rationale);
    const unchanged = await deps.recordReject(submission, {
      confidence: verdict.confidence,
      rationale,
      reasons: verdict.reasons,
    });
    return {
      pass: false,
      confidence: verdict.confidence,
      rationale,
      reasons: verdict.reasons,
      assessor: assessment.source,
      dataMode: deps.dataMode,
      previousProgress: unchanged.progress,
      progress: unchanged.progress,
      unlockedValue: unchanged.unlockedValue,
      poolUnlocked: false,
      pointsAwarded: 0,
      pointsBalance: unchanged.pointsBalance,
      couponAwarded: false,
      wasCounted: false,
    };
  }

  const finalized = await deps.finalizePass(submission, {
    confidence: verdict.confidence,
    rationale: assessment.rationale,
  });
  return {
    pass: true,
    confidence: verdict.confidence,
    rationale: assessment.rationale,
    reasons: [],
    assessor: assessment.source,
    dataMode: deps.dataMode,
    ...finalized,
  };
}
