// EXIF extraction (exifr) + geoTimeScore. SOFTEN-FIRST capability.
// Implemented in Task 4.3 (Req 7.1, 7.2, 7.3).

export interface ExifMeta {
  lat?: number;
  lon?: number;
  takenAt?: Date;
}

export interface GeoTimeInput {
  before: ExifMeta;
  after: ExifMeta;
  missionArea: { lat: number; lon: number; radiusMeters: number };
}

/** exifr; absent fields => undefined. */
export function extractExif(_image: Buffer): Promise<ExifMeta> {
  throw new Error('not_implemented: extractExif (Task 4.3)');
}

/**
 * Missing EXIF => neutral/lowered scores (never auto-reject). Closer GPS /
 * closer before-after timestamps never produce a lower score (monotonic).
 */
export function geoTimeScore(_i: GeoTimeInput): {
  geoScore: number;
  timeScore: number;
} {
  throw new Error('not_implemented: geoTimeScore (Task 4.3)');
}
