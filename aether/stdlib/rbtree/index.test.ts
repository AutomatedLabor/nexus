import { describe, it, expect } from "vitest";
import * as T from "./index";

describe("rbtree module", () => {
  it("rbNew: creates empty tree", () => {
    const t = T.rbNew();
    expect(T.rbSize(t)).toBe(0);
    expect(T.rbMin(t)).toBe(undefined);
    expect(T.rbMax(t)).toBe(undefined);
    expect(T.rbInOrder(t)).toEqual([]);
  });

  it("rbNew: with custom comparator (descending)", () => {
    const t = T.rbNew<number, number>((a, b) => b - a);
    T.rbInsert(t, 1, "a");
    T.rbInsert(t, 2, "b");
    T.rbInsert(t, 3, "c");
    // With descending cmp, the "min" (per cmp) is the largest number.
    expect(T.rbMin(t)).toBe(3);
    expect(T.rbMax(t)).toBe(1);
  });

  it("rbInsert: returns true for new keys", () => {
    const t = T.rbNew<number, string>();
    expect(T.rbInsert(t, 1, "one")).toBe(true);
    expect(T.rbInsert(t, 2, "two")).toBe(true);
    expect(T.rbInsert(t, 3, "three")).toBe(true);
    expect(T.rbSize(t)).toBe(3);
  });

  it("rbInsert: returns false when updating existing key", () => {
    const t = T.rbNew<number, string>();
    T.rbInsert(t, 1, "one");
    expect(T.rbInsert(t, 1, "ONE")).toBe(false);
    expect(T.rbSize(t)).toBe(1);
    expect(T.rbSearch(t, 1)).toBe("ONE");
  });

  it("rbInsert: preserves sorted order regardless of insertion order", () => {
    const t = T.rbNew<number, number>();
    // Insert in random order.
    const keys = [5, 2, 8, 1, 3, 7, 9, 4, 6, 0];
    for (const k of keys) T.rbInsert(t, k, k * k);
    const inOrder = T.rbInOrder(t).map(([k, _v]) => k);
    expect(inOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("rbInsert: ascending inserts maintain order", () => {
    const t = T.rbNew<number, number>();
    for (let i = 0; i < 100; i++) T.rbInsert(t, i, i);
    const inOrder = T.rbInOrder(t).map(([k, _v]) => k);
    expect(inOrder).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });

  it("rbInsert: descending inserts maintain order", () => {
    const t = T.rbNew<number, number>();
    for (let i = 99; i >= 0; i--) T.rbInsert(t, i, i);
    const inOrder = T.rbInOrder(t).map(([k, _v]) => k);
    expect(inOrder).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });

  it("rbSearch: returns value for present key", () => {
    const t = T.rbNew<string, number>();
    T.rbInsert(t, "apple", 1);
    T.rbInsert(t, "banana", 2);
    T.rbInsert(t, "cherry", 3);
    expect(T.rbSearch(t, "apple")).toBe(1);
    expect(T.rbSearch(t, "banana")).toBe(2);
    expect(T.rbSearch(t, "cherry")).toBe(3);
  });

  it("rbSearch: returns undefined for missing key", () => {
    const t = T.rbNew<number, string>();
    T.rbInsert(t, 1, "a");
    T.rbInsert(t, 2, "b");
    expect(T.rbSearch(t, 3)).toBe(undefined);
    expect(T.rbSearch(t, 0)).toBe(undefined);
  });

  it("rbMin / rbMax: extremes of the tree", () => {
    const t = T.rbNew<number, number>();
    T.rbInsert(t, 5, 0);
    T.rbInsert(t, 3, 0);
    T.rbInsert(t, 8, 0);
    T.rbInsert(t, 1, 0);
    T.rbInsert(t, 9, 0);
    expect(T.rbMin(t)).toBe(1);
    expect(T.rbMax(t)).toBe(9);
  });

  it("rbMin / rbMax: undefined on empty tree", () => {
    const t = T.rbNew<number, number>();
    expect(T.rbMin(t)).toBe(undefined);
    expect(T.rbMax(t)).toBe(undefined);
  });

  it("rbSuccessor: next-larger key", () => {
    const t = T.rbNew<number, number>();
    for (const k of [10, 5, 15, 3, 7, 12, 20]) T.rbInsert(t, k, 0);
    expect(T.rbSuccessor(t, 5)).toBe(7);
    expect(T.rbSuccessor(t, 7)).toBe(10);
    expect(T.rbSuccessor(t, 10)).toBe(12);
    expect(T.rbSuccessor(t, 12)).toBe(15);
    expect(T.rbSuccessor(t, 15)).toBe(20);
  });

  it("rbSuccessor: undefined for max key or missing key", () => {
    const t = T.rbNew<number, number>();
    for (const k of [10, 5, 15, 3, 7, 12, 20]) T.rbInsert(t, k, 0);
    expect(T.rbSuccessor(t, 20)).toBe(undefined);
    expect(T.rbSuccessor(t, 99)).toBe(undefined);
  });

  it("rbPredecessor: next-smaller key", () => {
    const t = T.rbNew<number, number>();
    for (const k of [10, 5, 15, 3, 7, 12, 20]) T.rbInsert(t, k, 0);
    expect(T.rbPredecessor(t, 5)).toBe(3);
    expect(T.rbPredecessor(t, 10)).toBe(7);
    expect(T.rbPredecessor(t, 15)).toBe(12);
    expect(T.rbPredecessor(t, 20)).toBe(15);
  });

  it("rbPredecessor: undefined for min key or missing key", () => {
    const t = T.rbNew<number, number>();
    for (const k of [10, 5, 15, 3, 7, 12, 20]) T.rbInsert(t, k, 0);
    expect(T.rbPredecessor(t, 3)).toBe(undefined);
    expect(T.rbPredecessor(t, -1)).toBe(undefined);
  });

  it("rbDelete: returns true when removing present key", () => {
    const t = T.rbNew<number, number>();
    T.rbInsert(t, 1, 1);
    T.rbInsert(t, 2, 2);
    T.rbInsert(t, 3, 3);
    expect(T.rbDelete(t, 2)).toBe(true);
    expect(T.rbSize(t)).toBe(2);
    expect(T.rbSearch(t, 2)).toBe(undefined);
  });

  it("rbDelete: returns false for missing key", () => {
    const t = T.rbNew<number, number>();
    T.rbInsert(t, 1, 1);
    expect(T.rbDelete(t, 99)).toBe(false);
    expect(T.rbSize(t)).toBe(1);
  });

  it("rbDelete: maintains sorted order after each deletion", () => {
    const t = T.rbNew<number, number>();
    for (let i = 0; i < 20; i++) T.rbInsert(t, i, i);
    // Delete every other element.
    for (let i = 0; i < 20; i += 2) expect(T.rbDelete(t, i)).toBe(true);
    expect(T.rbSize(t)).toBe(10);
    const inOrder = T.rbInOrder(t).map(([k, _v]) => k);
    expect(inOrder).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  });

  it("rbDelete: deleting all elements leaves empty tree", () => {
    const t = T.rbNew<number, number>();
    for (let i = 0; i < 50; i++) T.rbInsert(t, i, i);
    for (let i = 0; i < 50; i++) expect(T.rbDelete(t, i)).toBe(true);
    expect(T.rbSize(t)).toBe(0);
    expect(T.rbInOrder(t)).toEqual([]);
  });

  it("rbDelete: deleting the root keeps tree valid", () => {
    const t = T.rbNew<number, number>();
    for (let i = 0; i < 30; i++) T.rbInsert(t, i, i);
    // The root depends on insertion order; we don't check which key
    // is at the root, but deleting arbitrary elements should keep
    // order intact.
    T.rbDelete(t, 15);
    const inOrder = T.rbInOrder(t).map(([k, _v]) => k);
    expect(inOrder.length).toBe(29);
    expect(inOrder.includes(15)).toBe(false);
    for (let i = 1; i < inOrder.length; i++) {
      expect(inOrder[i]).toBeGreaterThan(inOrder[i - 1]);
    }
  });

  it("rbInOrder: snapshot stays sorted regardless of insert order", () => {
    const t = T.rbNew<number, string>();
    const shuffled = [7, 2, 9, 1, 5, 8, 3, 6, 4, 0];
    for (const k of shuffled) T.rbInsert(t, k, "v" + str(k));
    const out = T.rbInOrder(t).map(([k, _v]) => k);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("rbInOrder: returns fresh array (no aliasing with tree state)", () => {
    const t = T.rbNew<number, number>();
    T.rbInsert(t, 1, 1);
    T.rbInsert(t, 2, 2);
    const a = T.rbInOrder(t);
    const b = T.rbInOrder(t);
    expect(a).toEqual([[1, 1], [2, 2]]);
    expect(b).toEqual([[1, 1], [2, 2]]);
    expect(a).not.toBe(b);
    a.push([99, 99]);
    expect(T.rbInOrder(t).length).toBe(2);
  });

  it("rbSize: tracks count through insert and delete", () => {
    const t = T.rbNew<number, number>();
    expect(T.rbSize(t)).toBe(0);
    T.rbInsert(t, 1, 0);
    T.rbInsert(t, 2, 0);
    expect(T.rbSize(t)).toBe(2);
    T.rbDelete(t, 1);
    expect(T.rbSize(t)).toBe(1);
    T.rbDelete(t, 2);
    expect(T.rbSize(t)).toBe(0);
  });

  it("stress: 1000 random keys, then check order", () => {
    const t = T.rbNew<number, number>();
    const keys: number[] = [];
    // Use a deterministic pseudo-random sequence.
    let state = 12345;
    for (let i = 0; i < 1000; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      const k = state % 5000;
      if (T.rbInsert(t, k, i)) keys.push(k);
    }
    expect(T.rbSize(t)).toBe(keys.length);
    const inOrder = T.rbInOrder(t).map(([k, _v]) => k);
    keys.sort((a, b) => a - b);
    expect(inOrder).toEqual(keys);
  });

  it("validates types: rbInsert on non-tree", () => {
    expect(() => T.rbInsert(null as any, 1, 1)).toThrow();
    expect(() => T.rbInsert({} as any, 1, 1)).toThrow();
  });

  it("validates types: rbDelete on non-tree", () => {
    expect(() => T.rbDelete(null as any, 1)).toThrow();
    expect(() => T.rbDelete({} as any, 1)).toThrow();
  });

  it("validates types: rbSearch / rbMin / rbMax / rbInOrder / rbSize", () => {
    expect(() => T.rbSearch(null as any, 1)).toThrow();
    expect(() => T.rbMin(null as any)).toThrow();
    expect(() => T.rbMax(null as any)).toThrow();
    expect(() => T.rbInOrder(null as any)).toThrow();
    expect(() => T.rbSize(null as any)).toThrow();
  });

  it("validates types: rbSuccessor / rbPredecessor", () => {
    expect(() => T.rbSuccessor(null as any, 1)).toThrow();
    expect(() => T.rbPredecessor(null as any, 1)).toThrow();
  });

  it("works with string keys (lexicographic)", () => {
    const t = T.rbNew<string, number>();
    T.rbInsert(t, "zebra", 1);
    T.rbInsert(t, "apple", 2);
    T.rbInsert(t, "mango", 3);
    T.rbInsert(t, "banana", 4);
    expect(T.rbMin(t)).toBe("apple");
    expect(T.rbMax(t)).toBe("zebra");
    expect(T.rbInOrder(t).map(([k, _v]) => k)).toEqual(["apple", "banana", "mango", "zebra"]);
  });
});

// Tiny str helper to keep TS happy in template strings above.
function str(n: number): string {
  return String(n);
}
