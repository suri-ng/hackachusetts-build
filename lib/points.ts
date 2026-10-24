// Pure points-wallet arithmetic. Points never alter funded-bar progress.

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return Math.max(0, value);
}

function finiteProduct(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} exceeds the finite numeric range`);
  }
  return value;
}

/** Points awarded for one verified cleanup. No rounding is applied. */
export function pointsForCleanup(base: number, multiplier: number): number {
  const safeBase = nonNegativeFinite(base, 'base');
  const safeMultiplier = nonNegativeFinite(multiplier, 'multiplier');
  return finiteProduct(safeBase * safeMultiplier, 'cleanup points');
}

/** Derived wallet balance for a verified-cleanup count. No rounding is applied. */
export function walletTotal(
  verifiedCount: number,
  base: number,
  multiplier: number,
): number {
  const safeCount = nonNegativeFinite(verifiedCount, 'verifiedCount');
  return finiteProduct(
    safeCount * pointsForCleanup(base, multiplier),
    'wallet total',
  );
}
