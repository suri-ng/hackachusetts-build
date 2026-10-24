import { describe, it, expect } from 'vitest';
import {
  hammingDistance,
  isDuplicate,
  DEFAULT_DUPLICATE_MAX_DISTANCE,
  HASH_HEX_LENGTH,
} from './phash';
import { arrayOf, constantFrom, forAll } from './test-support/property';

const hexDigit = constantFrom(..."0123456789abcdef".split(''));
const hexHash = arrayOf(hexDigit, HASH_HEX_LENGTH, HASH_HEX_LENGTH);

function toHex(digits: string[]): string {
  return digits.join('');
}

describe('hammingDistance', () => {
  it('is zero for identical hashes and symmetric (Property 13 support)', () => {
    forAll(hexHash, (digits) => {
      const hash = toHex(digits);
      expect(hammingDistance(hash, hash)).toBe(0);
    });
  });

  it('is symmetric: distance(a,b) === distance(b,a)', () => {
    forAll(hexHash, (digits) => {
      const a = toHex(digits);
      const b = toHex(digits.slice().reverse());
      expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
    });
  });

  it('counts differing bits correctly for known values', () => {
    // 0x0 (0000) vs 0xf (1111) => 4 bits differ per nibble.
    expect(hammingDistance('0', 'f')).toBe(4);
    expect(hammingDistance('00', 'ff')).toBe(8);
    expect(hammingDistance('0', '1')).toBe(1);
  });

  it('throws on mismatched lengths', () => {
    expect(() => hammingDistance('00', '000')).toThrow();
  });
});

describe('isDuplicate', () => {
  it('flags a hash that exactly matches a known hash', () => {
    forAll(hexHash, (digits) => {
      const hash = toHex(digits);
      expect(isDuplicate(hash, [hash])).toBe(true);
    });
  });

  it('does not flag a hash that is far from every known hash', () => {
    const hash = 'ffffffffffffffff';
    const known = ['0000000000000000'];
    expect(isDuplicate(hash, known, DEFAULT_DUPLICATE_MAX_DISTANCE)).toBe(false);
  });

  it('flags a hash within the max-distance threshold', () => {
    const hash = '0000000000000000';
    // One nibble differs by one bit => distance 1, within default threshold.
    const near = '0000000000000001';
    expect(isDuplicate(hash, [near])).toBe(true);
  });
});
