/**
 * Aether stdlib — `monoid2` module.
 *
 * Companion to `aether/stdlib/monoid`.  That module ships the ten
 * "obvious" monoids (Sum, Product, String, Array, And, Or, Max, Min,
 * First, Last); this module ships ten additional, less-obvious-but-
 * still-common monoids that come up in real Aether programs:
 *
 *   - `monoidEndo`           — endomorphisms under composition.
 *   - `monoidDual`            — the dual (combine reversed) of any monoid.
 *   - `monoidCount`           — count items folded (combine ignores `b`).
 *   - `monoidSumAndCount`     — pair (sum, count) for online averaging.
 *   - `monoidSetUnion`        — arrays-as-sets under union (de-duped).
 *   - `monoidIntersect`       — arrays-as-sets under intersection.
 *   - `monoidDict`            — records under shallow merge (right wins).
 *   - `monoidMaybe`           — lift any monoid to Maybe<T> (null = empty).
 *   - `monoidFirstNonEmpty`   — first non-empty string/array (skips "").
 *   - `monoidLastNonEmpty`    — last non-empty string/array.
 *
 * Each factory returns the same `{ empty, combine, combineAll }` shape
 * as the original `monoid` module so the two are interchangeable: any
 * helper that accepts a `Monoid<T>` from `monoid` accepts one from
 * `monoid2`, and vice versa.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Monoid<T> {
  empty: T;
  combine: (a: T, b: T) => T;
  combineAll: (arr: T[]) => T;
}

// Internal helper: build a Monoid from its two primitives.
function make<T>(empty: T, combine: (a: T, b: T) => T): Monoid<T> {
  return {
    empty,
    combine,
    combineAll: (arr: T[]): T => {
      if (!Array.isArray(arr)) throw new Error("combineAll: expected array");
      let acc = empty;
      for (const x of arr) acc = combine(acc, x);
      return acc;
    },
  };
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Endomorphism monoid: functions from `T` to `T`, under composition.
 * `empty` is the identity function `x => x`.  `combine(f, g)` returns
 * `x => f(g(x))` (i.e. g runs first, then f).  `combineAll([f, g, h])`
 * produces a function equivalent to `x => f(g(h(x)))`.
 *
 * Useful for building up a transformation pipeline by folding a list
 * of single-step transformers.
 */
export function monoidEndo<T = any>(): Monoid<(x: T) => T> {
  return make<(x: T) => T>(
    (x: T) => x,
    (f: (x: T) => T, g: (x: T) => T) => (x: T) => f(g(x)),
  );
}

/**
 * The dual of a monoid: same carrier, same identity, but `combine` is
 * reversed.  `monoidDual(m).combine(a, b) === m.combine(b, a)`.  Useful
 * when you want to fold an array "right-to-left" using the same combine
 * operation, or when the order of composition matters in the other
 * direction (e.g. function composition is naturally dual).
 */
export function monoidDual<T>(m: Monoid<T>): Monoid<T> {
  assertMonoid(m, "monoidDual");
  return make<T>(m.empty, (a: T, b: T) => m.combine(b, a));
}

/**
 * Counting monoid.  `empty = 0`, `combine = (a, _b) => a + 1`.  Folds
 * an array to its length.  The `combine` ignores its second argument's
 * value (it only counts the fact that it's there); this is a legitimate
 * monoid because `combine(empty, x) = 1 = x-count`, and the operation is
 * associative.
 *
 * Useful as a "tally" reducer when paired with `monoidSumAndCount` for
 * computing averages.
 */
export function monoidCount(): Monoid<number> {
  return make<number>(0, (a: number, _b: number) => a + 1);
}

/**
 * Pair monoid over `(sum, count)`.  `empty = (0, 0)`; `combine` adds
 * both components.  Folds an array of numbers to a `(sum, count)` pair
 * from which you can compute the mean as `sum / count`.  Combining two
 * already-aggregated pairs is a no-op merge — convenient for divide-
 * and-conquer parallel folds.
 *
 * The combine takes a pair and a number (the carrier is heterogeneous:
 * `T = [number, number] | number`); in practice callers should fold
 * numbers, and the empty `(0, 0)` is returned when folding `[]`.  We
 * accept either shape on `combine`'s right argument for flexibility.
 */
