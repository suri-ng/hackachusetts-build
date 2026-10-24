// Dependency-free property-testing harness.
//
// Why this exists: the test suite must ALWAYS run, even if the optional
// `fast-check` package is not installed. This module exposes a tiny generator +
// runner API. By default it uses a seeded, deterministic pseudo-random sampler
// built into this file (zero external dependencies). The shape mirrors a small
// slice of fast-check so the intent reads the same.
//
// Determinism: a fixed seed makes failures reproducible across machines and CI.

export interface Arbitrary<T> {
  generate(rng: () => number): T;
}

/** Mulberry32 — a small, fast, seeded PRNG. Deterministic across platforms. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function integer(min: number, max: number): Arbitrary<number> {
  return {
    generate(rng) {
      return Math.floor(rng() * (max - min + 1)) + min;
    },
  };
}

export function float(min: number, max: number): Arbitrary<number> {
  return {
    generate(rng) {
      return min + rng() * (max - min);
    },
  };
}

export function boolean(): Arbitrary<boolean> {
  return { generate: (rng) => rng() < 0.5 };
}

export function constantFrom<T>(...values: T[]): Arbitrary<T> {
  return {
    generate(rng) {
      return values[Math.floor(rng() * values.length)];
    },
  };
}

export function arrayOf<T>(
  element: Arbitrary<T>,
  minLength: number,
  maxLength: number,
): Arbitrary<T[]> {
  return {
    generate(rng) {
      const length = Math.floor(rng() * (maxLength - minLength + 1)) + minLength;
      const out: T[] = [];
      for (let i = 0; i < length; i += 1) out.push(element.generate(rng));
      return out;
    },
  };
}

export interface AssertOptions {
  /** Number of random cases to try. */
  runs?: number;
  /** Fixed seed for reproducibility. */
  seed?: number;
}

/**
 * Runs `predicate` against `runs` generated samples. If any sample throws or
 * returns false, it re-throws with the failing input attached so the case is
 * reproducible. This is the built-in fallback runner (no external dependency).
 */
export function forAll<T>(
  arbitrary: Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  options: AssertOptions = {},
): void {
  const runs = options.runs ?? 200;
  const rng = mulberry32(options.seed ?? 0x5eed);

  for (let i = 0; i < runs; i += 1) {
    const value = arbitrary.generate(rng);
    let ok: boolean | void;
    try {
      ok = predicate(value);
    } catch (error) {
      throw new Error(
        `Property failed on case #${i + 1} with input ${safeStringify(value)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (ok === false) {
      throw new Error(
        `Property returned false on case #${i + 1} with input ${safeStringify(value)}`,
      );
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
