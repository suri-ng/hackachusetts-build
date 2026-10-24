import { describe, it, expect } from 'vitest';
import {
  geoTimeScore,
  NEUTRAL_EXIF_SCORE,
  type ExifMeta,
} from './geotime';
import { float, forAll } from './test-support/property';

const mission = { lat: 42.375, lon: -72.5199, radiusMeters: 1200 };

describe('geoTimeScore — soft signal behavior (Property 16)', () => {
  it('returns the neutral score when EXIF is entirely missing, never auto-rejecting', () => {
    const empty: ExifMeta = {};
    const { geoScore, timeScore } = geoTimeScore({
      before: empty,
      after: empty,
      missionArea: mission,
    });
    expect(geoScore).toBe(NEUTRAL_EXIF_SCORE);
    expect(timeScore).toBe(NEUTRAL_EXIF_SCORE);
  });

  it('always keeps both scores within [0,1] for any coordinates (Property 15)', () => {
    forAll(
      float(-90, 90),
      (lat) => {
        const meta: ExifMeta = { lat, lon: -72.5 };
        const { geoScore, timeScore } = geoTimeScore({
          before: meta,
          after: meta,
          missionArea: mission,
        });
        expect(geoScore).toBeGreaterThanOrEqual(0);
        expect(geoScore).toBeLessThanOrEqual(1);
        expect(timeScore).toBeGreaterThanOrEqual(0);
        expect(timeScore).toBeLessThanOrEqual(1);
      },
    );
  });

  it('is monotonic: a closer location never scores lower than a farther one (Property 15)', () => {
    const atCenter: ExifMeta = { lat: mission.lat, lon: mission.lon };
    const near: ExifMeta = { lat: mission.lat + 0.003, lon: mission.lon };
    const far: ExifMeta = { lat: mission.lat + 0.3, lon: mission.lon };

    const scoreFor = (meta: ExifMeta) =>
      geoTimeScore({ before: meta, after: meta, missionArea: mission }).geoScore;

    expect(scoreFor(atCenter)).toBeGreaterThanOrEqual(scoreFor(near));
    expect(scoreFor(near)).toBeGreaterThanOrEqual(scoreFor(far));
  });

  it('scores a tight timestamp gap higher than a wide one', () => {
    const base = new Date('2024-05-01T12:00:00Z');
    const tight = {
      before: { takenAt: base },
      after: { takenAt: new Date(base.getTime() + 10 * 60_000) },
      missionArea: mission,
    };
    const wide = {
      before: { takenAt: base },
      after: { takenAt: new Date(base.getTime() + 10 * 60 * 60_000) },
      missionArea: mission,
    };
    expect(geoTimeScore(tight).timeScore).toBeGreaterThan(
      geoTimeScore(wide).timeScore,
    );
  });
});
