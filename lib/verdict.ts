// Pure verdict core. No I/O. Implemented in Task 3 (Req 1.1, 2.2, 2.3, 2.5, 4.4, 4.5, 6.2, 16.1).

export interface VerdictSignals {
  /** 0..1 from Claude (or seeded fallback). */
  claudeConfidence: number;
  /** 0..1 soft signal (0.5 neutral when EXIF absent). */
  geoScore: number;
  /** 0..1 soft signal (0.5 neutral when EXIF absent). */
  timeScore: number;
  /** true => hard fail. */
  duplicateFlag: boolean;
}

export interface Verdict {
  pass: boolean;
  /** Surfaced to the student on BOTH outcomes. */
  confidence: number;
  /** One line, shown on BOTH outcomes. */
  rationale: string;
  /** Contributing reasons (populated on reject). */
  reasons: string[];
}

/**
 * finalVerdict = f(claudeConfidence, geoScore, timeScore, duplicateFlag).
 * Hard fail on duplicateFlag; otherwise composite of confidence + soft signals
 * against server-side thresholds. Geo/time are SOFT and cannot alone reject.
 */
export function compositeVerdict(_s: VerdictSignals): Verdict {
  throw new Error('not_implemented: compositeVerdict (Task 3.1)');
}

/** pool * (progress / threshold). */
export function unlockedValue(
  _pool: number,
  _progress: number,
  _threshold: number,
): number {
  throw new Error('not_implemented: unlockedValue (Task 3.1)');
}

/** clamp(progress / threshold, 0..1). */
export function fillRatio(_progress: number, _threshold: number): number {
  throw new Error('not_implemented: fillRatio (Task 3.1)');
}

/** Least marker strictly greater than progress, or null. */
export function nextMilestone(
  _progress: number,
  _markers?: number[],
): number | null {
  throw new Error('not_implemented: nextMilestone (Task 3.1)');
}
