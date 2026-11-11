/**
 * Aether stdlib — `collections` module.
 *
 * Provides Vector (array), Map, and Set helpers operating on plain JS values.
 * Array functions are *non-mutating* unless the name implies otherwise
 * (`push`, `pop`, `shift`, `unshift`, `insert`, `remove` return a new array
 * and leave the input untouched — this matches Aether's value semantics).
 * Map and Set helpers do mutate their first argument in place (since
 * `Map`/`Set` are reference types in JS); they also return the collection
 * for chaining.
 */

// ---------------------------------------------------------------------------
// Vector
// ---------------------------------------------------------------------------

export function push(arr: any[], v: any): any[] {
  if (!Array.isArray(arr)) throw new Error("push: expected array");
  return [...arr, v];
}

export function pop(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("pop: expected array");
  if (arr.length === 0) throw new Error("pop: empty array");
  return arr.slice(0, -1);
}

export function shift(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("shift: expected array");
  if (arr.length === 0) throw new Error("shift: empty array");
  return arr.slice(1);
}

export function unshift(arr: any[], v: any): any[] {
  if (!Array.isArray(arr)) throw new Error("unshift: expected array");
  return [v, ...arr];
}

export function insert(arr: any[], i: number, v: any): any[] {
  if (!Array.isArray(arr)) throw new Error("insert: expected array");
  assertInt(i, "insert");
  if (i < 0 || i > arr.length) throw new Error("insert: index out of bounds");
  return [...arr.slice(0, i), v, ...arr.slice(i)];
}

export function remove(arr: any[], i: number): any[] {
  if (!Array.isArray(arr)) throw new Error("remove: expected array");
  assertInt(i, "remove");
  if (i < 0 || i >= arr.length) throw new Error("remove: index out of bounds");
  return [...arr.slice(0, i), ...arr.slice(i + 1)];
}

export function slice(arr: any[], i: number, j?: number): any[] {
  if (!Array.isArray(arr)) throw new Error("slice: expected array");
  assertInt(i, "slice");
  if (j === undefined || j === null) return arr.slice(i);
  assertInt(j, "slice");
  return arr.slice(i, j);
}

export function concat(a: any[], b: any[]): any[] {
  if (!Array.isArray(a) || !Array.isArray(b)) throw new Error("concat: expected arrays");
  return [...a, ...b];
}

export function reverse(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("reverse: expected array");
  return [...arr].reverse();
}

