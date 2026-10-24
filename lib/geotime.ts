// EXIF extraction (exifr) + soft geographic/time proximity scoring.

import { parse } from 'exifr';

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

export const NEUTRAL_EXIF_SCORE = 0.5;
export const EARTH_RADIUS_METERS = 6_371_008.8;
/** A two-hour gap scores 0.5; shorter gaps score higher. */
export const TIME_PROXIMITY_WINDOW_MS = 2 * 60 * 60 * 1_000;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validLatitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -90 && value <= 90;
}

function validLongitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -180 && value <= 180;
}

function validDate(value: unknown): Date | undefined {
  if (!(value instanceof Date)) return undefined;
  const timestamp = value.getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Extracts normalized decimal GPS coordinates and the best capture timestamp.
 * Unsupported images, malformed EXIF, and absent tags all degrade to missing
 * optional metadata so this soft signal cannot stop the verification pipeline.
 */
export async function extractExif(image: Buffer): Promise<ExifMeta> {
  if (!Buffer.isBuffer(image) || image.length === 0) return {};

  try {
    const parsed: unknown = await parse(image, {
      exif: true,
      gps: true,
      mergeOutput: true,
      reviveValues: true,
      translateKeys: true,
      translateValues: true,
    });
    if (!isRecord(parsed)) return {};

    const lat = validLatitude(parsed.latitude) ? parsed.latitude : undefined;
    const lon = validLongitude(parsed.longitude)
      ? parsed.longitude
      : undefined;
    const takenAt = validDate(
      parsed.DateTimeOriginal ?? parsed.CreateDate ?? parsed.ModifyDate,
    );

    return {
      ...(lat !== undefined ? { lat } : {}),
      ...(lon !== undefined ? { lon } : {}),
      ...(takenAt !== undefined ? { takenAt } : {}),
    };
  } catch {
    return {};
  }
}

function requireMissionCoordinate(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function requirePositiveRadius(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('missionArea.radiusMeters must be a positive number');
  }
  return value;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineMeters(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
): number {
  const latitudeDelta = toRadians(latB - latA);
  const longitudeDelta = toRadians(lonB - lonA);
  const latitudeARadians = toRadians(latA);
  const latitudeBRadians = toRadians(latB);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeARadians) *
      Math.cos(latitudeBRadians) *
      Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = clampUnit(haversine);

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.asin(Math.sqrt(boundedHaversine))
  );
}

function locationScore(
  meta: ExifMeta,
  missionLat: number,
  missionLon: number,
  radiusMeters: number,
): number {
  if (!validLatitude(meta?.lat) || !validLongitude(meta?.lon)) {
    return NEUTRAL_EXIF_SCORE;
  }

  const distance = haversineMeters(
    meta.lat,
    meta.lon,
    missionLat,
    missionLon,
  );

  // Reciprocal decay is 1 at the center and 0.5 at the mission boundary.
  return clampUnit(1 / (1 + distance / radiusMeters));
}

function timestampMillis(meta: ExifMeta): number | undefined {
  if (!(meta?.takenAt instanceof Date)) return undefined;
  const value = meta.takenAt.getTime();
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Scores both locations using haversine distance and timestamps using a smooth,
 * monotonic reciprocal decay. A missing photo component contributes the neutral
 * 0.5 score. The lower per-photo geo score is used so one distant photo is not
 * hidden by another photo at the mission center.
 */
export function geoTimeScore(input: GeoTimeInput): {
  geoScore: number;
  timeScore: number;
} {
  if (!input || typeof input !== 'object') {
    throw new TypeError('input must be an object');
  }

  const missionLat = requireMissionCoordinate(
    input.missionArea?.lat,
    'missionArea.lat',
    -90,
    90,
  );
  const missionLon = requireMissionCoordinate(
    input.missionArea?.lon,
    'missionArea.lon',
    -180,
    180,
  );
  const radiusMeters = requirePositiveRadius(input.missionArea?.radiusMeters);

  const beforeGeo = locationScore(
    input.before,
    missionLat,
    missionLon,
    radiusMeters,
  );
  const afterGeo = locationScore(
    input.after,
    missionLat,
    missionLon,
    radiusMeters,
  );
  const geoScore = clampUnit(Math.min(beforeGeo, afterGeo));

  const beforeTime = timestampMillis(input.before);
  const afterTime = timestampMillis(input.after);
  const timeScore =
    beforeTime === undefined || afterTime === undefined
      ? NEUTRAL_EXIF_SCORE
      : clampUnit(
          1 /
            (1 +
              Math.abs(afterTime - beforeTime) /
                TIME_PROXIMITY_WINDOW_MS),
        );

  return { geoScore, timeScore };
}
