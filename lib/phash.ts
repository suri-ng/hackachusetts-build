// Perceptual hashing + Hamming-distance duplicate matching (sharp).
// Implements a canonical 64-bit, 8x8 average hash.

import sharp from 'sharp';

export const HASH_SIZE = 8;
export const HASH_HEX_LENGTH = (HASH_SIZE * HASH_SIZE) / 4;
export const DEFAULT_DUPLICATE_MAX_DISTANCE = 5;

const HEX_PATTERN = /^[0-9a-f]+$/i;
const NIBBLE_POPCOUNT = Object.freeze([
  0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4,
]);

function normalizeHex(value: string, name: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a hexadecimal string`);
  }

  const trimmed = value.trim();
  const normalized = /^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed;
  if (normalized.length === 0 || !HEX_PATTERN.test(normalized)) {
    throw new TypeError(`${name} must contain only hexadecimal digits`);
  }

  return normalized.toLowerCase();
}

/**
 * Produces an 8x8 average hash as exactly 16 lowercase hexadecimal characters.
 * Auto-orientation, alpha flattening, resizing, and grayscale conversion make
 * equivalent encoded image formats use the same 64 luminance comparisons.
 */
export async function perceptualHash(image: Buffer): Promise<string> {
  if (!Buffer.isBuffer(image) || image.length === 0) {
    throw new TypeError('image must be a non-empty Buffer');
  }

  const { data, info } = await sharp(image, { failOn: 'error' })
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(HASH_SIZE, HASH_SIZE, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = HASH_SIZE * HASH_SIZE;
  if (
    info.width !== HASH_SIZE ||
    info.height !== HASH_SIZE ||
    info.channels < 1 ||
    data.length < pixelCount * info.channels
  ) {
    throw new Error('sharp returned an unexpected average-hash raster');
  }

  const pixels = new Array<number>(pixelCount);
  let total = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const luminance = data[index * info.channels];
    pixels[index] = luminance;
    total += luminance;
  }
  const average = total / pixelCount;

  let hash = '';
  for (let offset = 0; offset < pixelCount; offset += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      nibble = (nibble << 1) | (pixels[offset + bit] >= average ? 1 : 0);
    }
    hash += nibble.toString(16);
  }

  return hash.padStart(HASH_HEX_LENGTH, '0');
}

/**
 * Counts differing bits in equally wide hexadecimal values without narrowing
 * the 64-bit hash through JavaScript's 32-bit bitwise number operators.
 */
export function hammingDistance(a: string, b: string): number {
  const left = normalizeHex(a, 'a');
  const right = normalizeHex(b, 'b');
  if (left.length !== right.length) {
    throw new RangeError('hex values must have the same number of digits');
  }

  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const xor = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    distance += NIBBLE_POPCOUNT[xor];
  }
  return distance;
}

/** Returns true when any known hash is within the inclusive bit threshold. */
export function isDuplicate(
  hash: string,
  known: string[],
  maxDistance: number = DEFAULT_DUPLICATE_MAX_DISTANCE,
): boolean {
  const normalizedHash = normalizeHex(hash, 'hash');
  if (!Array.isArray(known)) {
    throw new TypeError('known must be an array of hexadecimal strings');
  }
  if (!Number.isFinite(maxDistance)) {
    throw new TypeError('maxDistance must be a finite number');
  }

  const threshold = Math.min(
    normalizedHash.length * 4,
    Math.max(0, Math.trunc(maxDistance)),
  );

  return known.some(
    (candidate) => hammingDistance(normalizedHash, candidate) <= threshold,
  );
}
