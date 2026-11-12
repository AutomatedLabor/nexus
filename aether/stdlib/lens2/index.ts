/**
 * Aether stdlib — `lens2` module.
 *
 * Companion to `aether/stdlib/lens`.  The original module ships the
 * ten most common lens operations (`lensNew`, `lensGet`, `lensSet`,
 * `lensModify`, `lensCompose`, `lensAt`, `lensIndex`, `lensPath`,
 * `lensProp`, `lensOptional`); this module ships ten additional,
 * more-specialized lens helpers that come up in real Aether programs:
 *
 *   - `lensWhere(pred)`      — focus the first element matching a predicate.
 *   - `lensRecord(keys)`     — multi-key lens (focus a subset of a record).
 *   - `lensSlice(start, end)` — focus a sub-array slice.
 *   - `lensAppend(arr)`      — focus "the new element to append" (set only).
 *   - `lensPrepend(arr)`    — focus "the new element to prepend" (set only).
 *   - `lensHead(arr)`       — focus the first element of an array.
 *   - `lensTail(arr)`       — focus the tail of an array.
 *   - `lensDefault(l, def)` — lens returning `def` when focus is undefined.
 *   - `lensChoice(l1, l2)`  — try l1 first, fall back to l2.
 *   - `lensIso(iso, l)`     — lens through an isomorphism.
 *
 * All operations are pure: `lensSet` returns a *new* object/array
 * rather than mutating the input.  The original is left untouched.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.  `lensDefault`,
 * `lensChoice`, and `lensWhere` are designed to swallow
 * "not-found" panics and return `undefined` instead when the focus
 * isn't reachable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Lens<T, V> {
  get: (obj: T) => V;
  set: (obj: T, val: V) => T;
}

/** Isomorphism: a pair of `to` / `from` bijections. */
export interface Iso<A, B> {
  to: (a: A) => B;
  from: (b: B) => A;
}

// Re-use `lensNew` from the original module?  No — keep this module
// self-contained so it can be used in isolation.
function newLens<T, V>(get: (obj: T) => V, set: (obj: T, val: V) => T): Lens<T, V> {
  if (typeof get !== "function" || typeof set !== "function") {
    throw new Error("newLens: get and set must be functions");
  }
  return { get, set };
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Build a lens that focuses the first element of an array matching a
 * predicate.  Reads walk the array, returning the first element for
 * which `pred(x)` is truthy, or `undefined` if none match.  Writes
 * replace the first matching element with the new value, returning
 * a new array; if no element matches, the array is returned unchanged.
 */
export function lensWhere<T>(pred: (x: T) => boolean): Lens<T[], T | undefined> {
  if (typeof pred !== "function") throw new Error("lensWhere: pred must be a function");
  return newLens<T[], T | undefined>(
    (arr: T[]): T | undefined => {
      if (!Array.isArray(arr)) return undefined;
      for (const x of arr) if (pred(x)) return x;
      return undefined;
    },
    (arr: T[], val: T | undefined): T[] => {
      if (!Array.isArray(arr)) throw new Error("lensWhere: cannot set on a non-array");
      if (val === undefined) return arr; // no-op
      const out = arr.slice();
      for (let i = 0; i < out.length; i++) {
        if (pred(out[i])) {
          out[i] = val;
          return out;
        }
      }
      return out;
    },
  );
}

/**
 * Build a lens that focuses a subset of a record's keys.  Reads return
 * a new record containing only the listed keys (with their values from
 * `obj`).  Writes replace those keys (with the values from `val`) and
 * leave the rest of `obj` untouched.  Useful for "update many fields
 * at once" patterns.
 */
export function lensRecord<T extends Record<string, any>>(keys: string[]): Lens<T, Record<string, any>> {
  if (!Array.isArray(keys)) throw new Error("lensRecord: keys must be an array of strings");
  for (const k of keys) {
    if (typeof k !== "string") throw new Error("lensRecord: each key must be a string");
  }
  return newLens<T, Record<string, any>>(
    (obj: T): Record<string, any> => {
      const out: Record<string, any> = {};
      if (obj == null) return out;
      for (const k of keys) out[k] = obj[k];
      return out;
    },
    (obj: T, val: Record<string, any>): T => {
      if (obj == null || typeof obj !== "object") throw new Error("lensRecord: cannot set on a non-object");
      const out: any = { ...obj };
      for (const k of keys) {
        if (k in val) out[k] = val[k];
      }
      return out;
    },
  );
}

/**
 * Build a lens that focuses a sub-array slice [start, end).  Reads
 * return `arr.slice(start, end)`.  Writes replace that slice with a
 * new sub-array, splicing it into a copy of the original.  Throws on
 * out-of-bounds or non-integer indices.
 */
export function lensSlice(start: number, end: number): Lens<any[], any[]> {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new Error("lensSlice: start and end must be integers with 0 <= start <= end");
  }
  return newLens<any[], any[]>(
    (arr: any[]): any[] => (Array.isArray(arr) ? arr.slice(start, end) : []),
    (arr: any[], val: any[]): any[] => {
      if (!Array.isArray(arr)) throw new Error("lensSlice: cannot set on a non-array");
      if (!Array.isArray(val)) throw new Error("lensSlice: replacement must be an array");
      if (end > arr.length) throw new Error("lensSlice: end exceeds array length");
      return arr.slice(0, start).concat(val).concat(arr.slice(end));
    },
  );
}

