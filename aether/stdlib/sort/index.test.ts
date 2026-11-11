import { describe, it, expect } from "vitest";
import * as S from "./index";

const unsorted = [5, 1, 9, 3, 7, 2, 8, 4, 6];
const sortedAsc = [1, 2, 3, 4, 5, 6, 7, 8, 9];

describe("sort module", () => {
  it("sortBubble: ascending default", () => {
    expect(S.sortBubble(unsorted)).toEqual(sortedAsc);
  });
  it("sortBubble: empty", () => {
    expect(S.sortBubble([])).toEqual([]);
  });
  it("sortBubble: single element", () => {
    expect(S.sortBubble([42])).toEqual([42]);
  });
  it("sortBubble: already sorted", () => {
    expect(S.sortBubble([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it("sortBubble: reverse sorted", () => {
    expect(S.sortBubble([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]);
  });

  it("sortInsertion: ascending default", () => {
    expect(S.sortInsertion(unsorted)).toEqual(sortedAsc);
  });
  it("sortInsertion: empty", () => {
    expect(S.sortInsertion([])).toEqual([]);
  });
  it("sortInsertion: already sorted", () => {
    expect(S.sortInsertion([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it("sortInsertion: with descending cmp", () => {
    expect(S.sortInsertion([1, 3, 2], (a, b) => b - a)).toEqual([3, 2, 1]);
  });

  it("sortSelection: ascending default", () => {
    expect(S.sortSelection(unsorted)).toEqual(sortedAsc);
  });
  it("sortSelection: empty", () => {
    expect(S.sortSelection([])).toEqual([]);
  });
  it("sortSelection: with custom cmp", () => {
    expect(S.sortSelection([3, 1, 2], (a, b) => b - a)).toEqual([3, 2, 1]);
  });

  it("sortMerge: ascending default", () => {
    expect(S.sortMerge(unsorted)).toEqual(sortedAsc);
  });
  it("sortMerge: empty", () => {
    expect(S.sortMerge([])).toEqual([]);
  });
  it("sortMerge: single", () => {
    expect(S.sortMerge([42])).toEqual([42]);
  });
  it("sortMerge: stable — preserves order of equal keys", () => {
    const arr = [{ k: 1, v: "a" }, { k: 1, v: "b" }, { k: 0, v: "c" }];
    const out = S.sortMerge(arr, (a, b) => a.k - b.k);
    expect(out.map((x) => x.v)).toEqual(["c", "a", "b"]);
  });
  it("sortMerge: long array", () => {
    const big: number[] = [];
    for (let i = 0; i < 1000; i++) big.push((i * 37) % 1000);
    const out = S.sortMerge(big);
    expect(S.isSorted(out)).toBe(true);
  });

  it("sortQuick: ascending default", () => {
    expect(S.sortQuick(unsorted)).toEqual(sortedAsc);
  });
  it("sortQuick: empty", () => {
    expect(S.sortQuick([])).toEqual([]);
  });
  it("sortQuick: already sorted (worst case for naive quick)", () => {
    const big = Array.from({ length: 500 }, (_, i) => i);
    const out = S.sortQuick(big);
    expect(S.isSorted(out)).toBe(true);
  });
  it("sortQuick: with descending cmp", () => {
    expect(S.sortQuick([1, 2, 3], (a, b) => b - a)).toEqual([3, 2, 1]);
  });

  it("sortHeap: ascending default", () => {
    expect(S.sortHeap(unsorted)).toEqual(sortedAsc);
  });
  it("sortHeap: empty", () => {
    expect(S.sortHeap([])).toEqual([]);
  });
  it("sortHeap: with descending cmp", () => {
    expect(S.sortHeap([1, 2, 3], (a, b) => b - a)).toEqual([3, 2, 1]);
  });

  it("sortShell: ascending default", () => {
    expect(S.sortShell(unsorted)).toEqual(sortedAsc);
  });
  it("sortShell: empty", () => {
    expect(S.sortShell([])).toEqual([]);
  });

  it("sortCocktail: ascending default", () => {
    expect(S.sortCocktail(unsorted)).toEqual(sortedAsc);
  });
  it("sortCocktail: empty", () => {
    expect(S.sortCocktail([])).toEqual([]);
  });

  it("sortComb: ascending default", () => {
    expect(S.sortComb(unsorted)).toEqual(sortedAsc);
  });
  it("sortComb: empty", () => {
    expect(S.sortComb([])).toEqual([]);
  });

  it("sortGnome: ascending default", () => {
    expect(S.sortGnome(unsorted)).toEqual(sortedAsc);
  });
  it("sortGnome: empty", () => {
    expect(S.sortGnome([])).toEqual([]);
  });

  it("sortStable: alias of sortMerge", () => {
    expect(S.sortStable(unsorted)).toEqual(sortedAsc);
  });

  it("sortCounting: basic", () => {
    expect(S.sortCounting([3, 1, 4, 1, 5, 9, 2, 6], 9)).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
  });
  it("sortCounting: empty", () => {
    expect(S.sortCounting([], 0)).toEqual([]);
  });
  it("sortCounting: panic on out-of-range", () => {
    expect(() => S.sortCounting([5], 3)).toThrow();
  });

  it("sortRadix: non-negative ints", () => {
    expect(S.sortRadix([170, 45, 75, 90, 802, 24, 2, 66]))
      .toEqual([2, 24, 45, 66, 75, 90, 170, 802]);
  });
  it("sortRadix: empty", () => {
    expect(S.sortRadix([])).toEqual([]);
  });
  it("sortRadix: panic on negative", () => {
    expect(() => S.sortRadix([-1])).toThrow();
  });

  it("sortBucket: basic", () => {
    expect(S.sortBucket([0.9, 0.1, 0.5, 0.3, 0.7, 0.2], 3))
      .toEqual([0.1, 0.2, 0.3, 0.5, 0.7, 0.9]);
  });
  it("sortBucket: empty", () => {
    expect(S.sortBucket([], 3)).toEqual([]);
  });
  it("sortBucket: single element", () => {
    expect(S.sortBucket([42], 3)).toEqual([42]);
  });

  it("isSorted: true on ascending", () => {
    expect(S.isSorted([1, 2, 3, 4])).toBe(true);
  });
  it("isSorted: false on unsorted", () => {
    expect(S.isSorted([2, 1, 3])).toBe(false);
  });
  it("isSorted: empty array is sorted", () => {
    expect(S.isSorted([])).toBe(true);
  });
  it("isSorted: single element is sorted", () => {
    expect(S.isSorted([42])).toBe(true);
  });
  it("isSorted: with custom cmp (descending)", () => {
    expect(S.isSorted([4, 3, 2, 1], (a, b) => b - a)).toBe(true);
  });
});