export function monoidSumAndCount(): Monoid<[number, number]> {
  return make<[number, number]>(
    [0, 0],
    (a: [number, number], b: any): [number, number] => {
      if (Array.isArray(b) && b.length === 2 && typeof b[0] === "number" && typeof b[1] === "number") {
        return [a[0] + b[0], a[1] + b[1]];
      }
      if (typeof b === "number") {
        return [a[0] + b, a[1] + 1];
      }
      throw new Error("monoidSumAndCount.combine: second arg must be a number or [number, number] pair");
    },
  );
}

/**
 * Arrays-as-sets under union.  `empty = []`; `combine` returns the
 * de-duplicated concatenation of the two arrays (preserving the order
 * of first appearance).  Useful for accumulating a set of values from
 * many sources.  Elements are compared by `===`.
 */
export function monoidSetUnion<T = any>(): Monoid<T[]> {
  return make<T[]>([] as T[], (a: T[], b: T[]) => {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      throw new Error("monoidSetUnion.combine: both args must be arrays");
    }
    const out: T[] = [];
    const seen = new Set<T>();
    const pushIf = (x: T): void => {
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    };
    for (const x of a) pushIf(x);
    for (const x of b) pushIf(x);
    return out;
  });
}

/**
 * Arrays-as-sets under intersection.  `empty = []` (note: this means
 * `combine(empty, xs)` returns `[]`, NOT `xs` — the empty intersection
 * is the empty set, which is the same as the empty array; the
 * identity law still holds because `combine([], [])` is `[]` and
 * intersecting any array with the empty set is the empty set, so the
 * intersection monoid's empty is indeed `[]`).
 *
 * `combine(a, b)` returns the array of elements that appear in BOTH
 * `a` and `b`, in `a`'s order, de-duplicated.  Useful for "find the
 * common subset" folds (e.g. tags shared by all items in a list).
 *
 * `combineAll` is overridden to seed with the first element of the
 * array (instead of `empty`), so `combineAll([s1, s2, s3])` produces
 * `intersect(intersect(s1, s2), s3)` — the "intersection of all" —
 * rather than `intersect(intersect(intersect([], s1), s2), s3) = []`.
 * For an empty array, `combineAll([])` returns `empty` (=`[]`).
 */
