// Pure verdict core. No I/O. (Req 1.1, 2.2, 2.3, 2.5, 4.4, 4.5, 6.2, 16.1).

export interface VerdictSignals {
  /** 0..1 from Claude (or the seeded fallback). */
  claudeConfidence: number;
  /** 0..1 soft signal (0.5 neutral when EXIF is absent). */
  geoScore: number;
  /** 0..1 soft signal (0.5 neutral when EXIF is absent). */
  timeScore: number;
  /** True always rejects the submission. */
  duplicateFlag: boolean;
}

export interface Verdict {
  pass: boolean;
  /** Weighted confidence surfaced on both outcomes. */
  confidence: number;
  /** A non-empty, single-line explanation shown on both outcomes. */
  rationale: string;
  /** Contributing reasons, populated only on rejection. */
  reasons: string[];
}

/** Server-owned policy values. Claude remains the dominant signal. */
export const VERDICT_POLICY = Object.freeze({
  claudeWeight: 0.7,
  geoWeight: 0.2,
  timeWeight: 0.1,
  claudeMinimum: 0.65,
  passThreshold: 0.6,
  weakGeoThreshold: 0.5,
  weakTimeThreshold: 0.5,
});

const DEFAULT_MILESTONES = Object.freeze([25, 50, 75, 100]);

type VerdictReason =
  | 'duplicate_photo'
  | 'low_confidence'
  | 'out_of_area'
  | 'time_mismatch';

function requireFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function unitScore(value: number, name: string): number {
  return clamp(requireFinite(value, name), 0, 1);
}

function nonNegative(value: number, name: string): number {
  return Math.max(0, requireFinite(value, name));
}

function checkedProduct(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} exceeds the finite numeric range`);
  }
  return value;
}

function rejectionRationale(reasons: VerdictReason[]): string {
  const phrases: Record<VerdictReason, string> = {
    duplicate_photo: 'a photo matches previously submitted evidence',
    low_confidence: 'the visual cleanup evidence is not strong enough',
    out_of_area: 'the location signal is outside the mission area',
    time_mismatch: 'the photo timestamps are too far apart',
  };

  return `Cleanup could not be verified because ${reasons
    .map((reason) => phrases[reason])
    .join('; ')}.`;
}

/**
 * Computes the server-authoritative verdict from normalized anti-fraud signals.
 * Finite scores are clamped to [0, 1]. Non-finite scores are rejected as
 * invalid input instead of allowing NaN to bypass a threshold.
 *
 * Duplicate evidence is an unconditional hard failure, but all other weak
 * signals are still collected so the caller can explain every contributor.
 */
export function compositeVerdict(signals: VerdictSignals): Verdict {
  if (!signals || typeof signals !== 'object') {
    throw new TypeError('signals must be an object');
  }
  if (typeof signals.duplicateFlag !== 'boolean') {
    throw new TypeError('duplicateFlag must be a boolean');
  }

  const claudeConfidence = unitScore(
    signals.claudeConfidence,
    'claudeConfidence',
  );
  const geoScore = unitScore(signals.geoScore, 'geoScore');
  const timeScore = unitScore(signals.timeScore, 'timeScore');

  const confidence = clamp(
    claudeConfidence * VERDICT_POLICY.claudeWeight +
      geoScore * VERDICT_POLICY.geoWeight +
      timeScore * VERDICT_POLICY.timeWeight,
    0,
    1,
  );

  const contributors: VerdictReason[] = [];
  if (signals.duplicateFlag) contributors.push('duplicate_photo');
  if (claudeConfidence < VERDICT_POLICY.claudeMinimum) {
    contributors.push('low_confidence');
  }
  if (geoScore < VERDICT_POLICY.weakGeoThreshold) {
    contributors.push('out_of_area');
  }
  if (timeScore < VERDICT_POLICY.weakTimeThreshold) {
    contributors.push('time_mismatch');
  }

  const pass =
    !signals.duplicateFlag &&
    claudeConfidence >= VERDICT_POLICY.claudeMinimum &&
    confidence >= VERDICT_POLICY.passThreshold;

  if (pass) {
    return {
      pass: true,
      confidence,
      rationale: 'Cleanup evidence meets the verification threshold.',
      reasons: [],
    };
  }

  // With the current policy, every threshold failure has a contributor. Keep a
  // defensive fallback so a future threshold-only policy still explains a reject.
  const reasons: VerdictReason[] =
    contributors.length > 0 ? contributors : ['low_confidence'];

  return {
    pass: false,
    confidence,
    rationale: rejectionRationale(reasons),
    reasons,
  };
}

/** Pool value unlocked at the current (uncapped) progress fraction. */
export function unlockedValue(
  pool: number,
  progress: number,
  threshold: number,
): number {
  const safePool = nonNegative(pool, 'pool');
  const safeProgress = nonNegative(progress, 'progress');
  const safeThreshold = requireFinite(threshold, 'threshold');
  if (safeThreshold <= 0) {
    throw new RangeError('threshold must be greater than zero');
  }

  return checkedProduct(
    safePool * (safeProgress / safeThreshold),
    'unlocked value',
  );
}

/** Progress fraction clamped to [0, 1]. */
export function fillRatio(progress: number, threshold: number): number {
  const safeProgress = nonNegative(progress, 'progress');
  const safeThreshold = requireFinite(threshold, 'threshold');
  if (safeThreshold <= 0) {
    throw new RangeError('threshold must be greater than zero');
  }

  return clamp(safeProgress / safeThreshold, 0, 1);
}

/** Least non-negative marker strictly greater than progress, or null. */
export function nextMilestone(
  progress: number,
  markers: readonly number[] = DEFAULT_MILESTONES,
): number | null {
  const safeProgress = nonNegative(progress, 'progress');
  if (!Array.isArray(markers)) {
    throw new TypeError('markers must be an array of finite numbers');
  }

  let next: number | null = null;
  for (const marker of markers) {
    const safeMarker = nonNegative(marker, 'marker');
    if (safeMarker > safeProgress && (next === null || safeMarker < next)) {
      next = safeMarker;
    }
  }

  return next;
}
