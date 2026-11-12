import { describe, it, expect } from "vitest";
import * as B from "./index";

describe("bimap module", () => {
  it("bimapNew: creates empty bimap", () => {
    const m = B.bimapNew();
    expect(B.bimapSize(m)).toBe(0);
    expect(B.bimapKeys(m)).toEqual([]);
    expect(B.bimapValues(m)).toEqual([]);
  });

  it("bimapSet: adds a pair", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    expect(B.bimapSize(m)).toBe(1);
    expect(B.bimapGet(m, "a")).toBe(1);
    expect(B.bimapGetReverse(m, 1)).toBe("a");
  });

  it("bimapSet: chainable", () => {
    const m = B.bimapNew();
    expect(B.bimapSet(m, "a", 1)).toBe(m);
  });

  it("bimapSet: multiple pairs", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    B.bimapSet(m, "b", 2);
    B.bimapSet(m, "c", 3);
    expect(B.bimapSize(m)).toBe(3);
    expect(B.bimapGet(m, "a")).toBe(1);
    expect(B.bimapGet(m, "b")).toBe(2);
    expect(B.bimapGet(m, "c")).toBe(3);
    expect(B.bimapGetReverse(m, 1)).toBe("a");
    expect(B.bimapGetReverse(m, 2)).toBe("b");
    expect(B.bimapGetReverse(m, 3)).toBe("c");
  });

  it("bimapSet: updates existing key with new value (one-to-one invariant)", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    B.bimapSet(m, "a", 2);
    expect(B.bimapSize(m)).toBe(1);
    expect(B.bimapGet(m, "a")).toBe(2);
    expect(B.bimapGetReverse(m, 1)).toBeUndefined();
    expect(B.bimapGetReverse(m, 2)).toBe("a");
  });

  it("bimapSet: reusing a value evicts its old key (one-to-one invariant)", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    B.bimapSet(m, "b", 1);   // value 1 was already mapped by "a"
    expect(B.bimapSize(m)).toBe(1);
    expect(B.bimapGet(m, "a")).toBeUndefined();   // "a" was evicted
    expect(B.bimapGet(m, "b")).toBe(1);
    expect(B.bimapGetReverse(m, 1)).toBe("b");
  });

  it("bimapSet: setting (k, v) where both already exist as separate pairs merges correctly", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    B.bimapSet(m, "b", 2);
    // Now setting ("a", 2) should evict "a"'s old value (1) and "b"'s old pair.
    B.bimapSet(m, "a", 2);
    expect(B.bimapSize(m)).toBe(1);
    expect(B.bimapGet(m, "a")).toBe(2);
    expect(B.bimapGetReverse(m, 2)).toBe("a");
    expect(B.bimapGet(m, "b")).toBeUndefined();
    expect(B.bimapGetReverse(m, 1)).toBeUndefined();
  });

  it("bimapGet: returns undefined for missing key", () => {
    const m = B.bimapNew();
    expect(B.bimapGet(m, "x")).toBeUndefined();
    B.bimapSet(m, "a", 1);
    expect(B.bimapGet(m, "x")).toBeUndefined();
  });

  it("bimapGetReverse: returns undefined for missing value", () => {
    const m = B.bimapNew();
    expect(B.bimapGetReverse(m, 99)).toBeUndefined();
    B.bimapSet(m, "a", 1);
    expect(B.bimapGetReverse(m, 99)).toBeUndefined();
  });

  it("bimapHas: true for present, false for absent", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    expect(B.bimapHas(m, "a")).toBe(true);
    expect(B.bimapHas(m, "b")).toBe(false);
  });

  it("bimapHasReverse: true for present, false for absent", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    expect(B.bimapHasReverse(m, 1)).toBe(true);
    expect(B.bimapHasReverse(m, 2)).toBe(false);
  });

  it("bimapDelete: removes a pair by key", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    expect(B.bimapDelete(m, "a")).toBe(true);
    expect(B.bimapSize(m)).toBe(0);
    expect(B.bimapGet(m, "a")).toBeUndefined();
    expect(B.bimapGetReverse(m, 1)).toBeUndefined();
  });

  it("bimapDelete: returns false for missing key", () => {
    const m = B.bimapNew();
    expect(B.bimapDelete(m, "x")).toBe(false);
    B.bimapSet(m, "a", 1);
    expect(B.bimapDelete(m, "x")).toBe(false);
    expect(B.bimapSize(m)).toBe(1);
  });

  it("bimapDeleteReverse: removes a pair by value", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    expect(B.bimapDeleteReverse(m, 1)).toBe(true);
    expect(B.bimapSize(m)).toBe(0);
    expect(B.bimapGet(m, "a")).toBeUndefined();
    expect(B.bimapGetReverse(m, 1)).toBeUndefined();
  });

  it("bimapDeleteReverse: returns false for missing value", () => {
    const m = B.bimapNew();
    expect(B.bimapDeleteReverse(m, 99)).toBe(false);
    B.bimapSet(m, "a", 1);
    expect(B.bimapDeleteReverse(m, 99)).toBe(false);
    expect(B.bimapSize(m)).toBe(1);
  });

  it("bimapSize: tracks insertion and deletion", () => {
    const m = B.bimapNew();
    expect(B.bimapSize(m)).toBe(0);
    B.bimapSet(m, "a", 1);
    B.bimapSet(m, "b", 2);
    expect(B.bimapSize(m)).toBe(2);
    B.bimapDelete(m, "a");
    expect(B.bimapSize(m)).toBe(1);
    B.bimapSet(m, "b", 3);  // updates existing key, size unchanged
    expect(B.bimapSize(m)).toBe(1);
    B.bimapSet(m, "c", 3);  // value 3 already taken by "b" — evicts "b"
    expect(B.bimapSize(m)).toBe(1);
  });

  it("bimapKeys: returns all keys in insertion order", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    B.bimapSet(m, "b", 2);
    B.bimapSet(m, "c", 3);
    expect(B.bimapKeys(m)).toEqual(["a", "b", "c"]);
  });

  it("bimapValues: returns all values in key insertion order", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    B.bimapSet(m, "b", 2);
    B.bimapSet(m, "c", 3);
    expect(B.bimapValues(m)).toEqual([1, 2, 3]);
  });

  it("bimapKeys: empty for empty bimap", () => {
    const m = B.bimapNew();
    expect(B.bimapKeys(m)).toEqual([]);
  });

  it("bimapValues: empty for empty bimap", () => {
    const m = B.bimapNew();
    expect(B.bimapValues(m)).toEqual([]);
  });

  it("bimap: works with string keys and string values", () => {
    const m = B.bimapNew<string, string>();
    B.bimapSet(m, "alice", "alice@example.com");
    B.bimapSet(m, "bob", "bob@example.com");
    expect(B.bimapGet(m, "alice")).toBe("alice@example.com");
    expect(B.bimapGetReverse(m, "bob@example.com")).toBe("bob");
  });

  it("bimap: works with number keys and string values", () => {
    const m = B.bimapNew<number, string>();
    B.bimapSet(m, 100, "continue");
    B.bimapSet(m, 404, "not found");
    B.bimapSet(m, 500, "server error");
    expect(B.bimapGet(m, 404)).toBe("not found");
    expect(B.bimapGetReverse(m, "continue")).toBe(100);
    expect(B.bimapSize(m)).toBe(3);
  });

  it("bimapSet: validates types", () => {
    expect(() => B.bimapSet(null as any, "a", 1)).toThrow();
    expect(() => B.bimapSet({} as any, "a", 1)).toThrow();
  });

  it("bimapGet: validates types", () => {
    expect(() => B.bimapGet(null as any, "a")).toThrow();
    expect(() => B.bimapGet({} as any, "a")).toThrow();
  });

  it("bimapDelete: validates types", () => {
    expect(() => B.bimapDelete(null as any, "a")).toThrow();
    expect(() => B.bimapDelete({} as any, "a")).toThrow();
  });

  it("bimapSize: validates types", () => {
    expect(() => B.bimapSize(null as any)).toThrow();
    expect(() => B.bimapSize({} as any)).toThrow();
  });

  it("bimapSet: null/undefined values are handled carefully", () => {
    const m = B.bimapNew();
    // Setting a value of `undefined` is treated as "no value" by the
    // Map.get-or-undefined convention; we use 0 / "" as edge values.
    B.bimapSet(m, "k", 0);
    expect(B.bimapGet(m, "k")).toBe(0);
    expect(B.bimapHas(m, "k")).toBe(true);
    expect(B.bimapGetReverse(m, 0)).toBe("k");
  });

  it("bimap: maintains one-to-one invariant after a chain of updates", () => {
    const m = B.bimapNew();
    B.bimapSet(m, "a", 1);
    B.bimapSet(m, "b", 2);
    B.bimapSet(m, "c", 3);
    // Move value 1 from "a" to "x".
    B.bimapSet(m, "x", 1);
    expect(B.bimapSize(m)).toBe(3);
    expect(B.bimapGet(m, "a")).toBeUndefined();
    expect(B.bimapGet(m, "x")).toBe(1);
    expect(B.bimapGetReverse(m, 1)).toBe("x");
    // Confirm we can still see "b" -> 2 and "c" -> 3.
    expect(B.bimapGet(m, "b")).toBe(2);
    expect(B.bimapGet(m, "c")).toBe(3);
  });
});
