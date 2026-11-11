/**
 * Aether stdlib — `set` module.
 *
 * Set operations built on the native JS `Set`.  Every function is a pure
 * TypeScript implementation; the values stored in a set may be of any type
 * (numbers, strings, booleans, arrays, objects).  Equality is JS `Set`
 * equality (SameValueZero), so `NaN === NaN` and `0 !== -0` are both handled
 * the JS way.
 *
 * Each function throws a plain `Error` on invalid input; the evaluator turns
 * thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Construction & basic ops
// ---------------------------------------------------------------------------

/** Create a new empty set, optionally seeded with the values of `arr`. */
export function setNew<T>(arr?: T[]): Set<T> {
  if (arr !== undefined && arr !== null) {
    assertArray(arr, "setNew");
    return new Set(arr);
  }
  return new Set<T>();
}

/** Add `v` to `s` (in place) and return `s` so callers can chain. */
export function setAdd<T>(s: Set<T>, v: T): Set<T> {
  assertSet(s, "setAdd");
  s.add(v);
  return s;
}

/** Remove `v` from `s`.  Returns true if `v` was present, false otherwise. */
export function setRemove<T>(s: Set<T>, v: T): boolean {
  assertSet(s, "setRemove");
  return s.delete(v);
}

/** True when `s` contains `v`. */
export function setHas<T>(s: Set<T>, v: T): boolean {
  assertSet(s, "setHas");
  return s.has(v);
}

/** Cardinality of `s`. */
export function setSize<T>(s: Set<T>): number {
  assertSet(s, "setSize");
  return s.size;
}

/** Materialize the set as a plain array (insertion order). */
export function setToArray<T>(s: Set<T>): T[] {
  assertSet(s, "setToArray");
  return Array.from(s);
}

// ---------------------------------------------------------------------------
// Set algebra
// ---------------------------------------------------------------------------

/** Union: elements in `a` OR `b`. */
export function setUnion<T>(a: Set<T>, b: Set<T>): Set<T> {
  assertSet(a, "setUnion");
  assertSet(b, "setUnion");
  const out = new Set<T>(a);
  for (const x of b) out.add(x);
  return out;
}

/** Intersection: elements in both `a` AND `b`. */
export function setIntersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  assertSet(a, "setIntersect");
  assertSet(b, "setIntersect");
  // Iterate over the smaller set for performance.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<T>();
  for (const x of small) if (large.has(x)) out.add(x);
  return out;
}

/** Difference: elements in `a` but NOT in `b`. */
export function setDifference<T>(a: Set<T>, b: Set<T>): Set<T> {
  assertSet(a, "setDifference");
  assertSet(b, "setDifference");
  const out = new Set<T>();
  for (const x of a) if (!b.has(x)) out.add(x);
  return out;
}

/** Symmetric difference: elements in `a` XOR `b` (exactly one of the two). */
export function setSymDiff<T>(a: Set<T>, b: Set<T>): Set<T> {
  assertSet(a, "setSymDiff");
  assertSet(b, "setSymDiff");
  const out = new Set<T>();
  for (const x of a) if (!b.has(x)) out.add(x);
  for (const x of b) if (!a.has(x)) out.add(x);
  return out;
}

