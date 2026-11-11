/**
 * Aether stdlib — `list` module.
 *
 * Generic list/sequence utilities: zipping, splitting, grouping, scanning,
 * and combinatorial generation (permutations, combinations).  Every function
 * is a pure TypeScript implementation that operates on plain JavaScript
 * arrays.  Functions that take a callback (e.g. `takeWhile`, `groupBy`) call
 * the callback with the element and its index.
 *
 * Each function throws a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.  The module exports a
 * `register(env)` function that wires every function into the evaluator.
 */

// ---------------------------------------------------------------------------
// Zipping & interleaving
// ---------------------------------------------------------------------------

/** Pairwise combine two arrays into an array of 2-tuples, stopping at the shorter. */
export function zip<A, B>(a: A[], b: B[]): Array<[A, B]> {
  assertArray(a, "zip");
  assertArray(b, "zip");
  const n = Math.min(a.length, b.length);
  const out: Array<[A, B]> = new Array(n);
  for (let i = 0; i < n; i++) out[i] = [a[i], b[i]];
  return out;
}

/** Combine three arrays into 3-tuples, stopping at the shortest. */
export function zip3<A, B, C>(a: A[], b: B[], c: C[]): Array<[A, B, C]> {
  assertArray(a, "zip3");
  assertArray(b, "zip3");
  assertArray(c, "zip3");
  const n = Math.min(a.length, b.length, c.length);
  const out: Array<[A, B, C]> = new Array(n);
  for (let i = 0; i < n; i++) out[i] = [a[i], b[i], c[i]];
  return out;
}

/** Reverse of `zip`: an array of pairs -> a pair of arrays. */
export function unzip<T, U>(arr: Array<[T, U]>): [T[], U[]] {
  assertArray(arr, "unzip");
  const n = arr.length;
  const as: T[] = new Array(n);
  const bs: U[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const pair = arr[i];
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error("unzip: expected array of 2-tuples");
    }
    as[i] = pair[0];
    bs[i] = pair[1];
  }
  return [as, bs];
}

/** Interleave two arrays element-by-element, appending the remainder of the longer. */
export function interleave<A, B>(a: A[], b: B[]): Array<A | B> {
  assertArray(a, "interleave");
  assertArray(b, "interleave");
  const n = Math.min(a.length, b.length);
  const out: Array<A | B> = [];
  for (let i = 0; i < n; i++) {
    out.push(a[i]);
    out.push(b[i]);
  }
  for (let i = n; i < a.length; i++) out.push(a[i]);
  for (let i = n; i < b.length; i++) out.push(b[i]);
  return out;
}