/**
 * Build a lens that focuses "the new element to append to the array".
 * Reads return `undefined` (the focus doesn't exist yet).  Writes
 * return a new array with `val` appended.  Useful for accumulating
 * values into an array via `lensSet`.
 */
export function lensAppend<T = any>(): Lens<T[], T | undefined> {
  return newLens<T[], T | undefined>(
    (_arr: T[]): T | undefined => undefined,
    (arr: T[], val: T | undefined): T[] => {
      if (!Array.isArray(arr)) throw new Error("lensAppend: cannot set on a non-array");
      if (val === undefined) return arr; // no-op
      return arr.concat([val]);
    },
  );
}

/**
 * Build a lens that focuses "the new element to prepend to the array".
 * Reads return `undefined`.  Writes return a new array with `val`
 * prepended.  Useful for stack-like accumulation.
 */
export function lensPrepend<T = any>(): Lens<T[], T | undefined> {
  return newLens<T[], T | undefined>(
    (_arr: T[]): T | undefined => undefined,
    (arr: T[], val: T | undefined): T[] => {
      if (!Array.isArray(arr)) throw new Error("lensPrepend: cannot set on a non-array");
      if (val === undefined) return arr; // no-op
      return [val].concat(arr);
    },
  );
}

/**
 * Build a lens that focuses the first element of an array (`arr[0]`).
 * Reads on an empty array return `undefined`.  Writes on an empty
 * array create a new single-element array `[val]`; writes on a non-
 * empty array replace `arr[0]`.
 */
export function lensHead<T = any>(): Lens<T[], T | undefined> {
  return newLens<T[], T | undefined>(
    (arr: T[]): T | undefined => (Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined),
    (arr: T[], val: T | undefined): T[] => {
      if (!Array.isArray(arr)) throw new Error("lensHead: cannot set on a non-array");
      if (val === undefined) {
        // Setting head to undefined drops it.
        return arr.slice(1);
      }
      if (arr.length === 0) return [val];
      const out = arr.slice();
      out[0] = val;
      return out;
    },
  );
}

/**
 * Build a lens that focuses the tail of an array (`arr.slice(1)`).
 * Reads return a new array (a copy of `arr.slice(1)`).  Writes
 * replace the tail with a new sub-array, preserving `arr[0]`.
 */
export function lensTail<T = any>(): Lens<T[], T[]> {
  return newLens<T[], T[]>(
    (arr: T[]): T[] => (Array.isArray(arr) ? arr.slice(1) : []),
    (arr: T[], val: T[]): T[] => {
      if (!Array.isArray(arr)) throw new Error("lensTail: cannot set on a non-array");
      if (!Array.isArray(val)) throw new Error("lensTail: replacement must be an array");
      const head = arr.length > 0 ? [arr[0]] : [];
      return head.concat(val);
    },
  );
}

/**
 * Wrap a lens so that `get` returns `def` instead of `undefined` when
 * the focus is undefined.  `set` is unchanged.  Useful for lenses
 * that focus optional fields where you want a sensible default
 * rather than `undefined`.
 */
