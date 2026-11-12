/**
 * Aether stdlib — `zip` module.
 *
 * A complete toolkit for zipping arrays together: 2- and 3-array
 * zips, zips with a combining function, zip-longest (padding short
 * inputs), unzip, zip-to-dict, strict (equal-length-only) zips, and
 * zip-with-index.
 *
 * Naming note: `zip` here intentionally shadows the older bare-name
 * version registered from the `collections` module; the `zip`-module
 * version is a strict superset (same 2-array behaviour, richer error
 * messages), so existing user code keeps working.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// Sentinel used to mark missing arguments in `zipLongest`.  We use a
// unique object so user code can't accidentally collide with it.
const MISSING: unique symbol = Symbol("zip.missing");

// ---------------------------------------------------------------------------
// Basic zips
// ---------------------------------------------------------------------------

/**
 * Zip two arrays into an array of 2-tuples.  Truncates to the shorter
 * input — no padding.  `zip([1,2,3], ["a","b"])` → `[[1,"a"],[2,"b"]]`.
 */
export function zip(a: any[], b: any[]): any[] {
  if (!Array.isArray(a) || !Array.isArray(b)) throw new Error("zip: expected arrays");
  const n = Math.min(a.length, b.length);
  const out: any[] = [];
  for (let i = 0; i < n; i++) out.push([a[i], b[i]]);
  return out;
}

/**
 * Zip three arrays into an array of 3-tuples.  Truncates to the
 * shortest input.
 */
export function zip3(a: any[], b: any[], c: any[]): any[] {
  if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(c)) {
    throw new Error("zip3: expected arrays");
  }
  const n = Math.min(a.length, b.length, c.length);
  const out: any[] = [];
  for (let i = 0; i < n; i++) out.push([a[i], b[i], c[i]]);
  return out;
}

/**
 * Zip two arrays and combine each pair through `fn(a_i, b_i)`.
 * Truncates to the shorter input.  Returns the array of `fn` results.
 * Example: `zipWith([1,2,3], [10,20,30], (a,b) => a + b)` → `[11, 22, 33]`.
 */
export function zipWith(a: any[], b: any[], fn: (a: any, b: any, i: number) => any): any[] {
  if (!Array.isArray(a) || !Array.isArray(b)) throw new Error("zipWith: expected arrays");
  if (typeof fn !== "function") throw new Error("zipWith: fn must be a function");
  const n = Math.min(a.length, b.length);
  const out: any[] = [];
  for (let i = 0; i < n; i++) out.push(fn(a[i], b[i], i));
  return out;
}

// ---------------------------------------------------------------------------
// Unzip
// ---------------------------------------------------------------------------

/**
 * Unzip an array of 2-tuples into a 2-tuple of arrays.
 * `unzip([[1,"a"],[2,"b"]])` → `[[1, 2], ["a", "b"]]`.
 */
export function unzip(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("unzip: expected array");
  const as: any[] = [];
  const bs: any[] = [];
  for (const t of arr) {
    if (!Array.isArray(t) || t.length < 2) {
      throw new Error("unzip: each element must be a 2-tuple");
    }
    as.push(t[0]);
    bs.push(t[1]);
  }
  return [as, bs];
}

/**
 * Unzip an array of 3-tuples into a 3-tuple of arrays.
 */
export function unzip3(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("unzip3: expected array");
  const as: any[] = [];
  const bs: any[] = [];
  const cs: any[] = [];
  for (const t of arr) {
    if (!Array.isArray(t) || t.length < 3) {
      throw new Error("unzip3: each element must be a 3-tuple");
    }
    as.push(t[0]);
    bs.push(t[1]);
    cs.push(t[2]);
  }
  return [as, bs, cs];
}

// ---------------------------------------------------------------------------
// Padding zips
// ---------------------------------------------------------------------------

/**
 * Zip two arrays, padding the shorter input with `fill` so both
 * outputs have the length of the longer input.
 * `zipLongest([1,2,3], ["a","b"], 0)` → `[[1,"a"],[2,"b"],[3,0]]`.
 * If `fill` is omitted, the shorter side's missing slots are `null`.
 */
export function zipLongest(a: any[], b: any[], fill?: any): any[] {
  if (!Array.isArray(a) || !Array.isArray(b)) throw new Error("zipLongest: expected arrays");
  const filler = fill === undefined ? null : fill;
  const n = Math.max(a.length, b.length);
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const x = i < a.length ? a[i] : filler;
    const y = i < b.length ? b[i] : filler;
    out.push([x, y]);
  }
  return out;
}

/**
 * Zip any number of arrays, padding short inputs with `fill` (or
 * `null` if `fill` is omitted).  Returns an array of n-tuples, where
 * n is the number of inputs.
 * `zipAll([1,2,3], [10,20], [100])` with fill `0`
 *   → `[[1,10,100], [2,0,0], [3,0,0]]`.
 */
