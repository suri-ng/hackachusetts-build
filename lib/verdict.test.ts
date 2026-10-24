import { describe, it, expect } from 'vitest';
import {
  compositeVerdict,
  fillRatio,
  nextMilestone,
  unlockedValue,
  VERDICT_POLICY,
} from './verdict';
import { boolean, float, forAll, integer } from './test-support/property';

describe('compositeVerdict', () => {
  it('always hard-rejects when the duplicate flag is set (Property 13)', () => {
    forAll(
      float(0, 1),
      (confidence) => {
        const verdict = compositeVerdict({
          claudeConfidence: confidence,
          geoScore: 1,
          timeScore: 1,
          duplicateFlag: true,
        });
        expect(verdict.pass).toBe(false);
        expect(verdict.reasons).toContain('duplicate_photo');
      },
    );
  });

  it('never passes below the Claude minimum even with perfect soft signals (Property 9)', () => {
    forAll(
      float(0, VERDICT_POLICY.claudeMinimum - 0.0001),
      (confidence) => {
        const verdict = compositeVerdict({
          claudeConfidence: confidence,
          geoScore: 1,
          timeScore: 1,
          duplicateFlag: false,
        });
        expect(verdict.pass).toBe(false);
        expect(verdict.reasons).toContain('low_confidence');
      },
    );
  });

  it('passes a strong, non-duplicate signal and returns an empty reasons list', () => {
    forAll(
      float(VERDICT_POLICY.claudeMinimum, 1),
      (confidence) => {
        const verdict = compositeVerdict({
          claudeConfidence: confidence,
          geoScore: 1,
          timeScore: 1,
          duplicateFlag: false,
        });
        expect(verdict.pass).toBe(true);
        expect(verdict.reasons).toEqual([]);
      },
    );
  });

  it('always surfaces a confidence in [0,1] and a non-empty rationale (Property 18)', () => {
    forAll(
      float(0, 1),
      (confidence) => {
        const verdict = compositeVerdict({
          claudeConfidence: confidence,
          geoScore: confidence,
          timeScore: 1 - confidence,
          duplicateFlag: false,
        });
        expect(verdict.confidence).toBeGreaterThanOrEqual(0);
        expect(verdict.confidence).toBeLessThanOrEqual(1);
        expect(verdict.rationale.length).toBeGreaterThan(0);
      },
    );
  });

  it('treats geo/time as soft: weak soft signals alone cannot reject a strong verdict', () => {
    const verdict = compositeVerdict({
      claudeConfidence: 1,
      geoScore: 0.5,
      timeScore: 0.5,
      duplicateFlag: false,
    });
    expect(verdict.pass).toBe(true);
  });

  it('rejects non-finite scores instead of letting NaN bypass thresholds', () => {
    expect(() =>
      compositeVerdict({
        claudeConfidence: Number.NaN,
        geoScore: 1,
        timeScore: 1,
        duplicateFlag: false,
      }),
    ).toThrow();
  });
});

describe('unlockedValue (Property 1)', () => {
  it('equals pool * (progress / threshold) and is monotonic in progress', () => {
    forAll(
      integer(0, 200),
      (progress) => {
        const pool = 500;
        const threshold = 100;
        const value = unlockedValue(pool, progress, threshold);
        expect(value).toBeCloseTo(pool * (progress / threshold), 6);
        const higher = unlockedValue(pool, progress + 1, threshold);
        expect(higher).toBeGreaterThanOrEqual(value);
      },
    );
  });

  it('throws on a non-positive threshold', () => {
    expect(() => unlockedValue(500, 10, 0)).toThrow();
  });
});

describe('fillRatio (Property 4)', () => {
  it('is proportional and always clamped to [0,1]', () => {
    forAll(
      integer(0, 500),
      (progress) => {
        const ratio = fillRatio(progress, 100);
        expect(ratio).toBeGreaterThanOrEqual(0);
        expect(ratio).toBeLessThanOrEqual(1);
        if (progress <= 100) {
          expect(ratio).toBeCloseTo(progress / 100, 6);
        } else {
          expect(ratio).toBe(1);
        }
      },
    );
  });
});

describe('nextMilestone (Property 5)', () => {
  const markers = [25, 50, 75, 100];
  it('returns the least marker strictly greater than progress, or null past the end', () => {
    forAll(
      integer(0, 120),
      (progress) => {
        const next = nextMilestone(progress, markers);
        const expected = markers.find((m) => m > progress) ?? null;
        expect(next).toBe(expected);
        if (next !== null) expect(next).toBeGreaterThan(progress);
      },
    );
  });
});
