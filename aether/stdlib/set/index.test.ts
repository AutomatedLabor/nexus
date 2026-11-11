import { describe, it, expect } from "vitest";
import * as S from "./index";

describe("set module", () => {
  it("setNew: empty", () => {
    expect(S.setSize(S.setNew())).toBe(0);
  });
  it("setNew: from array", () => {
    const s = S.setNew([1, 2, 2, 3]);
    expect(S.setSize(s)).toBe(3);
    expect(S.setHas(s, 1)).toBe(true);
  });
  it("setNew: non-array panics", () => {
    expect(() => S.setNew(1 as any)).toThrow();
  });

  it("setAdd: returns same set (chainable)", () => {
    const s = S.setNew<number>();
    expect(S.setAdd(s, 1)).toBe(s);
    expect(S.setHas(s, 1)).toBe(true);
  });
  it("setAdd: dedupes", () => {
    const s = S.setNew([1]);
    S.setAdd(s, 1);
    expect(S.setSize(s)).toBe(1);
  });

  it("setRemove: present returns true", () => {
    const s = S.setNew([1, 2, 3]);
    expect(S.setRemove(s, 2)).toBe(true);
    expect(S.setHas(s, 2)).toBe(false);
  });
  it("setRemove: absent returns false", () => {
    const s = S.setNew([1, 2, 3]);
    expect(S.setRemove(s, 99)).toBe(false);
  });

  it("setHas", () => {
    const s = S.setNew(["a", "b"]);
    expect(S.setHas(s, "a")).toBe(true);
    expect(S.setHas(s, "z")).toBe(false);
  });

  it("setSize", () => {
    expect(S.setSize(S.setNew([1, 2, 3]))).toBe(3);
  });

  it("setToArray: preserves insertion order", () => {
    expect(S.setToArray(S.setNew([3, 1, 2]))).toEqual([3, 1, 2]);
  });

  it("setUnion", () => {
    const a = S.setNew([1, 2, 3]);
    const b = S.setNew([3, 4, 5]);
    expect(S.setToArray(S.setUnion(a, b)).sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it("setUnion: with empty", () => {
    expect(S.setToArray(S.setUnion(S.setNew([1]), S.setNew()))).toEqual([1]);
  });

  it("setIntersect", () => {
    const a = S.setNew([1, 2, 3]);
    const b = S.setNew([2, 3, 4]);
    expect(S.setToArray(S.setIntersect(a, b)).sort()).toEqual([2, 3]);
  });
  it("setIntersect: disjoint yields empty", () => {
    expect(S.setSize(S.setIntersect(S.setNew([1]), S.setNew([2])))).toBe(0);
  });

  it("setDifference", () => {
    const a = S.setNew([1, 2, 3, 4]);
    const b = S.setNew([2, 4]);
    expect(S.setToArray(S.setDifference(a, b)).sort()).toEqual([1, 3]);
  });

  it("setSymDiff", () => {
    const a = S.setNew([1, 2, 3]);
    const b = S.setNew([2, 3, 4]);
    expect(S.setToArray(S.setSymDiff(a, b)).sort()).toEqual([1, 4]);
  });

  it("setSubset: true", () => {
    expect(S.setSubset(S.setNew([1, 2]), S.setNew([1, 2, 3]))).toBe(true);
  });
  it("setSubset: false (extra element)", () => {
    expect(S.setSubset(S.setNew([1, 4]), S.setNew([1, 2, 3]))).toBe(false);
  });
  it("setSubset: equal sets are subsets", () => {
    expect(S.setSubset(S.setNew([1, 2]), S.setNew([1, 2]))).toBe(true);
  });
  it("setSubset: empty is subset of anything", () => {
    expect(S.setSubset(S.setNew(), S.setNew([1, 2]))).toBe(true);
  });
  it("setSubset: larger set cannot be subset of smaller", () => {
    expect(S.setSubset(S.setNew([1, 2, 3]), S.setNew([1, 2]))).toBe(false);
  });

  it("setSuperset: true", () => {
    expect(S.setSuperset(S.setNew([1, 2, 3]), S.setNew([1, 2]))).toBe(true);
  });

  it("setDisjoint: true", () => {
    expect(S.setDisjoint(S.setNew([1, 2]), S.setNew([3, 4]))).toBe(true);
  });
  it("setDisjoint: false (overlap)", () => {
    expect(S.setDisjoint(S.setNew([1, 2]), S.setNew([2, 3]))).toBe(false);
  });

  it("setEqual: same elements", () => {
    expect(S.setEqual(S.setNew([1, 2, 3]), S.setNew([3, 2, 1]))).toBe(true);
  });
  it("setEqual: different sizes", () => {
    expect(S.setEqual(S.setNew([1, 2, 3]), S.setNew([1, 2]))).toBe(false);
  });
  it("setEqual: different elements", () => {
    expect(S.setEqual(S.setNew([1, 2, 3]), S.setNew([1, 2, 4]))).toBe(false);
  });

  it("setMap", () => {
    const s = S.setNew([1, 2, 3]);
    const m = S.setMap(s, (x) => x * 2);
    expect(S.setToArray(m).sort()).toEqual([2, 4, 6]);
  });
  it("setMap: collapses collisions", () => {
    const s = S.setNew([1, -1]);
    const m = S.setMap(s, (x) => Math.abs(x));
    expect(S.setSize(m)).toBe(1);
  });

  it("setFilter", () => {
    const s = S.setNew([1, 2, 3, 4]);
    const f = S.setFilter(s, (x) => x % 2 === 0);
    expect(S.setToArray(f).sort()).toEqual([2, 4]);
  });

  it("setFold: sum", () => {
    const s = S.setNew([1, 2, 3, 4]);
    expect(S.setFold(s, (a, x) => a + x, 0)).toBe(10);
  });
  it("setFold: empty returns init", () => {
    expect(S.setFold(S.setNew<number>(), (a: number, x: number) => a + x, 42)).toBe(42);
  });

  it("setAny", () => {
    expect(S.setAny(S.setNew([1, 2, 3]), (x) => x === 2)).toBe(true);
    expect(S.setAny(S.setNew([1, 2, 3]), (x) => x === 9)).toBe(false);
    expect(S.setAny(S.setNew(), (x: any) => true)).toBe(false);
  });

  it("setAll", () => {
    expect(S.setAll(S.setNew([2, 4, 6]), (x) => x % 2 === 0)).toBe(true);
    expect(S.setAll(S.setNew([2, 4, 5]), (x) => x % 2 === 0)).toBe(false);
    expect(S.setAll(S.setNew(), (x: any) => false)).toBe(true); // vacuous
  });

  it("setToString: numbers", () => {
    expect(S.setToString(S.setNew([1, 2, 3]))).toBe("{1, 2, 3}");
  });
  it("setToString: strings", () => {
    expect(S.setToString(S.setNew(["a", "b"]))).toBe("{a, b}");
  });
  it("setToString: empty", () => {
    expect(S.setToString(S.setNew())).toBe("{}");
  });

  it("non-Set arg panics", () => {
    expect(() => S.setSize([1, 2] as any)).toThrow();
    expect(() => S.setUnion([1] as any, S.setNew())).toThrow();
  });
});