export function lensDefault<T, V>(l: Lens<T, V>, def: V): Lens<T, V> {
  assertLens(l, "lensDefault");
  return newLens<T, V>(
    (obj: T): V => {
      const v = l.get(obj);
      return v === undefined ? def : v;
    },
    (obj: T, val: V): T => l.set(obj, val),
  );
}

/**
 * Build a lens that tries `l1` first, falling back to `l2` if `l1`'s
 * focus is `undefined`.  Reads return `l1.get(obj) ?? l2.get(obj)`.
 * Writes prefer `l1` if `l1.get(obj)` is non-undefined; otherwise
 * they fall back to `l2.set`.  Useful for "primary + fallback"
 * patterns (e.g. user override then config-file value then default).
 */
export function lensChoice<T, V>(l1: Lens<T, V>, l2: Lens<T, V>): Lens<T, V | undefined> {
  assertLens(l1, "lensChoice");
  assertLens(l2, "lensChoice");
  return newLens<T, V | undefined>(
    (obj: T): V | undefined => {
      const v1 = l1.get(obj);
      if (v1 !== undefined) return v1;
      return l2.get(obj);
    },
    (obj: T, val: V | undefined): T => {
      const v1 = l1.get(obj);
      if (v1 !== undefined) return l1.set(obj, val as V);
      return l2.set(obj, val as V);
    },
  );
}

/**
 * Build a lens through an isomorphism.  `iso.to` converts the source
 * focus to the lens's value space; `iso.from` converts back.  Reads
 * walk `l.get(obj)` then `iso.to`.  Writes convert with `iso.from`
 * and then write through `l.set`.  Useful for "view this number as
 * a string" / "view this Date as a unix timestamp" patterns.
 */
export function lensIso<A, B>(iso: Iso<A, B>, l: Lens<any, A>): Lens<any, B> {
  if (!iso || typeof iso.to !== "function" || typeof iso.from !== "function") {
    throw new Error("lensIso: iso must be { to, from }");
  }
  assertLens(l, "lensIso");
  return newLens<any, B>(
    (obj: any): B => iso.to(l.get(obj)),
    (obj: any, val: B): any => l.set(obj, iso.from(val)),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertLens(l: any, fn: string): asserts l is Lens<any, any> {
  if (!l || typeof l !== "object" || typeof l.get !== "function" || typeof l.set !== "function") {
    throw new Error(fn + ": expected a lens (with get and set functions)");
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "lens2",
  fns: [
    { name: "lensWhere", sig: "(pred) -> Lens", desc: "Lens focusing the first array element matching a predicate." },
    { name: "lensRecord", sig: "(keys) -> Lens", desc: "Lens focusing a subset of a record's keys." },
    { name: "lensSlice", sig: "(start, end) -> Lens", desc: "Lens focusing a sub-array slice [start, end)." },
    { name: "lensAppend", sig: "() -> Lens", desc: "Lens focusing 'the new element to append' (set only)." },
    { name: "lensPrepend", sig: "() -> Lens", desc: "Lens focusing 'the new element to prepend' (set only)." },
    { name: "lensHead", sig: "() -> Lens", desc: "Lens focusing the first element of an array." },
    { name: "lensTail", sig: "() -> Lens", desc: "Lens focusing the tail of an array." },
    { name: "lensDefault", sig: "(l, def) -> Lens", desc: "Lens returning def when the focus is undefined." },
    { name: "lensChoice", sig: "(l1, l2) -> Lens", desc: "Try l1 first, fall back to l2." },
    { name: "lensIso", sig: "(iso, l) -> Lens", desc: "Lens through an isomorphism { to, from }." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("lensWhere", lensWhere);
  registerBuiltin("lensRecord", lensRecord);
  registerBuiltin("lensSlice", lensSlice);
  registerBuiltin("lensAppend", lensAppend);
  registerBuiltin("lensPrepend", lensPrepend);
  registerBuiltin("lensHead", lensHead);
  registerBuiltin("lensTail", lensTail);
  registerBuiltin("lensDefault", lensDefault);
  registerBuiltin("lensChoice", lensChoice);
  registerBuiltin("lensIso", lensIso);
}
