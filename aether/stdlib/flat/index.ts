/**
 * Aether stdlib — `flat` module.
 *
 * A focused toolkit for flattening nested arrays: one-level flattening,
 * deep (recursive) flattening, flattening while mapping, chunked
 * flattening, key/path flattening of nested records, and a few
 * variants that come up in real code.  Every function returns a NEW
 * array or NEW record — the input is never mutated.
 *
 * Naming note: `flat` and `flatMap` here intentionally shadow the older
 * bare-name versions registered from the `collections` module; the
 * `flat`-module versions are strict supersets (same one-level
 * semantics, richer error messages) so user code that relied on the
 * older behaviour keeps working.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Coerce any input into a 1-element array (used by concat-style flatteners). */
function toArray1(x: any): any[] {
  if (Array.isArray(x)) return x;
  return [x];
}

/** Flatten a single level: arrays inside `arr` are spliced in; scalars stay. */
export function flat(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("flat: expected array");
  const out: any[] = [];
  for (const x of arr) {
    if (Array.isArray(x)) {
      for (const y of x) out.push(y);
    } else {
      out.push(x);
    }
  }
  return out;
}

/**
 * Flatten `arr` recursively until no element is an array.  Cycles are
 * not detected (Aether values are trees, not graphs, in practice).
 */
export function flatDeep(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("flatDeep: expected array");
  const out: any[] = [];
  function walk(x: any) {
    if (Array.isArray(x)) {
      for (const y of x) walk(y);
    } else {
      out.push(x);
    }
  }
  for (const x of arr) walk(x);
  return out;
}

/**
 * Flatten by an explicit depth.  `depth=0` returns a copy of `arr`
 * unchanged; `depth=1` is equivalent to `flat`; `depth=-1` is treated
 * as `flatDeep` (an arbitrary-large depth).
 */
export function flatten(arr: any[], depth: number = 1): any[] {
  if (!Array.isArray(arr)) throw new Error("flatten: expected array");
  if (typeof depth !== "number" || !Number.isFinite(depth)) {
    throw new Error("flatten: depth must be a finite number");
  }
  const d = Math.floor(depth);
  if (d === 0) {
    // Shallow copy — never return the input reference.
    return arr.slice();
  }
  if (d < 0) return flatDeep(arr);
  function walk(x: any, k: number): any {
    if (Array.isArray(x) && k > 0) {
      const acc: any[] = [];
      for (const y of x) {
        const w = walk(y, k - 1);
        if (Array.isArray(w)) for (const z of w) acc.push(z);
        else acc.push(w);
      }
      return acc;
    }
    return x;
  }
  const out = walk(arr, d);
  return Array.isArray(out) ? out : [out];
}

/**
 * Flatten `arr` into chunks of size `n`: flatten one level, then
 * re-chunk into groups of `n`.  `n` must be a positive integer.
 */
export function chunkFlat(arr: any[], n: number): any[] {
  if (!Array.isArray(arr)) throw new Error("chunkFlat: expected array");
  if (!Number.isInteger(n) || n <= 0) throw new Error("chunkFlat: n must be a positive int");
  const flat1 = flat(arr);
  const out: any[] = [];
  let i = 0;
  while (i < flat1.length) {
    const chunk: any[] = [];
    let j = 0;
    while (j < n && i + j < flat1.length) {
      chunk.push(flat1[i + j]);
      j++;
    }
    out.push(chunk);
    i += n;
  }
  return out;
}

/**
 * Map each element of `arr` through `fn` and flatten the result by
 * one level.  `fn(value, index)` may return a scalar (kept as-is) or
 * an array (spliced in).
 */
export function flatMap(arr: any[], fn: (v: any, i: number) => any): any[] {
  if (!Array.isArray(arr)) throw new Error("flatMap: expected array");
  if (typeof fn !== "function") throw new Error("flatMap: fn must be a function");
  const out: any[] = [];
  for (let i = 0; i < arr.length; i++) {
    const r = fn(arr[i], i);
    if (Array.isArray(r)) {
      for (const y of r) out.push(y);
    } else {
      out.push(r);
    }
  }
  return out;
}

/**
 * Map each element through `fn` and flatten the result deeply.
 * `fn(value, index)` may return a nested array; the entire nested
 * structure is recursively flattened into the output.
 */
export function flatMapDeep(arr: any[], fn: (v: any, i: number) => any): any[] {
  if (!Array.isArray(arr)) throw new Error("flatMapDeep: expected array");
  if (typeof fn !== "function") throw new Error("flatMapDeep: fn must be a function");
  const out: any[] = [];
  function walk(x: any) {
    if (Array.isArray(x)) {
      for (const y of x) walk(y);
    } else {
      out.push(x);
    }
  }
  for (let i = 0; i < arr.length; i++) {
    walk(fn(arr[i], i));
  }
  return out;
}

/**
 * Flatten `arr` by `n` levels of nesting only — leaves below `n`
 * levels of arrays stay as arrays.  `n=0` is a shallow copy; `n=1`
 * equals `flat`; `n=2` flattens arrays-of-arrays-of-arrays by two
 * levels, etc.
 */
export function nestedFlat(arr: any[], n: number = 1): any[] {
  return flatten(arr, n);
}

