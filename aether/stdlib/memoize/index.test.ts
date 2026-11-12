import { describe, it, expect } from "vitest";
import * as M from "./index";

describe("memoize module", () => {
  it("memoizeNew: creates an empty cache", () => {
    const c = M.memoizeNew<number>();
    expect(M.memoizeSize(c)).toBe(0);
    expect(M.memoizeStats(c)).toEqual({ hits: 0, misses: 0, evictions: 0, size: 0 });
  });

  it("memoizeNew: accepts a function", () => {
    const fn = (x: number) => x * 2;
    const c = M.memoizeNew(fn);
    expect(M.memoizeGet(c, 5)).toBe(10);
    expect(M.memoizeStats(c).misses).toBe(1);
    expect(M.memoizeStats(c).hits).toBe(0);
  });

  it("memoizeNew: accepts a capacity", () => {
    const c = M.memoizeNew<number>(null, 3);
    expect(c.capacity).toBe(3);
  });

  it("memoizeNew: rejects negative capacity", () => {
    expect(() => M.memoizeNew(null, -1)).toThrow();
  });

  it("memoizeNew: rejects non-integer capacity", () => {
    expect(() => M.memoizeNew(null, 1.5)).toThrow();
  });

  it("memoizeNew: rejects non-function fn", () => {
    expect(() => M.memoizeNew("not a fn" as any)).toThrow();
  });

  it("memoizeGet: returns undefined on miss with no fn", () => {
    const c = M.memoizeNew<number>(null);
    expect(M.memoizeGet(c, "x")).toBeUndefined();
    expect(M.memoizeStats(c).misses).toBe(1);
  });

  it("memoizeGet: computes on miss using the wrapped fn", () => {
    let calls = 0;
    const fn = (x: number) => { calls++; return x + 1; };
    const c = M.memoizeNew(fn);
    expect(M.memoizeGet(c, 1)).toBe(2);
    expect(M.memoizeGet(c, 1)).toBe(2);
    expect(calls).toBe(1); // only computed once
    expect(M.memoizeStats(c)).toEqual({ hits: 1, misses: 1, evictions: 0, size: 1 });
  });

  it("memoizeGet: distinguishes different args", () => {
    const c = M.memoizeNew((x: number) => x * 10);
    expect(M.memoizeGet(c, 1)).toBe(10);
    expect(M.memoizeGet(c, 2)).toBe(20);
    expect(M.memoizeSize(c)).toBe(2);
  });

  it("memoizeGet: handles multi-arg functions", () => {
    const c = M.memoizeNew((a: number, b: number) => a + b);
    expect(M.memoizeGet(c, 1, 2)).toBe(3);
    expect(M.memoizeGet(c, 1, 2)).toBe(3);
    expect(M.memoizeStats(c).hits).toBe(1);
  });

  it("memoizeGet: updates LRU recency on hit", () => {
    const c = M.memoizeNew<number>(null, 2);
    M.memoizeSet(c, 1, [1]);
    M.memoizeSet(c, 2, [2]);
    // Touch 1 to make it more recent.
    M.memoizeGet(c, 1);
    M.memoizeSet(c, 3, [3]); // should evict 2 (least recent)
    expect(M.memoizeHas(c, 1)).toBe(true);
    expect(M.memoizeHas(c, 2)).toBe(false);
    expect(M.memoizeHas(c, 3)).toBe(true);
    expect(M.memoizeStats(c).evictions).toBe(1);
  });

  it("memoizeSet: stores a value directly", () => {
    const c = M.memoizeNew<number>(null);
    M.memoizeSet(c, 42, ["k"]);
    expect(M.memoizeGet(c, "k")).toBe(42);
  });

  it("memoizeSet: is chainable", () => {
    const c = M.memoizeNew<number>(null);
    expect(M.memoizeSet(c, 1, ["x"])).toBe(c);
  });

  it("memoizeSet: enforces capacity via LRU eviction", () => {
    const c = M.memoizeNew<number>(null, 2);
    M.memoizeSet(c, 1, ["a"]);
    M.memoizeSet(c, 2, ["b"]);
    M.memoizeSet(c, 3, ["c"]); // evict "a"
    expect(M.memoizeSize(c)).toBe(2);
    expect(M.memoizeHas(c, "a")).toBe(false);
    expect(M.memoizeHas(c, "b")).toBe(true);
    expect(M.memoizeHas(c, "c")).toBe(true);
  });

  it("memoizeSet: rejects non-array args", () => {
    const c = M.memoizeNew<number>(null);
    expect(() => M.memoizeSet(c, 1, "not an array" as any)).toThrow();
  });

  it("memoizeHas: returns true/false correctly", () => {
    const c = M.memoizeNew<number>(null);
    expect(M.memoizeHas(c, "x")).toBe(false);
    M.memoizeSet(c, 1, ["x"]);
    expect(M.memoizeHas(c, "x")).toBe(true);
  });

  it("memoizeHas: does not compute or change stats", () => {
    const c = M.memoizeNew<number>(() => 999);
    M.memoizeHas(c, "x");
    expect(M.memoizeStats(c)).toEqual({ hits: 0, misses: 0, evictions: 0, size: 0 });
  });

  it("memoizeSize: tracks entries", () => {
    const c = M.memoizeNew<number>(null);
    expect(M.memoizeSize(c)).toBe(0);
    M.memoizeSet(c, 1, ["a"]);
    M.memoizeSet(c, 2, ["b"]);
    expect(M.memoizeSize(c)).toBe(2);
  });

  it("memoizeClear: drops all entries and resets stats", () => {
    const c = M.memoizeNew<number>(() => 1);
    M.memoizeGet(c, 1);
    M.memoizeGet(c, 2);
    expect(M.memoizeSize(c)).toBe(2);
    expect(M.memoizeStats(c).misses).toBe(2);
    M.memoizeClear(c);
    expect(M.memoizeSize(c)).toBe(0);
    expect(M.memoizeStats(c)).toEqual({ hits: 0, misses: 0, evictions: 0, size: 0 });
  });

  it("memoizeStats: returns a snapshot", () => {
    const c = M.memoizeNew<number>(() => 1);
    M.memoizeGet(c, 1); // miss, compute, store
    M.memoizeGet(c, 1); // hit
    const s = M.memoizeStats(c);
    expect(s).toEqual({ hits: 1, misses: 1, evictions: 0, size: 1 });
    // Mutating the snapshot does not affect the cache.
    s.hits = 9999;
    expect(M.memoizeStats(c).hits).toBe(1);
  });

  it("memoizeEvict: removes one entry", () => {
    const c = M.memoizeNew<number>(null);
    M.memoizeSet(c, 1, ["a"]);
    M.memoizeSet(c, 2, ["b"]);
    expect(M.memoizeEvict(c, "a")).toBe(true);
    expect(M.memoizeSize(c)).toBe(1);
    expect(M.memoizeHas(c, "a")).toBe(false);
  });

  it("memoizeEvict: returns false for missing key", () => {
    const c = M.memoizeNew<number>(null);
    expect(M.memoizeEvict(c, "missing")).toBe(false);
  });

  it("memoize: validators reject bad input", () => {
    expect(() => M.memoizeGet(null as any, 1)).toThrow();
    expect(() => M.memoizeGet({} as any, 1)).toThrow();
    expect(() => M.memoizeSet({ entries: "x" } as any, 1, [])).toThrow();
  });
});
