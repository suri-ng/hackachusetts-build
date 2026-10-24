// Verification pipeline orchestration in the fixed §9a order.
// Implemented in Task 5.1 (Req 3.4, 4.2, 4.3, 4.4, 5.x, 8.2, 9.x, 10.3, 11.x, 12.x, 13.3, 16.2).

export interface VerifyRequest {
  submissionId: string;
  demoUserId: string;
  /** storage references, not raw client verdicts. */
  beforeRef: string;
  afterRef: string;
}

export interface VerifyResponse {
  pass: boolean;
  confidence: number;
  rationale: string;
  reasons: string[];
  progress?: number;
  unlockedValue?: number;
  poolUnlocked?: boolean;
  couponAwarded?: boolean;
}

/**
 * Injected I/O dependencies (DB, storage, signal extractors) so the orchestration
 * stays testable. Shape is filled in during Task 5.1.
 */
export interface PipelineDeps {
  [key: string]: unknown;
}

/**
 * Fixed order: input validation → pHash → EXIF/geo/time → Claude → compositeVerdict.
 * On PASS: increment_progress → threshold check → pool-unlocked update →
 * first-cleanup coupon award → set submission.state = complete.
 */
export function runVerification(
  _req: VerifyRequest,
  _deps: PipelineDeps,
): Promise<VerifyResponse> {
  throw new Error('not_implemented: runVerification (Task 5.1)');
}