/** Default ordering: numbers ascending, then strings ascending, then others. */
function defaultCmp(a: any, b: any): number {
  const ta = typeof a, tb = typeof b;
  if (ta === "number" && tb === "number") return a - b;
  if (ta === "string" && tb === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (ta === "boolean" && tb === "boolean") return a === b ? 0 : a ? 1 : -1;
  // Fallback: compare by string form.
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function sort(arr: any[], cmp?: (a: any, b: any) => number): any[] {
  if (!Array.isArray(arr)) throw new Error("sort: expected array");
  const fn = cmp ?? defaultCmp;
  if (typeof fn !== "function") throw new Error("sort: comparator must be a function");
  return [...arr].sort(fn);
}

export function map(arr: any[], fn: (v: any, i: number) => any): any[] {
  if (!Array.isArray(arr)) throw new Error("map: expected array");
  if (typeof fn !== "function") throw new Error("map: fn must be a function");
  return arr.map((v, i) => fn(v, i));
}

export function filter(arr: any[], fn: (v: any, i: number) => boolean): any[] {
  if (!Array.isArray(arr)) throw new Error("filter: expected array");
  if (typeof fn !== "function") throw new Error("filter: fn must be a function");
  return arr.filter((v, i) => fn(v, i));
}

export function reduce(arr: any[], fn: (acc: any, v: any, i: number) => any, init: any): any {
  if (!Array.isArray(arr)) throw new Error("reduce: expected array");
  if (typeof fn !== "function") throw new Error("reduce: fn must be a function");
  let acc = init;
  for (let i = 0; i < arr.length; i++) acc = fn(acc, arr[i], i);
  return acc;
}

export function find(arr: any[], fn: (v: any, i: number) => boolean): any {
  if (!Array.isArray(arr)) throw new Error("find: expected array");
  if (typeof fn !== "function") throw new Error("find: fn must be a function");
  for (let i = 0; i < arr.length; i++) {
    if (fn(arr[i], i)) return arr[i];
  }
  return null;
}

export function findIndex(arr: any[], fn: (v: any, i: number) => boolean): number {
  if (!Array.isArray(arr)) throw new Error("findIndex: expected array");
  if (typeof fn !== "function") throw new Error("findIndex: fn must be a function");
  for (let i = 0; i < arr.length; i++) {
    if (fn(arr[i], i)) return i;
  }
  return -1;
}

export function every(arr: any[], fn: (v: any, i: number) => boolean): boolean {
  if (!Array.isArray(arr)) throw new Error("every: expected array");
  if (typeof fn !== "function") throw new Error("every: fn must be a function");
  for (let i = 0; i < arr.length; i++) {
    if (!fn(arr[i], i)) return false;
  }
  return true;
}

export function some(arr: any[], fn: (v: any, i: number) => boolean): boolean {
  if (!Array.isArray(arr)) throw new Error("some: expected array");
  if (typeof fn !== "function") throw new Error("some: fn must be a function");
  for (let i = 0; i < arr.length; i++) {
    if (fn(arr[i], i)) return true;
  }
  return false;
}

export function includes(arr: any[], v: any): boolean {
  if (!Array.isArray(arr)) throw new Error("includes: expected array");
  return arr.some((x) => deepEq(x, v));
}

export function indexOf(arr: any[], v: any): number {
  if (!Array.isArray(arr)) throw new Error("indexOf: expected array");
  for (let i = 0; i < arr.length; i++) {
    if (deepEq(arr[i], v)) return i;
  }
  return -1;
}

export function flat(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("flat: expected array");
  // Flatten one level (matches Array.prototype.flat() default).
  const out: any[] = [];
  for (const x of arr) {
    if (Array.isArray(x)) out.push(...x);
    else out.push(x);
  }
  return out;
}

export function flatMap(arr: any[], fn: (v: any, i: number) => any): any[] {
  if (!Array.isArray(arr)) throw new Error("flatMap: expected array");
  if (typeof fn !== "function") throw new Error("flatMap: fn must be a function");
  const out: any[] = [];
  for (let i = 0; i < arr.length; i++) {
    const r = fn(arr[i], i);
    if (Array.isArray(r)) out.push(...r);
    else out.push(r);
  }
  return out;
}

export function zip(a: any[], b: any[]): any[] {
  if (!Array.isArray(a) || !Array.isArray(b)) throw new Error("zip: expected arrays");
  const n = Math.min(a.length, b.length);
  const out: any[] = [];
  for (let i = 0; i < n; i++) out.push([a[i], b[i]]);
  return out;
}

export function chunk(arr: any[], n: number): any[] {
  if (!Array.isArray(arr)) throw new Error("chunk: expected array");
  assertInt(n, "chunk");
  if (n <= 0) throw new Error("chunk: size must be positive");
  const out: any[] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function unique(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("unique: expected array");
  const out: any[] = [];
  for (const x of arr) {
    if (!out.some((y) => deepEq(y, x))) out.push(x);
  }
  return out;
}

export function len(arr: any[]): number {
  if (Array.isArray(arr)) return arr.length;
  if (arr instanceof Map || arr instanceof Set) return arr.size;
  throw new Error("len: expected array, map, or set");
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

export function mapNew(): Map<any, any> {
  return new Map<any, any>();
}

export function mapSet(m: Map<any, any>, k: any, v: any): Map<any, any> {
  if (!(m instanceof Map)) throw new Error("mapSet: expected map");
  m.set(k, v);
  return m;
}

export function mapGet(m: Map<any, any>, k: any): any {
  if (!(m instanceof Map)) throw new Error("mapGet: expected map");
  if (!m.has(k)) throw new Error("mapGet: key not found: " + String(k));
  return m.get(k);
}

export function mapHas(m: Map<any, any>, k: any): boolean {
  if (!(m instanceof Map)) throw new Error("mapHas: expected map");
  return m.has(k);
}

export function mapDelete(m: Map<any, any>, k: any): boolean {
  if (!(m instanceof Map)) throw new Error("mapDelete: expected map");
  return m.delete(k);
}

export function mapKeys(m: Map<any, any>): any[] {
  if (!(m instanceof Map)) throw new Error("mapKeys: expected map");
  return Array.from(m.keys());
}

export function mapValues(m: Map<any, any>): any[] {
  if (!(m instanceof Map)) throw new Error("mapValues: expected map");
  return Array.from(m.values());
}

export function mapEntries(m: Map<any, any>): any[] {
  if (!(m instanceof Map)) throw new Error("mapEntries: expected map");
  return Array.from(m.entries()).map(([k, v]) => ({ fields: { key: k, value: v } }));
}

export function mapSize(m: Map<any, any>): number {
  if (!(m instanceof Map)) throw new Error("mapSize: expected map");
  return m.size;
}

// ---------------------------------------------------------------------------
// Set
// ---------------------------------------------------------------------------

export function setNew(): Set<any> {
  return new Set<any>();
}

export function setAdd(s: Set<any>, v: any): Set<any> {
  if (!(s instanceof Set)) throw new Error("setAdd: expected set");
  s.add(v);
  return s;
}

export function setHas(s: Set<any>, v: any): boolean {
  if (!(s instanceof Set)) throw new Error("setHas: expected set");
  return s.has(v);
}

export function setDelete(s: Set<any>, v: any): boolean {
  if (!(s instanceof Set)) throw new Error("setDelete: expected set");
  return s.delete(v);
}

export function setSize(s: Set<any>): number {
  if (!(s instanceof Set)) throw new Error("setSize: expected set");
  return s.size;
}

export function setToArray(s: Set<any>): any[] {
  if (!(s instanceof Set)) throw new Error("setToArray: expected set");
  return Array.from(s);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertInt(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x) || !Number.isInteger(x)) {
    throw new Error(fn + ": expected integer, got " + String(x));
  }
}

function deepEq(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEq(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
export const MANIFEST = {
  module: "collections",
  fns: [
    { name: "push", sig: "(arr: any[], v: any) -> any[]", desc: "Append v; non-mutating." },
    { name: "pop", sig: "(arr: any[]) -> any[]", desc: "Drop last element; non-mutating." },
    { name: "shift", sig: "(arr: any[]) -> any[]", desc: "Drop first element; non-mutating." },
    { name: "unshift", sig: "(arr: any[], v: any) -> any[]", desc: "Prepend v; non-mutating." },
    { name: "insert", sig: "(arr: any[], i: int, v: any) -> any[]", desc: "Insert v at i." },
    { name: "remove", sig: "(arr: any[], i: int) -> any[]", desc: "Remove element at i." },
    { name: "slice", sig: "(arr: any[], i: int, j?: int) -> any[]", desc: "Subarray [i, j)." },
    { name: "concat", sig: "(a: any[], b: any[]) -> any[]", desc: "Concatenate." },
    { name: "reverse", sig: "(arr: any[]) -> any[]", desc: "Reversed copy." },
    { name: "sort", sig: "(arr: any[], cmp?: fn) -> any[]", desc: "Sorted copy (default ascending)." },
    { name: "map", sig: "(arr: any[], fn) -> any[]", desc: "Apply fn to each element." },
    { name: "filter", sig: "(arr: any[], fn) -> any[]", desc: "Keep elements where fn is true." },
    { name: "reduce", sig: "(arr: any[], fn, init) -> any", desc: "Fold left." },
    { name: "find", sig: "(arr: any[], fn) -> any", desc: "First element where fn is true, else null." },
    { name: "findIndex", sig: "(arr: any[], fn) -> int", desc: "Index of first element where fn is true, else -1." },
    { name: "every", sig: "(arr: any[], fn) -> bool", desc: "True if fn holds for all elements." },
    { name: "some", sig: "(arr: any[], fn) -> bool", desc: "True if fn holds for any element." },
    { name: "includes", sig: "(arr: any[], v: any) -> bool", desc: "Membership test (deep equality)." },
    { name: "indexOf", sig: "(arr: any[], v: any) -> int", desc: "First index of v, else -1." },
    { name: "flat", sig: "(arr: any[]) -> any[]", desc: "Flatten one level." },
    { name: "flatMap", sig: "(arr: any[], fn) -> any[]", desc: "map then flat one level." },
    { name: "zip", sig: "(a: any[], b: any[]) -> any[]", desc: "Pairwise zip (length = min)." },
    { name: "chunk", sig: "(arr: any[], n: int) -> any[]", desc: "Split into arrays of size n." },
    { name: "unique", sig: "(arr: any[]) -> any[]", desc: "Deduplicate (deep equality)." },
    { name: "len", sig: "(arr: any[] | map | set) -> int", desc: "Element count." },
    { name: "mapNew", sig: "() -> map", desc: "Create empty map." },
    { name: "mapSet", sig: "(m: map, k, v) -> map", desc: "Set key/value; mutates." },
    { name: "mapGet", sig: "(m: map, k) -> any", desc: "Get by key; panics if absent." },
    { name: "mapHas", sig: "(m: map, k) -> bool", desc: "Test membership." },
    { name: "mapDelete", sig: "(m: map, k) -> bool", desc: "Delete key; mutates." },
    { name: "mapKeys", sig: "(m: map) -> any[]", desc: "Array of keys." },
    { name: "mapValues", sig: "(m: map) -> any[]", desc: "Array of values." },
    { name: "mapEntries", sig: "(m: map) -> any[]", desc: "Array of {key, value} structs." },
    { name: "mapSize", sig: "(m: map) -> int", desc: "Number of entries." },
    { name: "setNew", sig: "() -> set", desc: "Create empty set." },
    { name: "setAdd", sig: "(s: set, v) -> set", desc: "Add element; mutates." },
    { name: "setHas", sig: "(s: set, v) -> bool", desc: "Test membership." },
    { name: "setDelete", sig: "(s: set, v) -> bool", desc: "Delete element; mutates." },
    { name: "setSize", sig: "(s: set) -> int", desc: "Number of elements." },
    { name: "setToArray", sig: "(s: set) -> any[]", desc: "Convert to array." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("push", push);
  registerBuiltin("pop", pop);
  registerBuiltin("shift", shift);
  registerBuiltin("unshift", unshift);
  registerBuiltin("insert", insert);
  registerBuiltin("remove", remove);
  registerBuiltin("slice", slice);
  registerBuiltin("concat", concat);
  registerBuiltin("reverse", reverse);
  registerBuiltin("sort", sort);
  registerBuiltin("map", map);
  registerBuiltin("filter", filter);
  registerBuiltin("reduce", reduce);
  registerBuiltin("find", find);
  registerBuiltin("findIndex", findIndex);
  registerBuiltin("every", every);
  registerBuiltin("some", some);
  registerBuiltin("includes", includes);
  registerBuiltin("indexOf", indexOf);
  registerBuiltin("flat", flat);
  registerBuiltin("flatMap", flatMap);
  registerBuiltin("zip", zip);
  registerBuiltin("chunk", chunk);
  registerBuiltin("unique", unique);
  registerBuiltin("len", len);
  registerBuiltin("mapNew", mapNew);
  registerBuiltin("mapSet", mapSet);
  registerBuiltin("mapGet", mapGet);
  registerBuiltin("mapHas", mapHas);
  registerBuiltin("mapDelete", mapDelete);
  registerBuiltin("mapKeys", mapKeys);
  registerBuiltin("mapValues", mapValues);
  registerBuiltin("mapEntries", mapEntries);
  registerBuiltin("mapSize", mapSize);
  registerBuiltin("setNew", setNew);
  registerBuiltin("setAdd", setAdd);
  registerBuiltin("setHas", setHas);
  registerBuiltin("setDelete", setDelete);
  registerBuiltin("setSize", setSize);
  registerBuiltin("setToArray", setToArray);
}
