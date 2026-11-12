import { describe, it, expect } from "vitest";
import * as L from "./index";

describe("lru-cache module", () => {
  it("lruNew: creates empty cache with capacity", () => {
    const c = L.lruNew(5);
    expect(L.lruSize(c)).toBe(0);
  });

  it("lruNew: rejects non-positive capacity", () => {
    expect(() => L.lruNew(0)).toThrow();
    expect(() => L.lruNew(-1)).toThrow();
    expect(() => L.lruNew(NaN)).toThrow();
    expect(() => L.lruNew(Infinity)).toThrow();
  });

  it("lruPut: stores value", () => {
    const c = L.lruNew(5);
    L.lruPut(c, "a", 1);
    expect(L.lruSize(c)).toBe(1);
    expect(L.lruGet(c, "a")).toBe(1);
  });

  it("lruPut: returns undefined when no eviction", () => {
    const c = L.lruNew(5);
    expect(L.lruPut(c, "a", 1)).toBeUndefined();
  });

  it("lruPut: returns evicted entry when full", () => {
    const c = L.lruNew(2);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    const evicted = L.lruPut(c, "c", 3);
    expect(evicted).toEqual(["a", 1]);
    expect(L.lruSize(c)).toBe(2);
  });

  it("lruPut: updating existing key doesn't evict", () => {
    const c = L.lruNew(2);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    const evicted = L.lruPut(c, "a", 10);
    expect(evicted).toBeUndefined();
    expect(L.lruGet(c, "a")).toBe(10);
    expect(L.lruSize(c)).toBe(2);
  });

  it("lruGet: marks entry as recently used", () => {
    const c = L.lruNew(3);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    L.lruPut(c, "c", 3);
    // Touch "a" so it's most-recently-used.
    L.lruGet(c, "a");
    // Now insert "d"; "b" should be evicted (LRU), not "a".
    const evicted = L.lruPut(c, "d", 4);
    expect(evicted).toEqual(["b", 2]);
    expect(L.lruContains(c, "a")).toBe(true);
    expect(L.lruContains(c, "b")).toBe(false);
  });

  it("lruGet: returns undefined for missing key", () => {
    const c = L.lruNew(5);
    expect(L.lruGet(c, "missing")).toBeUndefined();
  });

  it("lruPeek: doesn't mark as recently used", () => {
    const c = L.lruNew(3);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    L.lruPut(c, "c", 3);
    // Peek "a" — should NOT change LRU order.
    expect(L.lruPeek(c, "a")).toBe(1);
    // Now insert "d"; "a" should still be evicted (LRU).
    const evicted = L.lruPut(c, "d", 4);
    expect(evicted).toEqual(["a", 1]);
  });

  it("lruPeek: returns undefined for missing key", () => {
    const c = L.lruNew(5);
    expect(L.lruPeek(c, "missing")).toBeUndefined();
  });

  it("lruContains: true/false without touching order", () => {
    const c = L.lruNew(3);
    L.lruPut(c, "a", 1);
    expect(L.lruContains(c, "a")).toBe(true);
    expect(L.lruContains(c, "missing")).toBe(false);
    // After contains, "a" should still be the LRU.
    L.lruPut(c, "b", 2);
    L.lruPut(c, "c", 3);
    const evicted = L.lruPut(c, "d", 4);
    expect(evicted).toEqual(["a", 1]);
  });

  it("lruSize: 0 for empty", () => {
    expect(L.lruSize(L.lruNew(5))).toBe(0);
  });

  it("lruSize: counts entries", () => {
    const c = L.lruNew(10);
    L.lruPut(c, "a", 1); L.lruPut(c, "b", 2); L.lruPut(c, "c", 3);
    expect(L.lruSize(c)).toBe(3);
  });

  it("lruClear: empties the cache", () => {
    const c = L.lruNew(10);
    L.lruPut(c, "a", 1); L.lruPut(c, "b", 2);
    L.lruClear(c);
    expect(L.lruSize(c)).toBe(0);
    expect(L.lruContains(c, "a")).toBe(false);
  });

  it("lruKeys: returns keys in LRU order (oldest first)", () => {
    const c = L.lruNew(5);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    L.lruPut(c, "c", 3);
    expect(L.lruKeys(c)).toEqual(["a", "b", "c"]);
  });

  it("lruKeys: updates order after get", () => {
    const c = L.lruNew(5);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    L.lruPut(c, "c", 3);
    L.lruGet(c, "a");
    expect(L.lruKeys(c)).toEqual(["b", "c", "a"]);
  });

  it("lruValues: returns values in LRU order", () => {
    const c = L.lruNew(5);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    L.lruPut(c, "c", 3);
    expect(L.lruValues(c)).toEqual([1, 2, 3]);
  });

  it("lruEvict: removes and returns LRU entry", () => {
    const c = L.lruNew(5);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    const evicted = L.lruEvict(c);
    expect(evicted).toEqual(["a", 1]);
    expect(L.lruSize(c)).toBe(1);
    expect(L.lruContains(c, "a")).toBe(false);
  });

  it("lruEvict: returns undefined for empty cache", () => {
    const c = L.lruNew(5);
    expect(L.lruEvict(c)).toBeUndefined();
  });

  it("lruEvict: respects LRU order after get", () => {
    const c = L.lruNew(5);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    L.lruPut(c, "c", 3);
    L.lruGet(c, "a");  // now a is most-recently-used
    expect(L.lruEvict(c)).toEqual(["b", 2]);  // b is least-recently-used
  });

  it("eviction order matches LRU policy over many ops", () => {
    const c = L.lruNew(3);
    L.lruPut(c, 1, "a");
    L.lruPut(c, 2, "b");
    L.lruPut(c, 3, "c");
    L.lruGet(c, 1);
    L.lruGet(c, 2);
    L.lruPut(c, 4, "d");  // evicts 3
    L.lruPut(c, 5, "e");  // evicts 1
    expect(L.lruKeys(c)).toEqual([2, 4, 5]);
  });

  it("capacity 1 cache evicts on every put", () => {
    const c = L.lruNew(1);
    expect(L.lruPut(c, "a", 1)).toBeUndefined();
    expect(L.lruPut(c, "b", 2)).toEqual(["a", 1]);
    expect(L.lruPut(c, "c", 3)).toEqual(["b", 2]);
    expect(L.lruSize(c)).toBe(1);
    expect(L.lruGet(c, "c")).toBe(3);
  });

  it("non-LRUCache argument panics", () => {
    expect(() => L.lruSize({} as any)).toThrow();
    expect(() => L.lruGet(null as any, "x")).toThrow();
    expect(() => L.lruPut(undefined as any, "x", 1)).toThrow();
    expect(() => L.lruClear("not a cache" as any)).toThrow();
  });

  it("evicted entries are actually removed", () => {
    const c = L.lruNew(2);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    L.lruPut(c, "c", 3);  // evicts a
    expect(L.lruContains(c, "a")).toBe(false);
    expect(L.lruPeek(c, "a")).toBeUndefined();
  });

  it("re-inserting an evicted key is treated as a new entry", () => {
    const c = L.lruNew(2);
    L.lruPut(c, "a", 1);
    L.lruPut(c, "b", 2);
    L.lruPut(c, "c", 3);  // evicts a
    expect(L.lruContains(c, "a")).toBe(false);
    // Re-insert "a" — cache is full (b, c), so this evicts "b".
    const evictedOnReinsert = L.lruPut(c, "a", 10);
    expect(evictedOnReinsert).toEqual(["b", 2]);
    expect(L.lruGet(c, "a")).toBe(10);
    // Now the cache is {c, a}; next put evicts c.
    const evicted = L.lruPut(c, "d", 4);
    expect(evicted).toEqual(["c", 3]);
  });
});
