import { describe, it, expect } from "vitest";
import * as H from "./index";

describe("heap module", () => {
  it("heapNew: defaults to min-heap", () => {
    const h = H.heapNew();
    expect(H.heapSize(h)).toBe(0);
    expect(H.heapIsEmpty(h)).toBe(true);
  });

  it("heapPush + heapPeek: min at top", () => {
    const h = H.heapNew<number>();
    H.heapPush(h, 5);
    H.heapPush(h, 2);
    H.heapPush(h, 8);
    H.heapPush(h, 1);
    expect(H.heapPeek(h)).toBe(1);
  });

  it("heapPop: removes in priority order (min-heap)", () => {
    const h = H.heapNew<number>();
    H.heapPush(h, 5);
    H.heapPush(h, 2);
    H.heapPush(h, 8);
    H.heapPush(h, 1);
    expect(H.heapPop(h)).toBe(1);
    expect(H.heapPop(h)).toBe(2);
    expect(H.heapPop(h)).toBe(5);
    expect(H.heapPop(h)).toBe(8);
  });

  it("heapPop: panics on empty heap", () => {
    const h = H.heapNew();
    expect(() => H.heapPop(h)).toThrow();
  });

  it("heapPeek: panics on empty heap", () => {
    const h = H.heapNew();
    expect(() => H.heapPeek(h)).toThrow();
  });

  it("max-heap via custom cmp", () => {
    const h = H.heapNew<number>((a, b) => a > b);
    H.heapPush(h, 3);
    H.heapPush(h, 9);
    H.heapPush(h, 1);
    expect(H.heapPop(h)).toBe(9);
    expect(H.heapPop(h)).toBe(3);
    expect(H.heapPop(h)).toBe(1);
  });

  it("heapSize / heapIsEmpty after operations", () => {
    const h = H.heapNew<number>();
    expect(H.heapIsEmpty(h)).toBe(true);
    H.heapPush(h, 1);
    expect(H.heapIsEmpty(h)).toBe(false);
    expect(H.heapSize(h)).toBe(1);
    H.heapPop(h);
    expect(H.heapIsEmpty(h)).toBe(true);
  });

  it("heapify: builds heap from unsorted array", () => {
    const h = H.heapify([5, 1, 9, 3, 7]);
    expect(H.heapPeek(h)).toBe(1);
  });

  it("heapSort: ascending order (min-heap default)", () => {
    const sorted = H.heapSort([5, 1, 9, 3, 7, 2, 8]);
    expect(sorted).toEqual([1, 2, 3, 5, 7, 8, 9]);
  });

  it("heapSort: descending with custom cmp", () => {
    const sorted = H.heapSort([5, 1, 9, 3], (a, b) => a > b);
    expect(sorted).toEqual([9, 5, 3, 1]);
  });

  it("heapSort: empty array", () => {
    expect(H.heapSort([])).toEqual([]);
  });

  it("heapSort: single element", () => {
    expect(H.heapSort([42])).toEqual([42]);
  });

  it("heapFromArray: equivalent to heapify", () => {
    const h = H.heapFromArray([5, 1, 9, 3]);
    expect(H.heapPeek(h)).toBe(1);
  });

  it("heapReplace: pops top and pushes v in one step", () => {
    const h = H.heapNew<number>();
    H.heapPush(h, 1);
    H.heapPush(h, 3);
    const old = H.heapReplace(h, 5);
    expect(old).toBe(1);
    expect(H.heapPeek(h)).toBe(3);
  });

  it("heapReplace: panics on empty heap", () => {
    const h = H.heapNew();
    expect(() => H.heapReplace(h, 1)).toThrow();
  });

  it("heapMerge: combines two heaps", () => {
    const a = H.heapFromArray([5, 1, 9]);
    const b = H.heapFromArray([3, 7, 2]);
    const m = H.heapMerge(a, b);
    expect(H.heapSize(m)).toBe(6);
    expect(H.heapToSortedArray(m)).toEqual([1, 2, 3, 5, 7, 9]);
  });

  it("heapUpdateKey: lifts a smaller value", () => {
    const h = H.heapFromArray([5, 1, 9, 3, 7]);
    // Index 3 has value 3; change to 0.
    H.heapUpdateKey(h, 3, 0);
    expect(H.heapPeek(h)).toBe(0);
  });

  it("heapUpdateKey: panics when new key is not higher priority", () => {
    const h = H.heapFromArray([5, 1, 9]);
    expect(() => H.heapUpdateKey(h, 1, 100)).toThrow();
  });

  it("heapDelete: removes an element by index", () => {
    const h = H.heapFromArray([5, 1, 9, 3, 7]);
    H.heapDelete(h, 1);
    expect(H.heapSize(h)).toBe(4);
    expect(H.heapToSortedArray(h).length).toBe(4);
  });

  it("heapDelete: last element", () => {
    const h = H.heapFromArray([5, 1, 9]);
    H.heapDelete(h, 2);
    expect(H.heapSize(h)).toBe(2);
  });

  it("heapToSortedArray: empties the heap", () => {
    const h = H.heapFromArray([3, 1, 2]);
    const out = H.heapToSortedArray(h);
    expect(out).toEqual([1, 2, 3]);
    expect(H.heapIsEmpty(h)).toBe(true);
  });

  it("heapParent / heapLeft / heapRight", () => {
    expect(H.heapParent(1)).toBe(0);
    expect(H.heapParent(2)).toBe(0);
    expect(H.heapParent(3)).toBe(1);
    expect(H.heapLeft(0)).toBe(1);
    expect(H.heapRight(0)).toBe(2);
  });

  it("heapParent: panics on negative index", () => {
    expect(() => H.heapParent(-1)).toThrow();
  });

  it("heapSiftUp + heapSiftDown: restore heap property manually", () => {
    const h = H.heapNew<number>();
    h.arr = [0, 5, 1, 9, 3, 7];
    h.cmp = (a, b) => a < b;
    // Last element (7) violates: sift it up.
    H.heapSiftUp(h, 5);
    expect(h.arr[0]).toBe(0);
    // Now break root and sift down.
    h.arr[0] = 100;
    H.heapSiftDown(h, 0);
    expect(h.arr[0]).toBe(1);
  });

  it("min-heap with strings (lexicographic)", () => {
    const h = H.heapNew<string>((a, b) => a < b);
    H.heapPush(h, "banana");
    H.heapPush(h, "apple");
    H.heapPush(h, "cherry");
    expect(H.heapPop(h)).toBe("apple");
    expect(H.heapPop(h)).toBe("banana");
  });

  it("large push/pop sequence stays consistent", () => {
    const h = H.heapNew<number>();
    const input: number[] = [];
    for (let i = 0; i < 100; i++) {
      const v = (i * 37) % 1000;
      H.heapPush(h, v);
      input.push(v);
    }
    const out = H.heapToSortedArray(h);
    input.sort((a, b) => a - b);
    expect(out).toEqual(input);
  });
});
