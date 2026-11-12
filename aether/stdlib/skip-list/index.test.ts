import { describe, it, expect } from "vitest";
import * as S from "./index";

describe("skip-list module", () => {
  it("slNew: creates empty list", () => {
    const sl = S.slNew<number, string>();
    expect(S.slSize(sl)).toBe(0);
    expect(S.slToSortedArray(sl)).toEqual([]);
  });

  it("slNew: with custom comparator", () => {
    // Reverse-comparator: largest first.
    const cmp = (a: number, b: number) => b - a;
    const sl = S.slNew<number, string>(cmp);
    S.slInsert(sl, 1, "a");
    S.slInsert(sl, 2, "b");
    S.slInsert(sl, 3, "c");
    expect(S.slToSortedArray(sl)).toEqual([3, 2, 1]);
  });

  it("slInsert: adds new key", () => {
    const sl = S.slNew<number, string>();
    expect(S.slInsert(sl, 1, "a")).toBe(true);
    expect(S.slSize(sl)).toBe(1);
  });

  it("slInsert: updates existing key", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 1, "a");
    expect(S.slInsert(sl, 1, "b")).toBe(false);  // updated, not inserted
    expect(S.slSize(sl)).toBe(1);
    expect(S.slSearch(sl, 1)).toBe("b");
  });

  it("slInsert: maintains sorted order", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 3, "c");
    S.slInsert(sl, 1, "a");
    S.slInsert(sl, 2, "b");
    S.slInsert(sl, 5, "e");
    S.slInsert(sl, 4, "d");
    expect(S.slToSortedArray(sl)).toEqual([1, 2, 3, 4, 5]);
  });

  it("slSearch: returns value for present key", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 1, "one");
    S.slInsert(sl, 2, "two");
    expect(S.slSearch(sl, 1)).toBe("one");
    expect(S.slSearch(sl, 2)).toBe("two");
  });

  it("slSearch: returns undefined for absent key", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 1, "a");
    expect(S.slSearch(sl, 99)).toBeUndefined();
    expect(S.slSearch(sl, -1)).toBeUndefined();
  });

  it("slSearch: empty list returns undefined", () => {
    const sl = S.slNew<number, string>();
    expect(S.slSearch(sl, 1)).toBeUndefined();
  });

  it("slContains: true/false", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 1, "a");
    expect(S.slContains(sl, 1)).toBe(true);
    expect(S.slContains(sl, 99)).toBe(false);
  });

  it("slDelete: removes a key", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 1, "a");
    S.slInsert(sl, 2, "b");
    expect(S.slDelete(sl, 1)).toBe(true);
    expect(S.slSize(sl)).toBe(1);
    expect(S.slContains(sl, 1)).toBe(false);
    expect(S.slContains(sl, 2)).toBe(true);
  });

  it("slDelete: returns false for absent key", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 1, "a");
    expect(S.slDelete(sl, 99)).toBe(false);
    expect(S.slSize(sl)).toBe(1);
  });

  it("slDelete: maintains sorted order", () => {
    const sl = S.slNew<number, string>();
    for (let i = 1; i <= 10; i++) S.slInsert(sl, i, "v" + i);
    S.slDelete(sl, 5);
    S.slDelete(sl, 1);
    S.slDelete(sl, 10);
    expect(S.slToSortedArray(sl)).toEqual([2, 3, 4, 6, 7, 8, 9]);
  });

  it("slMin: smallest key", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 5, "e");
    S.slInsert(sl, 1, "a");
    S.slInsert(sl, 3, "c");
    expect(S.slMin(sl)).toBe(1);
  });

  it("slMin: undefined for empty", () => {
    expect(S.slMin(S.slNew<number, string>())).toBeUndefined();
  });

  it("slMax: largest key", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 5, "e");
    S.slInsert(sl, 1, "a");
    S.slInsert(sl, 3, "c");
    expect(S.slMax(sl)).toBe(5);
  });

  it("slMax: undefined for empty", () => {
    expect(S.slMax(S.slNew<number, string>())).toBeUndefined();
  });

  it("slSize: counts elements", () => {
    const sl = S.slNew<number, string>();
    for (let i = 0; i < 100; i++) S.slInsert(sl, i, "v" + i);
    expect(S.slSize(sl)).toBe(100);
  });

  it("slToSortedArray: returns sorted keys", () => {
    const sl = S.slNew<number, string>();
    [5, 1, 3, 2, 4].forEach((k) => S.slInsert(sl, k, "v" + k));
    expect(S.slToSortedArray(sl)).toEqual([1, 2, 3, 4, 5]);
  });

  it("slToSortedArray: empty for empty list", () => {
    expect(S.slToSortedArray(S.slNew<number, string>())).toEqual([]);
  });

  it("slHeight: starts at 1 for empty list", () => {
    const sl = S.slNew<number, string>();
    expect(S.slHeight(sl)).toBe(1);
  });

  it("slHeight: grows with insertions", () => {
    const sl = S.slNew<number, string>();
    for (let i = 0; i < 1000; i++) S.slInsert(sl, i, "v" + i);
    // With 1000 elements, the height should be at least a few.
    expect(S.slHeight(sl)).toBeGreaterThanOrEqual(2);
    expect(S.slHeight(sl)).toBeLessThanOrEqual(32);
  });

  it("slHeight: shrinks after deletes (or stays the same)", () => {
    const sl = S.slNew<number, string>();
    for (let i = 0; i < 1000; i++) S.slInsert(sl, i, "v" + i);
    const h1 = S.slHeight(sl);
    for (let i = 0; i < 1000; i++) S.slDelete(sl, i);
    // After deleting all, height should be back to 1.
    expect(S.slHeight(sl)).toBe(1);
    expect(S.slSize(sl)).toBe(0);
  });

  it("many inserts and searches work", () => {
    const sl = S.slNew<number, string>();
    const N = 5000;
    for (let i = 0; i < N; i++) S.slInsert(sl, i * 2, "v" + i);  // even keys
    // All even keys should be present.
    for (let i = 0; i < N; i++) {
      expect(S.slSearch(sl, i * 2)).toBe("v" + i);
    }
    // Odd keys should be absent.
    for (let i = 0; i < N; i++) {
      expect(S.slSearch(sl, i * 2 + 1)).toBeUndefined();
    }
    expect(S.slSize(sl)).toBe(N);
  });

  it("string keys work with default comparator", () => {
    const sl = S.slNew<string, number>();
    S.slInsert(sl, "banana", 2);
    S.slInsert(sl, "apple", 1);
    S.slInsert(sl, "cherry", 3);
    expect(S.slToSortedArray(sl)).toEqual(["apple", "banana", "cherry"]);
    expect(S.slSearch(sl, "banana")).toBe(2);
  });

  it("insert-delete-insert cycle works", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 1, "a");
    expect(S.slDelete(sl, 1)).toBe(true);
    expect(S.slContains(sl, 1)).toBe(false);
    expect(S.slInsert(sl, 1, "a")).toBe(true);  // re-inserted
    expect(S.slContains(sl, 1)).toBe(true);
  });

  it("non-SkipList argument panics", () => {
    expect(() => S.slSize({} as any)).toThrow();
    expect(() => S.slSearch(null as any, 1)).toThrow();
    expect(() => S.slInsert(undefined as any, 1, "x")).toThrow();
  });

  it("a key's value can be updated multiple times", () => {
    const sl = S.slNew<number, string>();
    S.slInsert(sl, 1, "a");
    expect(S.slInsert(sl, 1, "b")).toBe(false);
    expect(S.slInsert(sl, 1, "c")).toBe(false);
    expect(S.slInsert(sl, 1, "d")).toBe(false);
    expect(S.slSearch(sl, 1)).toBe("d");
    expect(S.slSize(sl)).toBe(1);
  });
});