export function monoidIntersect<T = any>(): Monoid<T[]> {
  const combineFn = (a: T[], b: T[]): T[] => {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      throw new Error("monoidIntersect.combine: both args must be arrays");
    }
    const bs = new Set<T>(b);
    const out: T[] = [];
    const seen = new Set<T>();
    for (const x of a) {
      if (bs.has(x) && !seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  };
  const m: Monoid<T[]> = {
    empty: [] as T[],
    combine: combineFn,
    combineAll: (arr: T[]): T[] => {
      if (!Array.isArray(arr)) throw new Error("combineAll: expected array");
      if (arr.length === 0) return [] as T[];
      let acc = arr[0];
      for (let i = 1; i < arr.length; i++) acc = combineFn(acc, arr[i]);
      return acc;
    },
  };
  return m;
}

/**
 * Records under shallow merge.  `empty = {}`; `combine` returns
 * `{ ...a, ...b }` (right-biased: keys in `b` overwrite keys in `a`).
 * Nested objects are NOT deep-merged — only the top level is merged.
 * Useful for accumulating configuration from many sources where later
 * values should win.
 *
 * Throws if either argument is not a plain object (a non-array,
 * non-null object).
 */
export function monoidDict<T = any>(): Monoid<Record<string, T>> {
  return make<Record<string, T>>({} as Record<string, T>, (a: Record<string, T>, b: Record<string, T>) => {
    if (a === null || a === undefined || typeof a !== "object" || Array.isArray(a)) {
      throw new Error("monoidDict.combine: first arg must be a plain object");
    }
    if (b === null || b === undefined || typeof b !== "object" || Array.isArray(b)) {
      throw new Error("monoidDict.combine: second arg must be a plain object");
    }
    return { ...a, ...b };
  });
}

/**
 * Lift any monoid to `Maybe<T>` (i.e. `T | null`).  `empty = null`.
 * `combine(null, x)` returns `x`; `combine(x, null)` returns `x`;
 * `combine(x, y)` returns `m.combine(x, y)`.  Useful when folding a
 * list that may contain nulls, and you want to skip the nulls and
 * combine the non-null values using `m`'s combine.
 */
export function monoidMaybe<T>(m: Monoid<T>): Monoid<T | null> {
  assertMonoid(m, "monoidMaybe");
  return make<T | null>(
    null,
    (a: T | null, b: T | null): T | null => {
      if (a === null || a === undefined) return b;
      if (b === null || b === undefined) return a;
      return m.combine(a, b);
    },
  );
}

/**
 * First-non-empty monoid for strings (or arrays).  `empty = ""` (or
 * `[]`).  `combine(a, b)` returns `a` if `a` is non-empty (length > 0);
 * otherwise `b`.  Useful for "find the first defined / non-default
 * value in a list of candidates" folds where the default is the empty
 * string (or empty array) rather than null.
 *
 * Strings and arrays are accepted interchangeably: the carrier type
 * is `string | any[]` and `combine` checks `length` on whichever it
 * receives.
 */
export function monoidFirstNonEmpty<T = string | any[]>(): Monoid<T> {
  return make<T>("" as unknown as T, (a: any, b: any): any => {
    const aLen = a === null || a === undefined ? 0 : (typeof a === "string" || Array.isArray(a) ? a.length : 0);
    if (aLen > 0) return a;
    return b;
  });
}

/**
 * Last-non-empty monoid for strings (or arrays).  Symmetric to
 * `monoidFirstNonEmpty`: `combine(a, b)` returns `b` if `b` is non-empty,
 * otherwise `a`.  Useful for "find the last non-default value" folds.
 */
export function monoidLastNonEmpty<T = string | any[]>(): Monoid<T> {
  return make<T>("" as unknown as T, (a: any, b: any): any => {
    const bLen = b === null || b === undefined ? 0 : (typeof b === "string" || Array.isArray(b) ? b.length : 0);
    if (bLen > 0) return b;
    return a;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertMonoid(m: any, fn: string): asserts m is Monoid<any> {
  if (!m || typeof m !== "object" || typeof m.combine !== "function" || !("empty" in m)) {
    throw new Error(fn + ": expected a Monoid (with empty and combine)");
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "monoid2",
  fns: [
    { name: "monoidEndo", sig: "() -> Monoid<(x) -> x>", desc: "Endomorphisms under composition (empty=identity)." },
    { name: "monoidDual", sig: "(m) -> Monoid", desc: "The dual (combine reversed) of any monoid." },
    { name: "monoidCount", sig: "() -> Monoid<int>", desc: "Counting monoid (folds to array length)." },
    { name: "monoidSumAndCount", sig: "() -> Monoid<[int,int]>", desc: "Pair (sum, count) monoid for online averaging." },
    { name: "monoidSetUnion", sig: "() -> Monoid<any[]>", desc: "Arrays-as-sets under union (de-duped)." },
    { name: "monoidIntersect", sig: "() -> Monoid<any[]>", desc: "Arrays-as-sets under intersection (de-duped)." },
    { name: "monoidDict", sig: "() -> Monoid<Record>", desc: "Records under shallow merge (right-biased)." },
    { name: "monoidMaybe", sig: "(m) -> Monoid<any>", desc: "Lift any monoid to Maybe (null = empty)." },
    { name: "monoidFirstNonEmpty", sig: "() -> Monoid<string|[]>", desc: "First non-empty string/array (empty=\"\")." },
    { name: "monoidLastNonEmpty", sig: "() -> Monoid<string|[]>", desc: "Last non-empty string/array." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("monoidEndo", monoidEndo);
  registerBuiltin("monoidDual", monoidDual);
  registerBuiltin("monoidCount", monoidCount);
  registerBuiltin("monoidSumAndCount", monoidSumAndCount);
  registerBuiltin("monoidSetUnion", monoidSetUnion);
  registerBuiltin("monoidIntersect", monoidIntersect);
  registerBuiltin("monoidDict", monoidDict);
  registerBuiltin("monoidMaybe", monoidMaybe);
  registerBuiltin("monoidFirstNonEmpty", monoidFirstNonEmpty);
  registerBuiltin("monoidLastNonEmpty", monoidLastNonEmpty);
}
