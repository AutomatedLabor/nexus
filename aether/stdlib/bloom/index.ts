/**
 * Aether stdlib — `bloom` module.
 *
 * A Bloom filter — a space-efficient probabilistic data structure
 * for set membership testing.  False positives are possible (an
 * element not in the set might be reported as "probably in"), but
 * false negatives are impossible (an element reported as "not in"
 * is definitely not in).
 *
 * Implementation: a bit array of `m` bits, plus `k` hash functions.
 * Adding an element sets the `k` bits at positions hash_i(element) mod m.
 * Querying an element checks the `k` bits; if all are set, the element
 * is "probably in"; if any is unset, the element is "definitely not in".
 *
 * The false-positive probability is approximately
 *   p ≈ (1 - e^(-kn/m))^k
 * where n is the number of elements added, m is the bit array size,
 * and k is the number of hash functions.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BloomFilter {
  /** Bit array, stored as Uint8Array (each byte holds 8 bits). */
  bits: Uint8Array;
  /** Number of bits in the array (= bits.length * 8). */
  m: number;
  /** Number of hash functions. */
  k: number;
  /** Expected number of elements (used for capacity planning). */
  expected: number;
  /** Target false-positive rate. */
  fpRate: number;
  /** Number of elements added. */
  count: number;
}

// ---------------------------------------------------------------------------
// Hashing helpers — uses two independent hash functions (h1, h2) and
// derives k hashes via the "double hashing" trick: h_i(x) = h1(x) + i*h2(x).
// This is the standard Kirsch-Mitzenmacher technique.
// ---------------------------------------------------------------------------

function hash1(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force to unsigned 32-bit
  return h >>> 0;
}