// ---------------------------------------------------------------------------
// Record/object flattening — useful for config / form / query-string
// scenarios where nested records are turned into flat key→value maps.
// ---------------------------------------------------------------------------

/** Stringify a path segment: integers are bracketed, strings are dotted. */
function pathSeg(key: string | number, isRoot: boolean): string {
  if (typeof key === "number" && Number.isInteger(key)) {
    return `[${key}]`;
  }
  return isRoot ? String(key) : "." + key;
}

/**
 * Flatten a nested record into a single-level record whose keys are
 * dotted paths.  Example: `{ a: { b: 1 } }` → `{ "a.b": 1 }`.
 * Array indices become bracketed segments: `{ a: [10, 20] }` →
 * `{ "a[0]": 10, "a[1]": 20 }`.
 */
export function flattenKeys(obj: Record<string, any>): Record<string, any> {
  if (obj === null || obj === undefined || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("flattenKeys: expected a record object");
  }
  const out: Record<string, any> = {};
  function walk(prefix: string, val: any) {
    if (val === null || val === undefined) {
      out[prefix] = val;
      return;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) {
        out[prefix] = [];
        return;
      }
      for (let i = 0; i < val.length; i++) {
        walk(prefix + "[" + i + "]", val[i]);
      }
      return;
    }
    if (typeof val === "object") {
      const keys = Object.keys(val);
      if (keys.length === 0) {
        out[prefix] = {};
        return;
      }
      for (const k of keys) {
        const next = prefix === "" ? String(k) : prefix + "." + k;
        walk(next, (val as any)[k]);
      }
      return;
    }
    out[prefix] = val;
  }
  walk("", obj);
  return out;
}

/**
 * Like `flattenKeys` but accepts a custom separator string (default
 * `"/"`) instead of dots.  Useful for file-system-style paths.
 * Example: `{ a: { b: 1 } }` → `{ "a/b": 1 }`.
 */
export function flattenPath(obj: Record<string, any>, sep: string = "/"): Record<string, any> {
  if (obj === null || obj === undefined || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("flattenPath: expected a record object");
  }
  if (typeof sep !== "string") throw new Error("flattenPath: sep must be a string");
  if (sep === "") throw new Error("flattenPath: sep must not be empty");
  const out: Record<string, any> = {};
  function walk(prefix: string, val: any) {
    if (val === null || val === undefined) {
      out[prefix] = val;
      return;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) {
        out[prefix] = [];
        return;
      }
      for (let i = 0; i < val.length; i++) {
        walk(prefix + "[" + i + "]", val[i]);
      }
      return;
    }
    if (typeof val === "object") {
      const keys = Object.keys(val);
      if (keys.length === 0) {
        out[prefix] = {};
        return;
      }
      for (const k of keys) {
        const next = prefix === "" ? String(k) : prefix + sep + k;
        walk(next, (val as any)[k]);
      }
      return;
    }
    out[prefix] = val;
  }
  walk("", obj);
  return out;
}

/**
 * Concatenate any number of arrays (and scalars) into a single flat
 * array.  Scalars are wrapped in a 1-element array; arrays are
 * spliced in.  Equivalent to lodash's `concat` for the variadic case.
 */
export function concatAll(...arrs: any[]): any[] {
  const out: any[] = [];
  for (const a of arrs) {
    const items = toArray1(a);
    for (const x of items) out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "flat",
  fns: [
    { name: "flat", sig: "(arr: any[]) -> any[]", desc: "Flatten one level of nested arrays." },
    { name: "flatDeep", sig: "(arr: any[]) -> any[]", desc: "Recursively flatten all nesting." },
    { name: "flatten", sig: "(arr: any[], depth?: number) -> any[]", desc: "Flatten by an explicit depth; depth<0 means infinite." },
    { name: "chunkFlat", sig: "(arr: any[], n: int) -> any[]", desc: "Flatten one level, then re-chunk into groups of n." },
    { name: "flatMap", sig: "(arr: any[], fn) -> any[]", desc: "Map fn over arr, then flatten one level." },
    { name: "flatMapDeep", sig: "(arr: any[], fn) -> any[]", desc: "Map fn over arr, then flatten all nesting." },
    { name: "nestedFlat", sig: "(arr: any[], n?: int) -> any[]", desc: "Flatten n levels of nesting (alias of flatten)." },
    { name: "flattenKeys", sig: "(obj: record) -> record", desc: "Flatten a nested record into dot-path keys." },
    { name: "flattenPath", sig: "(obj: record, sep?: string) -> record", desc: "Flatten a nested record into separator-path keys (default '/')." },
    { name: "concatAll", sig: "(...arrs: any[]) -> any[]", desc: "Concatenate any mix of arrays and scalars into one flat array." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("flat", flat);
  registerBuiltin("flatDeep", flatDeep);
  registerBuiltin("flatten", flatten);
  registerBuiltin("chunkFlat", chunkFlat);
  registerBuiltin("flatMap", flatMap);
  registerBuiltin("flatMapDeep", flatMapDeep);
  registerBuiltin("nestedFlat", nestedFlat);
  registerBuiltin("flattenKeys", flattenKeys);
  registerBuiltin("flattenPath", flattenPath);
  registerBuiltin("concatAll", concatAll);
}
