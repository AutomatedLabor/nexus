import { describe, it, expect } from "vitest";
import * as S from "./index";

const unsorted = [5, 1, 9, 3, 7, 2, 8, 4, 6];
const sortedAsc = [1, 2, 3, 4, 5, 6, 7, 8, 9];

describe("sort-extra module", () => {
  it("sortTim: ascending default", () => {
    expect(S.sortTim(unsorted)).toEqual(sortedAsc);
  });
  it("sortTim: empty", () => {
    expect(S.sortTim([])).toEqual([]);
  });
  it("sortTim: single", () => {
    expect(S.sortTim([42])).toEqual([42]);
  });
  it("sortTim: long array", () => {
    const big: number[] = [];
    for (let i = 0; i < 500; i++) big.push((i * 37) % 500);
    const out = S.sortTim(big);
    expect(S.isSorted(out)).toBe(true);
  });
  it("sortTim: descending cmp", () => {
    expect(S.sortTim([1, 2, 3], (a, b) => b - a)).toEqual([3, 2, 1]);
  });

  it("sortIntro: ascending default", () => {
    expect(S.sortIntro(unsorted)).toEqual(sortedAsc);
  });
  it("sortIntro: empty", () => {
    expect(S.sortIntro([])).toEqual([]);
  });
  it("sortIntro: already sorted (worst case for naive quick)", () => {
    const big = Array.from({ length: 1000 }, (_, i) => i);
    const out = S.sortIntro(big);
    expect(S.isSorted(out)).toBe(true);
  });
  it("sortIntro: descending cmp", () => {
    expect(S.sortIntro([1, 2, 3], (a, b) => b - a)).toEqual([3, 2, 1]);
  });

  it("sortBitonic: ascending default", () => {
    expect(S.sortBitonic(unsorted)).toEqual(sortedAsc);
  });
  it("sortBitonic: power-of-2 length", () => {
    expect(S.sortBitonic([8, 4, 2, 1])).toEqual([1, 2, 4, 8]);
  });
  it("sortBitonic: empty", () => {
    expect(S.sortBitonic([])).toEqual([]);
  });
  it("sortBitonic: single", () => {
    expect(S.sortBitonic([42])).toEqual([42]);
  });

  it("sortPancake: ascending default", () => {
    expect(S.sortPancake(unsorted)).toEqual(sortedAsc);
  });
  it("sortPancake: empty", () => {
    expect(S.sortPancake([])).toEqual([]);
  });
  it("sortPancake: with descending cmp", () => {
    expect(S.sortPancake([1, 2, 3], (a, b) => b - a)).toEqual([3, 2, 1]);
  });

  it("sortStooge: ascending default (small)", () => {
    expect(S.sortStooge([3, 1, 2])).toEqual([1, 2, 3]);
  });
  it("sortStooge: empty", () => {
    expect(S.sortStooge([])).toEqual([]);
  });
  it("sortStooge: small array", () => {
    expect(S.sortStooge([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]);
  });

  it("sortBogo: small array, sorted after cap", () => {
    // With only 6 elements, 10000 iterations is virtually guaranteed to hit.
    const out = S.sortBogo([3, 1, 2], undefined, 10000);
    expect(out).toEqual([1, 2, 3]);
  });
  it("sortBogo: empty", () => {
    expect(S.sortBogo([])).toEqual([]);
  });
  it("sortBogo: fallback deterministic when cap hit", () => {
    // Cap = 0 → fallback path always taken; result must still be sorted.
    const out = S.sortBogo([3, 1, 2], undefined, 0);
    expect(out).toEqual([1, 2, 3]);
  });

  it("sortSleep: ascending default", () => {
    expect(S.sortSleep(unsorted)).toEqual(sortedAsc);
  });
  it("sortSleep: empty", () => {
    expect(S.sortSleep([])).toEqual([]);
  });
  it("sortSleep: duplicates grouped", () => {
    expect(S.sortSleep([3, 1, 3, 1, 2])).toEqual([1, 1, 2, 3, 3]);
  });

  it("sortSmooth: ascending default", () => {
    expect(S.sortSmooth(unsorted)).toEqual(sortedAsc);
  });
  it("sortSmooth: empty", () => {
    expect(S.sortSmooth([])).toEqual([]);
  });
  it("sortSmooth: small", () => {
    expect(S.sortSmooth([5, 3, 1, 4, 2])).toEqual([1, 2, 3, 4, 5]);
  });

  it("sortCycle: ascending default", () => {
    expect(S.sortCycle(unsorted)).toEqual(sortedAsc);
  });
  it("sortCycle: empty", () => {
    expect(S.sortCycle([])).toEqual([]);
  });
  it("sortCycle: duplicates", () => {
    expect(S.sortCycle([3, 1, 3, 2, 1])).toEqual([1, 1, 2, 3, 3]);
  });

  it("sortLibrary: ascending default", () => {
    expect(S.sortLibrary(unsorted)).toEqual(sortedAsc);
  });
  it("sortLibrary: empty", () => {
    expect(S.sortLibrary([])).toEqual([]);
  });
  it("sortLibrary: single", () => {
    expect(S.sortLibrary([42])).toEqual([42]);
  });

  it("isSorted: ascending true", () => {
    expect(S.isSorted([1, 2, 3, 4])).toBe(true);
  });
  it("isSorted: unsorted false", () => {
    expect(S.isSorted([2, 1, 3])).toBe(false);
  });
});