function hash2(s: string): number {
  // murmur-like 32-bit
  let h = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

function hashAt(s: string, i: number, m: number): number {
  // h_i(x) = (h1(x) + i * h2(x)) mod m
  const h = (hash1(s) + Math.imul(i, hash2(s))) >>> 0;
  return h % m;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Compute the optimal number of bits `m` given an expected element count
 * `n` and a target false-positive rate `p`:
 *   m = -n * ln(p) / (ln(2))^2
 */
function optimalM(n: number, p: number): number {
  if (n <= 0) return 8;
  const m = Math.ceil((-n * Math.log(p)) / (Math.log(2) ** 2));
  // Round up to a multiple of 8 (byte boundary).
  return Math.max(8, Math.ceil(m / 8) * 8);
}

/**
 * Compute the optimal number of hash functions `k` given `m` bits and
 * `n` expected elements:
 *   k = (m / n) * ln(2)
 */
function optimalK(m: number, n: number): number {
  if (n <= 0) return 1;
  const k = Math.ceil((m / n) * Math.log(2));
  return Math.max(1, Math.min(k, 32));  // cap at 32 to keep hashing cheap
}

/** Create a new Bloom filter for `expected` elements with target
 *  false-positive rate `fp_rate` (default 0.01 = 1%). */
export function new_(expected: number, fp_rate: number = 0.01): BloomFilter {
  if (typeof expected !== "number" || !Number.isFinite(expected) || expected <= 0) {
    throw new Error("bloom.new: expected must be a positive number, got " + expected);
  }
  if (typeof fp_rate !== "number" || !Number.isFinite(fp_rate) || fp_rate <= 0 || fp_rate >= 1) {
    throw new Error("bloom.new: fp_rate must be in (0, 1), got " + fp_rate);
  }
  const m = optimalM(expected, fp_rate);
  const k = optimalK(m, expected);
  return {
    bits: new Uint8Array(m / 8),
    m,
    k,
    expected,
    fpRate: fp_rate,
    count: 0,
  };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function getBit(bf: BloomFilter, idx: number): boolean {
  const byteIdx = idx >>> 3;
  const bitIdx = idx & 7;
  return ((bf.bits[byteIdx] >> bitIdx) & 1) === 1;
}

function setBit(bf: BloomFilter, idx: number): void {
  const byteIdx = idx >>> 3;
  const bitIdx = idx & 7;
  bf.bits[byteIdx] |= (1 << bitIdx);
}

/** Add an element to the filter.  Returns the filter (chainable). */
export function add(bf: BloomFilter, s: string): BloomFilter {
  assertBloom(bf, "bloom.add");
  assertString(s, "bloom.add");
  for (let i = 0; i < bf.k; i++) {
    setBit(bf, hashAt(s, i, bf.m));
  }
  bf.count++;
  return bf;
}

/** Test whether an element is "probably" in the filter.
 *  Returns true if the element is probably in (could be a false positive).
 *  Returns false if the element is definitely not in (no false negatives). */
export function contains(bf: BloomFilter, s: string): boolean {
  assertBloom(bf, "bloom.contains");
  assertString(s, "bloom.contains");
  for (let i = 0; i < bf.k; i++) {
    if (!getBit(bf, hashAt(s, i, bf.m))) return false;
  }
  return true;
}

/** Compute the current false-positive probability given the number of
 *  elements added.  Uses the standard formula:
 *    p ≈ (1 - e^(-kn/m))^k
 */
export function false_positive_prob(bf: BloomFilter): number {
  assertBloom(bf, "bloom.false_positive_prob");
  const n = bf.count;
  if (n === 0) return 0;
  const exponent = (-bf.k * n) / bf.m;
  const inner = 1 - Math.exp(exponent);
  return Math.pow(inner, bf.k);
}

/** Number of elements added. */
export function count(bf: BloomFilter): number {
  assertBloom(bf, "bloom.count");
  return bf.count;
}

/** Maximum number of elements the filter was designed for. */
export function capacity(bf: BloomFilter): number {
  assertBloom(bf, "bloom.capacity");
  return bf.expected;
}

/** Number of hash functions used. */
export function hash_funcs(bf: BloomFilter): number {
  assertBloom(bf, "bloom.hash_funcs");
  return bf.k;
}

/** Merge two Bloom filters (must have the same m and k) into a new one.
 *  The result is the union of the two filters (OR of the bit arrays). */
export function merge(a: BloomFilter, b: BloomFilter): BloomFilter {
  assertBloom(a, "bloom.merge");
  assertBloom(b, "bloom.merge");
  if (a.m !== b.m) throw new Error("bloom.merge: filters must have the same bit size (m), got " + a.m + " and " + b.m);
  if (a.k !== b.k) throw new Error("bloom.merge: filters must have the same hash count (k), got " + a.k + " and " + b.k);
  const bits = new Uint8Array(a.bits.length);
  for (let i = 0; i < a.bits.length; i++) {
    bits[i] = a.bits[i] | b.bits[i];
  }
  return {
    bits,
    m: a.m,
    k: a.k,
    expected: a.expected + b.expected,
    fpRate: Math.max(a.fpRate, b.fpRate),
    count: a.count + b.count,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "bloom",
  fns: [
    { name: "bloomNew", sig: "(expected: int, fp_rate?: float) -> BloomFilter", desc: "Create a new Bloom filter for `expected` elements with target fp rate." },
    { name: "bloomAdd", sig: "(bf: BloomFilter, s: string) -> BloomFilter", desc: "Add an element to the filter; returns bf for chaining." },
    { name: "bloomContains", sig: "(bf: BloomFilter, s: string) -> bool", desc: "Test membership (false = definitely not in; true = probably in)." },
    { name: "bloomFalsePositiveProb", sig: "(bf: BloomFilter) -> float", desc: "Current false-positive probability given the count." },
    { name: "bloomCount", sig: "(bf: BloomFilter) -> int", desc: "Number of elements added so far." },
    { name: "bloomCapacity", sig: "(bf: BloomFilter) -> int", desc: "Designed capacity (the `expected` argument to bloomNew)." },
    { name: "bloomHashFuncs", sig: "(bf: BloomFilter) -> int", desc: "Number of hash functions used." },
    { name: "bloomMerge", sig: "(a: BloomFilter, b: BloomFilter) -> BloomFilter", desc: "Merge two compatible filters into a new one (bit-OR)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("bloomNew", new_);
  registerBuiltin("bloomAdd", add);
  registerBuiltin("bloomContains", contains);
  registerBuiltin("bloomFalsePositiveProb", false_positive_prob);
  registerBuiltin("bloomCount", count);
  registerBuiltin("bloomCapacity", capacity);
  registerBuiltin("bloomHashFuncs", hash_funcs);
  registerBuiltin("bloomMerge", merge);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertBloom(x: any, fn: string): asserts x is BloomFilter {
  if (typeof x !== "object" || x === null ||
      !(x.bits instanceof Uint8Array) ||
      typeof x.m !== "number" ||
      typeof x.k !== "number" ||
      typeof x.count !== "number") {
    throw new Error(fn + ": expected BloomFilter, got " + kind(x));
  }
}

function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") {
    throw new Error(fn + ": expected string, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (x instanceof Uint8Array) return "Uint8Array";
  return typeof x;
}
