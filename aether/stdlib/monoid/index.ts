/**
 * Aether stdlib — `monoid` module.
 *
 * A monoid is an algebraic structure with three things:
 *
 *   - a carrier type `T` (the set of values the monoid lives on);
 *   - an identity element `empty : T` (combining it with anything
 *     leaves that thing unchanged);
 *   - an associative binary operation `combine : (T, T) -> T`.
 *
 * In TypeScript we represent a monoid as a plain struct
 * `{ empty: T; combine: (a: T, b: T) => T }`. The ten factories below
 * each return such a struct for a common carrier type:
 *
 *   - numbers under addition        (`monoidSum`)
 *   - numbers under multiplication    (`monoidProduct`)
 *   - strings under concatenation     (`monoidString`)
 *   - arrays under concatenation      (`monoidArray`)
 *   - booleans under AND              (`monoidAnd`)
 *   - booleans under OR               (`monoidOr`)
 *   - numbers under `max`             (`monoidMax`)
 *   - numbers under `min`             (`monoidMin`)
 *   - first-wins                      (`monoidFirst`)
 *   - last-wins                       (`monoidLast`)
 *
 * The `monoidFirst` and `monoidLast` monoids use a sentinel `null` as
 * the empty element. `monoidFirst.combine(null, x)` returns `x`;
 * `monoidFirst.combine(x, null)` also returns `x`; combining two
 * non-null values keeps the first. `monoidLast` is symmetric but
 * keeps the second. This lets you fold over an array of "optional"
 * values to find the first or last non-null entry.
 *
 * Each monoid also exposes a `combineAll(arr)` convenience that
 * folds a whole array in one call, using `empty` as the seed. This is
 * the standard `reduce` operation specialized to the monoid's
 * combine; we expose it on the returned struct so it's discoverable
 * via `monoidSum().combineAll([1, 2, 3])`.
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
// Factories — each returns a fresh Monoid struct.
// ---------------------------------------------------------------------------

/** Numbers under addition. `empty = 0`, `combine = (a, b) => a + b`. */
export function monoidSum(): Monoid<number> {
  return make(0, (a, b) => a + b);
}

/** Numbers under multiplication. `empty = 1`, `combine = (a, b) => a * b`. */
export function monoidProduct(): Monoid<number> {
  return make(1, (a, b) => a * b);
}

/** Strings under concatenation. `empty = ""`, `combine = (a, b) => a + b`. */
export function monoidString(): Monoid<string> {
  return make("", (a, b) => a + b);
}

/** Arrays under concatenation. `empty = []`, `combine = (a, b) => a.concat(b)`. */
export function monoidArray<T = any>(): Monoid<T[]> {
  return make<T[]>([] as T[], (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.concat(b) : ([] as T[])));
}

/** Booleans under AND. `empty = true`, `combine = (a, b) => a && b`. */
export function monoidAnd(): Monoid<boolean> {
  return make(true, (a, b) => a && b);
}

/** Booleans under OR. `empty = false`, `combine = (a, b) => a || b`. */
export function monoidOr(): Monoid<boolean> {
  return make(false, (a, b) => a || b);
}

/** Numbers under `Math.max`. `empty = -Infinity`, `combine = (a, b) => Math.max(a, b)`. */
export function monoidMax(): Monoid<number> {
  return make(-Infinity, (a, b) => Math.max(a, b));
}

/** Numbers under `Math.min`. `empty = +Infinity`, `combine = (a, b) => Math.min(a, b)`. */
export function monoidMin(): Monoid<number> {
  return make(Infinity, (a, b) => Math.min(a, b));
}

/**
 * First-wins monoid. `empty = null`; the combine keeps the first
 * non-null argument. Useful for "find the first defined value" folds.
 */
export function monoidFirst<T = any>(): Monoid<T | null> {
  return make<T | null>(null, (a, b) => (a === null || a === undefined ? b : a));
}

/**
 * Last-wins monoid. `empty = null`; the combine keeps the second
 * argument unless it's null, in which case it keeps the first.
 * Useful for "find the last defined value" folds.
 */
export function monoidLast<T = any>(): Monoid<T | null> {
  return make<T | null>(null, (a, b) => (b === null || b === undefined ? a : b));
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "monoid",
  fns: [
    { name: "monoidSum", sig: "() -> Monoid<int>", desc: "Numbers under addition (empty=0, combine=+)." },
    { name: "monoidProduct", sig: "() -> Monoid<int>", desc: "Numbers under multiplication (empty=1, combine=*)." },
    { name: "monoidString", sig: "() -> Monoid<string>", desc: "Strings under concatenation (empty=\"\", combine=+)." },
    { name: "monoidArray", sig: "() -> Monoid<any[]>", desc: "Arrays under concatenation (empty=[], combine=concat)." },
    { name: "monoidAnd", sig: "() -> Monoid<bool>", desc: "Booleans under AND (empty=true)." },
    { name: "monoidOr", sig: "() -> Monoid<bool>", desc: "Booleans under OR (empty=false)." },
    { name: "monoidMax", sig: "() -> Monoid<int>", desc: "Numbers under max (empty=-inf)." },
    { name: "monoidMin", sig: "() -> Monoid<int>", desc: "Numbers under min (empty=+inf)." },
    { name: "monoidFirst", sig: "() -> Monoid<any>", desc: "First-wins (empty=null; keeps first non-null)." },
    { name: "monoidLast", sig: "() -> Monoid<any>", desc: "Last-wins (empty=null; keeps last non-null)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("monoidSum", monoidSum);
  registerBuiltin("monoidProduct", monoidProduct);
  registerBuiltin("monoidString", monoidString);
  registerBuiltin("monoidArray", monoidArray);
  registerBuiltin("monoidAnd", monoidAnd);
  registerBuiltin("monoidOr", monoidOr);
  registerBuiltin("monoidMax", monoidMax);
  registerBuiltin("monoidMin", monoidMin);
  registerBuiltin("monoidFirst", monoidFirst);
  registerBuiltin("monoidLast", monoidLast);
}
