// Perceptual hashing + Hamming-distance duplicate match (sharp).
// Implemented in Task 4.1 (Req 6.1, 6.2).

/** sharp-normalized aHash/dHash. */
export function perceptualHash(_image: Buffer): Promise<string> {
  throw new Error('not_implemented: perceptualHash (Task 4.1)');
}

export function hammingDistance(_a: string, _b: string): number {
  throw new Error('not_implemented: hammingDistance (Task 4.1)');
}

export function isDuplicate(
  _hash: string,
  _known: string[],
  _maxDistance?: number,
): boolean {
  throw new Error('not_implemented: isDuplicate (Task 4.1)');
}
