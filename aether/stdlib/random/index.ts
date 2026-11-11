/**
 * Aether stdlib — `random` module.
 *
 * Pseudo-random number generation with a deterministic, seedable
 * PRNG.  We use xorshift128 (Marsaglia, 2003) — a small, fast,
 * well-tested 32-bit PRNG with a 128-bit state, good statistical
 * properties, and full reproducibility from a seed.  The seed is set
 * via `randomSeed(seed)`; the state is module-private.  Two threads
 * of execution in the same Aether process share the same state
 * (no per-instance PRNG).
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 *
 * NOTE: this is NOT cryptographically secure.  Use the `crypto`
 * module for security-sensitive randomness.
 */

// ---------------------------------------------------------------------------
// State — xorshift128 (4 × 32-bit words)
// ---------------------------------------------------------------------------

let x = 0x12345678 | 0;
let y = 0x9e3779b9 | 0;
let z = 0xdeadbeef | 0;
let w = 0x1234abcd | 0;

function nextU32(): number {
  const t = (x ^ (x << 11)) | 0;        // 32-bit
  x = y;
  y = z;
  z = w;
  // The `>>> 0` casts ensure unsigned 32-bit semantics.
  w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
  return w;
}

function nextFloat(): number {
  // Take the next u32 and divide by 2^32 (gives [0, 1)).
  return nextU32() / 4294967296;  // 2^32
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/** Seed the PRNG with an integer (any size).  Subsequent calls to
 *  `randomNext`, `randomNextInt`, … will produce a deterministic stream
 *  based on this seed. */
export function randomSeed(seed: number): void {
  if (typeof seed !== "number" || !Number.isFinite(seed)) {
    throw new Error("randomSeed: seed must be a number");
  }
  // Use a simple splitmix32 to expand a single 32-bit seed into 4 words.
  let s = (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  function splitmix(): number {
    s = (Math.imul(s, 0x85ebca6b) + 0xc2b2ae35) | 0;
    let r = s;
    r = (Math.imul(r ^ (r >>> 16), 0x85ebca6b)) | 0;
    r = (Math.imul(r ^ (r >>> 13), 0xc2b2ae35)) | 0;
    r = (r ^ (r >>> 16)) >>> 0;
    return r;
  }
  x = splitmix();
  y = splitmix();
  z = splitmix();
  w = splitmix();
  // Burn 8 values to scramble out of any near-zero initial state.
  for (let i = 0; i < 8; i++) nextU32();
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/** The next float in [0, 1). */
export function randomNext(): number {
  return nextFloat();
}

/** The next integer in `[lo, hi]` (inclusive). */
export function randomNextInt(lo: number, hi: number): number {
  if (typeof lo !== "number" || typeof hi !== "number" ||
      !Number.isInteger(lo) || !Number.isInteger(hi)) {
    throw new Error("randomNextInt: lo and hi must be integers");
  }
  if (lo > hi) throw new Error("randomNextInt: lo > hi");
  const range = hi - lo + 1;
  // Use modulo reduction — slight bias when range isn't a power of 2,
  // acceptable for stdlib PRNG use.
  return lo + (nextU32() % range);
}

/** A float in `[lo, hi)`. */
export function randomNextFloat(lo: number, hi: number): number {
  if (typeof lo !== "number" || typeof hi !== "number" ||
      !Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new Error("randomNextFloat: lo and hi must be finite numbers");
  }
  if (lo > hi) throw new Error("randomNextFloat: lo > hi");
  return lo + (hi - lo) * nextFloat();
}

/** A random boolean (true / false with equal probability). */
export function randomBool(): boolean {
  return (nextU32() & 1) === 1;
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/** A random element from `arr`.  Panics if `arr` is empty. */
export function randomPick<T>(arr: T[]): T {
  if (!Array.isArray(arr)) throw new Error("randomPick: expected array");
  if (arr.length === 0) throw new Error("randomPick: array is empty");
  return arr[Math.floor(nextFloat() * arr.length)];
}

/** Shuffle `arr` into a new array (Fisher-Yates).  The input is not mutated. */
export function randomShuffle<T>(arr: T[]): T[] {
  if (!Array.isArray(arr)) throw new Error("randomShuffle: expected array");
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/** Pick `n` distinct elements from `arr` (without replacement).
 *  Panics if `n > arr.length`. */
export function randomSample<T>(arr: T[], n: number): T[] {
  if (!Array.isArray(arr)) throw new Error("randomSample: expected array");
  if (!Number.isInteger(n) || n < 0) throw new Error("randomSample: n must be a non-negative int");
  if (n > arr.length) throw new Error("randomSample: n > array length");
  // Fisher-Yates a copy, take the first n.
  const shuffled = randomShuffle(arr);
  return shuffled.slice(0, n);
}

/** Pick `n` elements from `arr` WITH replacement. */
export function randomChoice<T>(arr: T[], n: number): T[] {
  if (!Array.isArray(arr)) throw new Error("randomChoice: expected array");
  if (!Number.isInteger(n) || n < 0) throw new Error("randomChoice: n must be a non-negative int");
  if (arr.length === 0) throw new Error("randomChoice: array is empty");
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(randomPick(arr));
  return out;
}

/** An array of `n` distinct integers in `[lo, hi]`. */
export function randomInts(n: number, lo: number, hi: number): number[] {
  if (!Number.isInteger(n) || n < 0) throw new Error("randomInts: n must be a non-negative int");
  if (hi - lo + 1 < n) throw new Error("randomInts: range smaller than n");
  const pool: number[] = [];
  for (let i = lo; i <= hi; i++) pool.push(i);
  return randomSample(pool, n);
}

/** A random integer in `[lo, hi]` — alias for `randomNextInt`. */
export function randomRange(lo: number, hi: number): number {
  return randomNextInt(lo, hi);
}

// ---------------------------------------------------------------------------
// Bytes & strings
// ---------------------------------------------------------------------------

/** An array of `n` random bytes (ints in 0-255). */
export function randomBytes(n: number): number[] {
  if (!Number.isInteger(n) || n < 0) throw new Error("randomBytes: n must be a non-negative int");
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(nextU32() & 0xff);
  return out;
}

/** A string of `n` random lowercase hex characters. */
export function randomHex(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error("randomHex: n must be a non-negative int");
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[nextU32() & 0xf];
  return out;
}

/** A UUID v4 (lowercase, with dashes). */
export function randomUuid(): string {
  // 16 random bytes, then set version (4) and variant (8/9/a/b).
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20, 32);
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

/** A standard normal via Box-Muller. */
export function randomGaussian(mean: number, std: number): number {
  if (typeof mean !== "number" || !Number.isFinite(mean)) throw new Error("randomGaussian: mean must be a number");
  if (typeof std !== "number" || !Number.isFinite(std) || std < 0) throw new Error("randomGaussian: std must be non-negative");
  if (std === 0) return mean;
  // Box-Muller: two uniforms -> one normal.
  const u1 = Math.max(nextFloat(), 1e-12);  // avoid log(0)
  const u2 = nextFloat();
  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  // Use only one of the two normals; the other is wasted.
  return mean + std * r * Math.cos(theta);
}

/** Pick an index from `items` weighted by `weights`. */
export function randomWeighted<T>(items: T[], weights: number[]): T {
  if (!Array.isArray(items) || !Array.isArray(weights)) {
    throw new Error("randomWeighted: expected arrays");
  }
  if (items.length !== weights.length) {
    throw new Error("randomWeighted: items and weights must have the same length");
  }
  if (items.length === 0) throw new Error("randomWeighted: arrays are empty");
  let total = 0;
  for (const w of weights) {
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) {
      throw new Error("randomWeighted: weights must be non-negative finite numbers");
    }
    total += w;
  }
  if (total === 0) throw new Error("randomWeighted: total weight is zero");
  let r = nextFloat() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "random",
  fns: [
    { name: "randomSeed", sig: "(seed: number) -> void", desc: "Seed the PRNG for deterministic output." },
    { name: "randomNext", sig: "() -> number", desc: "Next float in [0, 1)." },
    { name: "randomNextInt", sig: "(lo: int, hi: int) -> int", desc: "Next integer in [lo, hi] (inclusive)." },
    { name: "randomNextFloat", sig: "(lo: number, hi: number) -> number", desc: "Float in [lo, hi)." },
    { name: "randomBool", sig: "() -> bool", desc: "Random true/false with equal probability." },
    { name: "randomPick", sig: "(arr) -> any", desc: "A random element from arr (panics if empty)." },
    { name: "randomShuffle", sig: "(arr) -> any[]", desc: "Fisher-Yates shuffle into a new array." },
    { name: "randomSample", sig: "(arr, n) -> any[]", desc: "n distinct elements from arr (without replacement)." },
    { name: "randomChoice", sig: "(arr, n) -> any[]", desc: "n elements from arr WITH replacement." },
    { name: "randomInts", sig: "(n, lo, hi) -> int[]", desc: "n distinct integers in [lo, hi]." },
    { name: "randomRange", sig: "(lo, hi) -> int", desc: "A random integer in [lo, hi] (alias of randomNextInt)." },
    { name: "randomBytes", sig: "(n: int) -> int[]", desc: "n random bytes (each 0-255)." },
    { name: "randomHex", sig: "(n: int) -> string", desc: "n random lowercase hex characters." },
    { name: "randomUuid", sig: "() -> string", desc: "A UUID v4 (lowercase, with dashes)." },
    { name: "randomGaussian", sig: "(mean, std) -> number", desc: "Normal distribution via Box-Muller." },
    { name: "randomWeighted", sig: "(items, weights) -> any", desc: "Pick an item with weighted probability." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("randomSeed", randomSeed);
  registerBuiltin("randomNext", randomNext);
  registerBuiltin("randomNextInt", randomNextInt);
  registerBuiltin("randomNextFloat", randomNextFloat);
  registerBuiltin("randomBool", randomBool);
  registerBuiltin("randomPick", randomPick);
  registerBuiltin("randomShuffle", randomShuffle);
  registerBuiltin("randomSample", randomSample);
  registerBuiltin("randomChoice", randomChoice);
  registerBuiltin("randomInts", randomInts);
  registerBuiltin("randomRange", randomRange);
  registerBuiltin("randomBytes", randomBytes);
  registerBuiltin("randomHex", randomHex);
  registerBuiltin("randomUuid", randomUuid);
  registerBuiltin("randomGaussian", randomGaussian);
  registerBuiltin("randomWeighted", randomWeighted);
}

// Reset to a fixed seed at module load so the stream is deterministic
// out of the box (matches the "reproducibility by default" stance — see
// ADR-017).
randomSeed(0x12345678);