export function zipAll(fill: any, ...arrs: any[][]): any[] {
  // Accept the call form `zipAll(fill, a, b, c)` and also `zipAll(a, b, c)`
  // where the first argument is an array (fill defaults to null).  We
  // detect the second form by checking whether every argument is an
  // array — if so, treat the first as a real array and use null as fill.
  let realFill: any = fill;
  let arrays: any[][];
  if (Array.isArray(fill)) {
    arrays = [fill, ...arrs];
    realFill = null;
  } else {
    arrays = arrs;
  }
  for (const a of arrays) {
    if (!Array.isArray(a)) throw new Error("zipAll: all inputs must be arrays");
  }
  if (arrays.length === 0) return [];
  let maxLen = 0;
  for (const a of arrays) if (a.length > maxLen) maxLen = a.length;
  const out: any[] = [];
  for (let i = 0; i < maxLen; i++) {
    const tuple: any[] = [];
    for (const a of arrays) {
      tuple.push(i < a.length ? a[i] : realFill);
    }
    out.push(tuple);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dict and strict variants
// ---------------------------------------------------------------------------

/**
 * Zip two arrays into a record (dictionary) mapping the first array's
 * elements (as string keys) to the second array's elements.  Later
 * duplicate keys overwrite earlier ones.  Truncates to the shorter
 * input.
 * `zipToDict(["a","b"], [1,2])` → `{ "a": 1, "b": 2 }`.
 */
export function zipToDict(keys: any[], values: any[]): Record<string, any> {
  if (!Array.isArray(keys) || !Array.isArray(values)) throw new Error("zipToDict: expected arrays");
  const n = Math.min(keys.length, values.length);
  const out: Record<string, any> = {};
  for (let i = 0; i < n; i++) {
    const k = keys[i];
    const ks = typeof k === "string" ? k : String(k);
    out[ks] = values[i];
  }
  return out;
}

/**
 * Strict zip: like `zip` but panics if the inputs aren't the same
 * length.  Useful when mismatched lengths are a programmer error.
 */
export function zipStrict(a: any[], b: any[]): any[] {
  if (!Array.isArray(a) || !Array.isArray(b)) throw new Error("zipStrict: expected arrays");
  if (a.length !== b.length) {
    throw new Error(`zipStrict: length mismatch (${a.length} vs ${b.length})`);
  }
  const out: any[] = [];
  for (let i = 0; i < a.length; i++) out.push([a[i], b[i]]);
  return out;
}

// ---------------------------------------------------------------------------
// Indexed zip
// ---------------------------------------------------------------------------

/**
 * Pair each element of `arr` with its index.  Returns an array of
 * `[index, value]` tuples.  Useful when you need both the position and
 * the value in a `map`/`filter` pipeline.
 * `zipWithIndex(["a","b","c"])` → `[[0,"a"],[1,"b"],[2,"c"]]`.
 */
export function zipWithIndex(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("zipWithIndex: expected array");
  const out: any[] = [];
  for (let i = 0; i < arr.length; i++) out.push([i, arr[i]]);
  return out;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "zip",
  fns: [
    { name: "zip", sig: "(a: any[], b: any[]) -> any[]", desc: "Zip two arrays into 2-tuples; truncate to shorter." },
    { name: "zip3", sig: "(a: any[], b: any[], c: any[]) -> any[]", desc: "Zip three arrays into 3-tuples; truncate to shortest." },
    { name: "zipWith", sig: "(a, b, fn) -> any[]", desc: "Zip two arrays and combine each pair through fn(a, b, i)." },
    { name: "unzip", sig: "(arr: any[]) -> any[]", desc: "Unzip 2-tuples into [a[], b[]]." },
    { name: "unzip3", sig: "(arr: any[]) -> any[]", desc: "Unzip 3-tuples into [a[], b[], c[]]." },
    { name: "zipLongest", sig: "(a, b, fill?) -> any[]", desc: "Zip two arrays, padding shorter with fill (default null)." },
    { name: "zipAll", sig: "(fill?, ...arrs) -> any[]", desc: "Zip any number of arrays; pad short inputs with fill (default null)." },
    { name: "zipToDict", sig: "(keys, values) -> record", desc: "Zip into a record mapping keys → values (keys stringified)." },
    { name: "zipStrict", sig: "(a, b) -> any[]", desc: "Zip; panic on length mismatch." },
    { name: "zipWithIndex", sig: "(arr: any[]) -> any[]", desc: "Pair each element with its index: [[i, v], ...]." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("zip", zip);
  registerBuiltin("zip3", zip3);
  registerBuiltin("zipWith", zipWith);
  registerBuiltin("unzip", unzip);
  registerBuiltin("unzip3", unzip3);
  registerBuiltin("zipLongest", zipLongest);
  registerBuiltin("zipAll", zipAll);
  registerBuiltin("zipToDict", zipToDict);
  registerBuiltin("zipStrict", zipStrict);
  registerBuiltin("zipWithIndex", zipWithIndex);
}

// Re-export the sentinel for tests that need to detect "missing" values.
export { MISSING };
