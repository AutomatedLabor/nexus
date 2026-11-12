/**
 * Aether stdlib — `lens` module.
 *
 * Functional lenses: composable pairs of a getter and a setter that
 * focus on a part of a data structure.  The ten functions in this
 * module cover the everyday needs of immutable updates:
 *
 *   - `lensNew(get, set)`         — build a lens from a getter and setter.
 *   - `lensGet(l, obj)`           — read the focus.
 *   - `lensSet(l, obj, v)`        — write a new value at the focus.
 *   - `lensModify(l, obj, fn)`    — apply `fn` to the focus.
 *   - `lensCompose(a, b)`         — compose two lenses (focus-of-focus).
 *   - `lensAt(key)`               — focus the value at `key` in a record.
 *   - `lensIndex(i)`              — focus the element at index `i` in an array.
 *   - `lensPath(path)`            — focus a nested path like `["a", "b", 2]`.
 *   - `lensProp(name)`            — alias of `lensAt(name)` for the common case.
 *   - `lensOptional(l)`           — wrap a lens so it returns `undefined`
 *                                    instead of throwing when the focus
 *                                    isn't reachable (missing key, out-of-
 *                                    bounds index, null parent).
 *
 * All operations are pure: `lensSet` returns a *new* object/array
 * rather than mutating the input.  The original is left untouched.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.  `lensOptional` swallows
 * the "not found" panics and returns `undefined` instead.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Lens<T, V> {
  get: (obj: T) => V;
  set: (obj: T, val: V) => T;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Build a lens from a getter and a setter.
 *
 * The getter takes the whole object and returns the focus.
 * The setter takes the whole object and a new value, and returns a
 * *new* object with the focus updated.  Setters must be pure: they
 * must not mutate the input.
 *
 * Example:
 *
 *   let l = lensNew(
 *     (o) => o.name,
 *     (o, v) => ({ ...o, name: v }),
 *   );
 */