/** True when every element of `a` is also in `b`. */
export function setSubset<T>(a: Set<T>, b: Set<T>): boolean {
  assertSet(a, "setSubset");
  assertSet(b, "setSubset");
  if (a.size > b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** True when every element of `b` is also in `a` (i.e. b ⊆ a). */
export function setSuperset<T>(a: Set<T>, b: Set<T>): boolean {
  return setSubset(b, a);
}

/** True when `a` and `b` share no elements. */
export function setDisjoint<T>(a: Set<T>, b: Set<T>): boolean {
  assertSet(a, "setDisjoint");
  assertSet(b, "setDisjoint");
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) return false;
  return true;
}

/** True when `a` and `b` contain the same elements (order-independent). */
export function setEqual<T>(a: Set<T>, b: Set<T>): boolean {
  assertSet(a, "setEqual");
  assertSet(b, "setEqual");
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Higher-order ops
// ---------------------------------------------------------------------------

/** Return a new set whose elements are `fn(x)` for each `x` in `s`. */
export function setMap<T, U>(s: Set<T>, fn: (x: T) => U): Set<U> {
  assertSet(s, "setMap");
  if (typeof fn !== "function") throw new Error("setMap: expected function");
  const out = new Set<U>();
  for (const x of s) out.add(fn(x));
  return out;
}

/** Return a new set containing only the elements of `s` for which `fn(x)` is truthy. */
export function setFilter<T>(s: Set<T>, fn: (x: T) => boolean): Set<T> {
  assertSet(s, "setFilter");
  if (typeof fn !== "function") throw new Error("setFilter: expected function");
  const out = new Set<T>();
  for (const x of s) if (fn(x)) out.add(x);
  return out;
}

/** Left fold over the set's elements (insertion order). */
export function setFold<T, A>(s: Set<T>, fn: (acc: A, x: T) => A, init: A): A {
  assertSet(s, "setFold");
  if (typeof fn !== "function") throw new Error("setFold: expected function");
  let acc = init;
  for (const x of s) acc = fn(acc, x);
  return acc;
}

/** True when at least one element satisfies `fn`. */
export function setAny<T>(s: Set<T>, fn: (x: T) => boolean): boolean {
  assertSet(s, "setAny");
  if (typeof fn !== "function") throw new Error("setAny: expected function");
  for (const x of s) if (fn(x)) return true;
  return false;
}

/** True when every element satisfies `fn` (vacuously true for the empty set). */
export function setAll<T>(s: Set<T>, fn: (x: T) => boolean): boolean {
  assertSet(s, "setAll");
  if (typeof fn !== "function") throw new Error("setAll: expected function");
  for (const x of s) if (!fn(x)) return false;
  return true;
}

/** Render the set as `{a, b, c}` in insertion order. */
export function setToString<T>(s: Set<T>): string {
  assertSet(s, "setToString");
  const parts: string[] = [];
  for (const x of s) parts.push(toDisplay(x));
  return "{" + parts.join(", ") + "}";
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "set",
  fns: [
    { name: "setNew", sig: "(arr?: any[]) -> Set", desc: "Create a new empty set, optionally seeded from arr." },
    { name: "setAdd", sig: "(s: Set, v: any) -> Set", desc: "Add v to s in place; returns s for chaining." },
    { name: "setRemove", sig: "(s: Set, v: any) -> bool", desc: "Remove v from s; returns whether it was present." },
    { name: "setHas", sig: "(s: Set, v: any) -> bool", desc: "True when s contains v." },
    { name: "setSize", sig: "(s: Set) -> int", desc: "Cardinality of s." },
    { name: "setToArray", sig: "(s: Set) -> any[]", desc: "Materialize the set as a plain array (insertion order)." },
    { name: "setUnion", sig: "(a: Set, b: Set) -> Set", desc: "Union: elements in a OR b." },
    { name: "setIntersect", sig: "(a: Set, b: Set) -> Set", desc: "Intersection: elements in both a AND b." },
    { name: "setDifference", sig: "(a: Set, b: Set) -> Set", desc: "Difference: elements in a but NOT in b." },
    { name: "setSymDiff", sig: "(a: Set, b: Set) -> Set", desc: "Symmetric difference: elements in exactly one of a, b." },
    { name: "setSubset", sig: "(a: Set, b: Set) -> bool", desc: "True when every element of a is also in b." },
    { name: "setSuperset", sig: "(a: Set, b: Set) -> bool", desc: "True when every element of b is also in a." },
    { name: "setDisjoint", sig: "(a: Set, b: Set) -> bool", desc: "True when a and b share no elements." },
    { name: "setEqual", sig: "(a: Set, b: Set) -> bool", desc: "True when a and b contain the same elements." },
    { name: "setMap", sig: "(s: Set, fn) -> Set", desc: "Return a new set of fn(x) for each x in s." },
    { name: "setFilter", sig: "(s: Set, fn) -> Set", desc: "Return a new set with only the elements satisfying fn." },
    { name: "setFold", sig: "(s: Set, fn, init) -> any", desc: "Left fold over the set's elements." },
    { name: "setAny", sig: "(s: Set, fn) -> bool", desc: "True when at least one element satisfies fn." },
    { name: "setAll", sig: "(s: Set, fn) -> bool", desc: "True when every element satisfies fn (vacuously true if empty)." },
    { name: "setToString", sig: "(s: Set) -> string", desc: "Render the set as {a, b, c}." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("setNew", setNew);
  registerBuiltin("setAdd", setAdd);
  registerBuiltin("setRemove", setRemove);
  registerBuiltin("setHas", setHas);
  registerBuiltin("setSize", setSize);
  registerBuiltin("setToArray", setToArray);
  registerBuiltin("setUnion", setUnion);
  registerBuiltin("setIntersect", setIntersect);
  registerBuiltin("setDifference", setDifference);
  registerBuiltin("setSymDiff", setSymDiff);
  registerBuiltin("setSubset", setSubset);
  registerBuiltin("setSuperset", setSuperset);
  registerBuiltin("setDisjoint", setDisjoint);
  registerBuiltin("setEqual", setEqual);
  registerBuiltin("setMap", setMap);
  registerBuiltin("setFilter", setFilter);
  registerBuiltin("setFold", setFold);
  registerBuiltin("setAny", setAny);
  registerBuiltin("setAll", setAll);
  registerBuiltin("setToString", setToString);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertSet(x: any, fn: string): asserts x is Set<any> {
  if (!(x instanceof Set)) throw new Error(fn + ": expected Set, got " + kind(x));
}

function assertArray(x: any, fn: string): asserts x is any[] {
  if (!Array.isArray(x)) throw new Error(fn + ": expected array, got " + kind(x));
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}

function toDisplay(x: any): string {
  if (typeof x === "string") return x;
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (typeof x === "object") {
    try { return JSON.stringify(x); } catch { return String(x); }
  }
  return String(x);
}