/** Cycle through `arr` to produce an array of length `n`. */
export function cycle<T>(arr: T[], n: number): T[] {
  assertArray(arr, "cycle");
  assertInt(n, "cycle");
  if (n < 0) throw new Error("cycle: n must be non-negative");
  if (arr.length === 0) throw new Error("cycle: cannot cycle an empty array");
  const out: T[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = arr[i % arr.length];
  return out;
}

/** Produce an array containing `v` repeated `n` times. */
export function replicate<T>(v: T, n: number): T[] {
  assertInt(n, "replicate");
  if (n < 0) throw new Error("replicate: n must be non-negative");
  const out: T[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Taking & dropping
// ---------------------------------------------------------------------------

/** Take the first `n` elements (or last |n| if n is negative). */
export function take<T>(arr: T[], n: number): T[] {
  assertArray(arr, "take");
  assertInt(n, "take");
  if (n < 0) return arr.slice(Math.max(0, arr.length + n));
  return arr.slice(0, n);
}

/** Drop the first `n` elements (or last |n| if n is negative). */
export function drop<T>(arr: T[], n: number): T[] {
  assertArray(arr, "drop");
  assertInt(n, "drop");
  if (n < 0) return arr.slice(0, Math.max(0, arr.length + n));
  return arr.slice(n);
}

/** Take the longest prefix whose elements satisfy `fn`. */
export function takeWhile<T>(arr: T[], fn: (x: T, i: number) => boolean): T[] {
  assertArray(arr, "takeWhile");
  if (typeof fn !== "function") throw new Error("takeWhile: expected function");
  const out: T[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (!fn(arr[i], i)) break;
    out.push(arr[i]);
  }
  return out;
}

/** Drop the longest prefix whose elements satisfy `fn`; keep the rest. */
export function dropWhile<T>(arr: T[], fn: (x: T, i: number) => boolean): T[] {
  assertArray(arr, "dropWhile");
  if (typeof fn !== "function") throw new Error("dropWhile: expected function");
  let i = 0;
  while (i < arr.length && fn(arr[i], i)) i++;
  return arr.slice(i);
}

/** Split into (prefix satisfying fn, rest).  Haskell's `span`. */
export function span<T>(arr: T[], fn: (x: T, i: number) => boolean): [T[], T[]] {
  assertArray(arr, "span");
  if (typeof fn !== "function") throw new Error("span: expected function");
  let i = 0;
  while (i < arr.length && fn(arr[i], i)) i++;
  return [arr.slice(0, i), arr.slice(i)];
}

/** Split into (prefix NOT satisfying fn, rest).  Haskell's `break`. */
export function break_<T>(arr: T[], fn: (x: T, i: number) => boolean): [T[], T[]] {
  assertArray(arr, "break_");
  if (typeof fn !== "function") throw new Error("break_: expected function");
  let i = 0;
  while (i < arr.length && !fn(arr[i], i)) i++;
  return [arr.slice(0, i), arr.slice(i)];
}

/** Partition into (satisfying, not-satisfying).  Stable. */
export function partition<T>(arr: T[], fn: (x: T, i: number) => boolean): [T[], T[]] {
  assertArray(arr, "partition");
  if (typeof fn !== "function") throw new Error("partition: expected function");
  const yes: T[] = [];
  const no: T[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (fn(arr[i], i)) yes.push(arr[i]);
    else no.push(arr[i]);
  }
  return [yes, no];
}

// ---------------------------------------------------------------------------
// Grouping & windowing
// ---------------------------------------------------------------------------

/** Split array into chunks of length `n`.  The last chunk may be shorter. */
export function group<T>(arr: T[], n: number): T[][] {
  assertArray(arr, "group");
  assertInt(n, "group");
  if (n <= 0) throw new Error("group: chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Group consecutive elements that share the same key (fn returns the key). */
export function groupBy<T, K>(arr: T[], fn: (x: T, i: number) => K): T[][] {
  assertArray(arr, "groupBy");
  if (typeof fn !== "function") throw new Error("groupBy: expected function");
  if (arr.length === 0) return [];
  const out: T[][] = [[arr[0]]];
  let lastKey: K = fn(arr[0], 0);
  for (let i = 1; i < arr.length; i++) {
    const k = fn(arr[i], i);
    if (k === lastKey) out[out.length - 1].push(arr[i]);
    else { out.push([arr[i]]); lastKey = k; }
  }
  return out;
}

/** Sliding window of size `n`.  Produces arr.length - n + 1 windows. */
export function window<T>(arr: T[], n: number): T[][] {
  assertArray(arr, "window");
  assertInt(n, "window");
  if (n <= 0) throw new Error("window: size must be positive");
  if (n > arr.length) return [];
  const out: T[][] = [];
  for (let i = 0; i + n <= arr.length; i++) out.push(arr.slice(i, i + n));
  return out;
}

/** Insert `sep` between every pair of adjacent elements.  Haskell's `intersperse`. */
export function intersperse<T>(arr: T[], sep: T): T[] {
  assertArray(arr, "intersperse");
  if (arr.length === 0) return [];
  const out: T[] = new Array(arr.length * 2 - 1);
  out[0] = arr[0];
  for (let i = 1; i < arr.length; i++) {
    out[i * 2 - 1] = sep;
    out[i * 2] = arr[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scanning & unfolding
// ---------------------------------------------------------------------------

/** Like reduce but keeps every intermediate accumulator (n+1 results). */
export function scan<T, A>(arr: T[], fn: (acc: A, x: T, i: number) => A, init: A): A[] {
  assertArray(arr, "scan");
  if (typeof fn !== "function") throw new Error("scan: expected function");
  const out: A[] = new Array(arr.length + 1);
  out[0] = init;
  let acc = init;
  for (let i = 0; i < arr.length; i++) {
    acc = fn(acc, arr[i], i);
    out[i + 1] = acc;
  }
  return out;
}

/** Right-to-left scan.  `scanr([a,b,c], f, z) = [f(a, f(b, f(c, z))), ...]`. */
export function scanr<T, A>(arr: T[], fn: (x: T, acc: A, i: number) => A, init: A): A[] {
  assertArray(arr, "scanr");
  if (typeof fn !== "function") throw new Error("scanr: expected function");
  const n = arr.length;
  const out: A[] = new Array(n + 1);
  out[n] = init;
  let acc = init;
  for (let i = n - 1; i >= 0; i--) {
    acc = fn(arr[i], acc, i);
    out[i] = acc;
  }
  return out;
}

/** Build an array of length `n` by repeatedly applying `fn` to the previous value. */
export function unfold<T>(init: T, fn: (x: T, i: number) => T, n: number): T[] {
  assertInt(n, "unfold");
  if (typeof fn !== "function") throw new Error("unfold: expected function");
  if (n < 0) throw new Error("unfold: n must be non-negative");
  const out: T[] = new Array(n);
  let v = init;
  for (let i = 0; i < n; i++) {
    out[i] = v;
    v = fn(v, i);
  }
  return out;
}

/** Numeric range starting at `start`, adding `step` each iteration, `n` elements. */
export function rangeBy(start: number, step: number, n: number): number[] {
  assertInt(n, "rangeBy");
  if (n < 0) throw new Error("rangeBy: n must be non-negative");
  const out: number[] = new Array(n);
  let v = start;
  for (let i = 0; i < n; i++) {
    out[i] = v;
    v += step;
  }
  return out;
}

/** Like `unfold` but the function receives the iteration index. */
export function iterate<T>(fn: (x: T, i: number) => T, n: number, seed: T): T[] {
  assertInt(n, "iterate");
  if (typeof fn !== "function") throw new Error("iterate: expected function");
  if (n < 0) throw new Error("iterate: n must be non-negative");
  const out: T[] = new Array(n);
  let v = seed;
  for (let i = 0; i < n; i++) {
    out[i] = v;
    v = fn(v, i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Combinatorics & rotation
// ---------------------------------------------------------------------------

/** All permutations of `arr` (n! results).  Order is lexicographic for distinct inputs. */
export function permutations<T>(arr: T[]): T[][] {
  assertArray(arr, "permutations");
  const n = arr.length;
  const out: T[][] = [];
  const idx = arr.map((_, i) => i);
  while (true) {
    out.push(idx.map((i) => arr[i]));
    // Find largest k with idx[k] < idx[k+1].
    let k = n - 2;
    while (k >= 0 && idx[k] >= idx[k + 1]) k--;
    if (k < 0) break;
    // Find largest l > k with idx[k] < idx[l].
    let l = n - 1;
    while (idx[l] <= idx[k]) l--;
    const t = idx[k]; idx[k] = idx[l]; idx[l] = t;
    // Reverse idx[k+1..].
    let lo = k + 1, hi = n - 1;
    while (lo < hi) { const t2 = idx[lo]; idx[lo] = idx[hi]; idx[hi] = t2; lo++; hi--; }
  }
  return out;
}

/** All combinations of `arr` taken `k` at a time.  Lexicographic on indices. */
export function combinations<T>(arr: T[], k: number): T[][] {
  assertArray(arr, "combinations");
  assertInt(k, "combinations");
  const n = arr.length;
  if (k < 0 || k > n) throw new Error("combinations: k out of range");
  const out: T[][] = [];
  if (k === 0) return [[]];
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map((i) => arr[i]));
    // Find the rightmost index that can be incremented.
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

/** Rotate `arr` by `n` positions: positive left, negative right. */
export function rotate<T>(arr: T[], n: number): T[] {
  assertArray(arr, "rotate");
  assertInt(n, "rotate");
  const len = arr.length;
  if (len === 0) return [];
  const k = ((n % len) + len) % len; // normalize to [0, len)
  return arr.slice(k).concat(arr.slice(0, k));
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "list",
  fns: [
    { name: "zip", sig: "(a: any[], b: any[]) -> any[][]", desc: "Pairwise combine two arrays into 2-tuples, stopping at the shorter." },
    { name: "zip3", sig: "(a, b, c) -> any[][]", desc: "Combine three arrays into 3-tuples, stopping at the shortest." },
    { name: "unzip", sig: "(pairs: any[][]) -> any[][]", desc: "Reverse of zip: array of pairs -> pair of arrays." },
    { name: "interleave", sig: "(a, b) -> any[]", desc: "Interleave two arrays element-by-element, appending the remainder." },
    { name: "cycle", sig: "(arr: any[], n: int) -> any[]", desc: "Cycle through arr to produce an array of length n." },
    { name: "replicate", sig: "(v: any, n: int) -> any[]", desc: "Produce an array containing v repeated n times." },
    { name: "take", sig: "(arr: any[], n: int) -> any[]", desc: "First n elements (or last |n| if negative)." },
    { name: "drop", sig: "(arr: any[], n: int) -> any[]", desc: "Drop first n elements (or last |n| if negative)." },
    { name: "takeWhile", sig: "(arr, fn) -> any[]", desc: "Longest prefix whose elements satisfy fn." },
    { name: "dropWhile", sig: "(arr, fn) -> any[]", desc: "Drop longest prefix satisfying fn, keep the rest." },
    { name: "span", sig: "(arr, fn) -> [any[], any[]]", desc: "Split into (prefix satisfying fn, rest)." },
    { name: "break_", sig: "(arr, fn) -> [any[], any[]]", desc: "Split into (prefix NOT satisfying fn, rest)." },
    { name: "partition", sig: "(arr, fn) -> [any[], any[]]", desc: "Partition into (satisfying, not-satisfying)." },
    { name: "group", sig: "(arr: any[], n: int) -> any[][]", desc: "Split array into chunks of length n." },
    { name: "groupBy", sig: "(arr, fn) -> any[][]", desc: "Group consecutive elements that share the same key." },
    { name: "window", sig: "(arr: any[], n: int) -> any[][]", desc: "Sliding window of size n." },
    { name: "intersperse", sig: "(arr, sep) -> any[]", desc: "Insert sep between every pair of adjacent elements." },
    { name: "scan", sig: "(arr, fn, init) -> any[]", desc: "Like reduce but keeps every intermediate accumulator." },
    { name: "scanr", sig: "(arr, fn, init) -> any[]", desc: "Right-to-left scan." },
    { name: "unfold", sig: "(init, fn, n: int) -> any[]", desc: "Build array of length n by applying fn repeatedly." },
    { name: "rangeBy", sig: "(start: int, step: int, n: int) -> number[]", desc: "Numeric range of n elements with given step." },
    { name: "iterate", sig: "(fn, n: int, seed) -> any[]", desc: "Like unfold but fn receives the iteration index." },
    { name: "permutations", sig: "(arr: any[]) -> any[][]", desc: "All permutations of arr (n! results)." },
    { name: "combinations", sig: "(arr: any[], k: int) -> any[][]", desc: "All combinations of arr taken k at a time." },
    { name: "rotate", sig: "(arr: any[], n: int) -> any[]", desc: "Rotate arr by n positions (positive left, negative right)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("zip", zip);
  registerBuiltin("zip3", zip3);
  registerBuiltin("unzip", unzip);
  registerBuiltin("interleave", interleave);
  registerBuiltin("cycle", cycle);
  registerBuiltin("replicate", replicate);
  registerBuiltin("take", take);
  registerBuiltin("drop", drop);
  registerBuiltin("takeWhile", takeWhile);
  registerBuiltin("dropWhile", dropWhile);
  registerBuiltin("span", span);
  registerBuiltin("break_", break_);
  registerBuiltin("partition", partition);
  registerBuiltin("group", group);
  registerBuiltin("groupBy", groupBy);
  registerBuiltin("window", window);
  registerBuiltin("intersperse", intersperse);
  registerBuiltin("scan", scan);
  registerBuiltin("scanr", scanr);
  registerBuiltin("unfold", unfold);
  registerBuiltin("rangeBy", rangeBy);
  registerBuiltin("iterate", iterate);
  registerBuiltin("permutations", permutations);
  registerBuiltin("combinations", combinations);
  registerBuiltin("rotate", rotate);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertArray(x: any, fn: string): asserts x is any[] {
  if (!Array.isArray(x)) throw new Error(fn + ": expected array, got " + kind(x));
}

function assertInt(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": expected number, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