export function lensNew<T, V>(get: (obj: T) => V, set: (obj: T, val: V) => T): Lens<T, V> {
  if (typeof get !== "function" || typeof set !== "function") {
    throw new Error("lensNew: get and set must be functions");
  }
  return { get, set };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Read the focus of a lens. */
export function lensGet<T, V>(l: Lens<T, V>, obj: T): V {
  assertLens(l, "lensGet");
  return l.get(obj);
}

/**
 * Write a new value at the focus, returning a new object.
 * The original `obj` is not mutated.
 */
export function lensSet<T, V>(l: Lens<T, V>, obj: T, val: V): T {
  assertLens(l, "lensSet");
  return l.set(obj, val);
}

/**
 * Apply `fn` to the focus, returning a new object with the updated
 * focus.  Equivalent to `lensSet(l, obj, fn(lensGet(l, obj)))` but
 * slightly more convenient.
 */
export function lensModify<T, V>(l: Lens<T, V>, obj: T, fn: (v: V) => V): T {
  assertLens(l, "lensModify");
  if (typeof fn !== "function") throw new Error("lensModify: fn must be a function");
  return l.set(obj, fn(l.get(obj)));
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Compose two lenses.  Reading walks `a.get(b.get(obj))`; writing
 * writes through `b`, then through `a`.  The composition focuses on
 * "the part of `a`'s focus that `b` further focuses on".
 */
export function lensCompose<T, U, V>(a: Lens<T, U>, b: Lens<U, V>): Lens<T, V> {
  assertLens(a, "lensCompose");
  assertLens(b, "lensCompose");
  return lensNew(
    (obj: T) => b.get(a.get(obj)),
    (obj: T, val: V) => a.set(obj, b.set(a.get(obj), val)),
  );
}

// ---------------------------------------------------------------------------
// Common lenses
// ---------------------------------------------------------------------------

/**
 * Build a lens that focuses the value at `key` in a record.
 * Missing keys default to `undefined` on get.  Set always creates
 * (or overwrites) the key.  The set operation returns a *new* object
 * (a shallow clone with the key replaced) — the input is untouched.
 */
export function lensAt(key: string): Lens<any, any> {
  if (typeof key !== "string") throw new Error("lensAt: key must be a string");
  return lensNew(
    (obj: any) => (obj == null ? undefined : obj[key]),
    (obj: any, val: any) => {
      if (obj == null || typeof obj !== "object") {
        throw new Error("lensAt: cannot set on a non-object");
      }
      return { ...obj, [key]: val };
    },
  );
}

/**
 * Build a lens that focuses the element at index `i` in an array.
 * Out-of-bounds gets return `undefined`.  Sets within bounds return
 * a new array with that slot replaced; sets beyond the end throw
 * (use `push` instead for appends).
 */
export function lensIndex(i: number): Lens<any[], any> {
  if (typeof i !== "number" || !Number.isFinite(i) || i < 0 || Math.floor(i) !== i) {
    throw new Error("lensIndex: index must be a non-negative integer");
  }
  return lensNew(
    (arr: any[]) => (Array.isArray(arr) && i < arr.length ? arr[i] : undefined),
    (arr: any[], val: any) => {
      if (!Array.isArray(arr)) throw new Error("lensIndex: cannot index a non-array");
      if (i >= arr.length) throw new Error("lensIndex: index out of bounds on set");
      const out = arr.slice();
      out[i] = val;
      return out;
    },
  );
}

/**
 * Build a lens that focuses a nested path.  `path` is an array of
 * keys (strings) and indices (numbers).  Reads walk the path one
 * step at a time, returning `undefined` if any intermediate is
 * missing.  Writes clone each level of the path, preserving the
 * rest of the structure.  Writes throw if an intermediate focus
 * isn't an object/array.
 */
export function lensPath(path: (string | number)[]): Lens<any, any> {
  if (!Array.isArray(path)) throw new Error("lensPath: path must be an array");
  // Validate each step.
  for (const p of path) {
    if (typeof p !== "string" && typeof p !== "number") {
      throw new Error("lensPath: each step must be a string or number");
    }
    if (typeof p === "number" && (!Number.isFinite(p) || p < 0 || Math.floor(p) !== p)) {
      throw new Error("lensPath: numeric steps must be non-negative integers");
    }
  }
  return lensNew(
    (obj: any) => {
      let cur: any = obj;
      for (const p of path) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      return cur;
    },
    (obj: any, val: any) => {
      if (obj == null || typeof obj !== "object") {
        throw new Error("lensPath: cannot set on a non-object");
      }
      // Recursively clone each level along the path.
      function rec(src: any, depth: number): any {
        if (depth >= path.length) return val;
        const p = path[depth];
        if (Array.isArray(src)) {
          if (typeof p !== "number") {
            throw new Error("lensPath: cannot index array with string");
          }
          if (p >= src.length) {
            throw new Error("lensPath: index out of bounds on set");
          }
          const out = src.slice();
          out[p] = rec(src[p], depth + 1);
          return out;
        } else if (typeof src === "object") {
          if (typeof p !== "string") {
            throw new Error("lensPath: cannot index object with number");
          }
          return { ...src, [p]: rec(src[p], depth + 1) };
        }
        throw new Error("lensPath: intermediate focus is not an object or array");
      }
      return rec(obj, 0);
    },
  );
}

/**
 * Build a lens that focuses the property `name` of a record.  This
 * is a thin alias of `lensAt(name)`, provided so that the
 * `lensProp("name")` spelling (which mirrors Ramda's API) is
 * available alongside the more verbosely named `lensAt`.
 */
export function lensProp(name: string): Lens<any, any> {
  return lensAt(name);
}

/**
 * Wrap a lens so that `get` returns `undefined` instead of throwing
 * when the focus isn't reachable (missing key, out-of-bounds index,
 * null parent).  `set` continues to throw — silently inserting a
 * value at a path that doesn't exist is rarely what the caller
 * intended.
 */
export function lensOptional<T, V>(l: Lens<T, V>): Lens<T, V | undefined> {
  assertLens(l, "lensOptional");
  return lensNew<T, V | undefined>(
    (obj: T) => {
      try {
        return l.get(obj);
      } catch {
        return undefined;
      }
    },
    (obj: T, val: V | undefined) => {
      // If the caller is setting `undefined` at an unreachable focus,
      // treat as no-op.  Otherwise, propagate the underlying setter's
      // behaviour (which may throw).
      if (val === undefined) {
        try {
          l.get(obj);
          // The focus exists; defer to the underlying set.
          return l.set(obj, val as V);
        } catch {
          // Focus didn't exist; no-op.
          return obj;
        }
      }
      return l.set(obj, val as V);
    },
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
  module: "lens",
  fns: [
    { name: "lensNew", sig: "(get, set) -> Lens", desc: "Build a lens from a getter and setter." },
    { name: "lensGet", sig: "(l, obj) -> any", desc: "Read the focus of a lens." },
    { name: "lensSet", sig: "(l, obj, v) -> obj", desc: "Write a new value at the focus (returns a new object)." },
    { name: "lensModify", sig: "(l, obj, fn) -> obj", desc: "Apply fn to the focus, returning a new object." },
    { name: "lensCompose", sig: "(a, b) -> Lens", desc: "Compose two lenses (focus-of-focus)." },
    { name: "lensAt", sig: "(key) -> Lens", desc: "Lens focusing the value at `key` in a record." },
    { name: "lensIndex", sig: "(i) -> Lens", desc: "Lens focusing the element at index `i` in an array." },
    { name: "lensPath", sig: "(path) -> Lens", desc: "Lens focusing a nested path of keys/indices." },
    { name: "lensProp", sig: "(name) -> Lens", desc: "Alias of lensAt(name)." },
    { name: "lensOptional", sig: "(l) -> Lens", desc: "Wrap a lens to return undefined on unreachable focus." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("lensNew", lensNew);
  registerBuiltin("lensGet", lensGet);
  registerBuiltin("lensSet", lensSet);
  registerBuiltin("lensModify", lensModify);
  registerBuiltin("lensCompose", lensCompose);
  registerBuiltin("lensAt", lensAt);
  registerBuiltin("lensIndex", lensIndex);
  registerBuiltin("lensPath", lensPath);
  registerBuiltin("lensProp", lensProp);
  registerBuiltin("lensOptional", lensOptional);
}
