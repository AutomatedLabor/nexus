import { describe, it, expect } from "vitest";
import * as L from "./index";

describe("list module", () => {
  it("zip: equal length", () => {
    expect(L.zip([1, 2, 3], ["a", "b", "c"])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
  });
  it("zip: stops at shorter", () => {
    expect(L.zip([1, 2, 3], ["a"])).toEqual([[1, "a"]]);
    expect(L.zip([1], ["a", "b"])).toEqual([[1, "a"]]);
  });
  it("zip: not array panics", () => {
    expect(() => L.zip(1 as any, [2])).toThrow();
  });

  it("zip3", () => {
    expect(L.zip3([1, 2], ["a", "b"], [true, false])).toEqual([[1, "a", true], [2, "b", false]]);
  });
  it("zip3: stops at shortest", () => {
    expect(L.zip3([1, 2, 3], ["a"], [true])).toEqual([[1, "a", true]]);
  });

  it("unzip", () => {
    expect(L.unzip([[1, "a"], [2, "b"], [3, "c"]])).toEqual([[1, 2, 3], ["a", "b", "c"]]);
  });
  it("unzip: empty", () => {
    expect(L.unzip([])).toEqual([[], []]);
  });
  it("unzip: bad tuple panics", () => {
    expect(() => L.unzip([[1, 2, 3]] as any)).toThrow();
  });

  it("interleave", () => {
    expect(L.interleave([1, 3, 5], [2, 4])).toEqual([1, 2, 3, 4, 5]);
  });
  it("interleave: one empty", () => {
    expect(L.interleave([], [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("cycle", () => {
    expect(L.cycle([1, 2], 5)).toEqual([1, 2, 1, 2, 1]);
  });
  it("cycle: empty arr panics", () => {
    expect(() => L.cycle([], 3)).toThrow();
  });
  it("cycle: negative n panics", () => {
    expect(() => L.cycle([1], -1)).toThrow();
  });

  it("replicate", () => {
    expect(L.replicate(0, 3)).toEqual([0, 0, 0]);
    expect(L.replicate("x", 0)).toEqual([]);
  });

  it("take: positive n", () => {
    expect(L.take([1, 2, 3, 4], 2)).toEqual([1, 2]);
  });
  it("take: negative n takes from end", () => {
    expect(L.take([1, 2, 3, 4], -2)).toEqual([3, 4]);
  });
  it("take: more than length", () => {
    expect(L.take([1, 2], 5)).toEqual([1, 2]);
  });

  it("drop: positive n", () => {
    expect(L.drop([1, 2, 3, 4], 2)).toEqual([3, 4]);
  });
  it("drop: negative n drops from end", () => {
    expect(L.drop([1, 2, 3, 4], -2)).toEqual([1, 2]);
  });

  it("takeWhile", () => {
    expect(L.takeWhile([1, 2, 3, 1, 2], (x) => x < 3)).toEqual([1, 2]);
  });
  it("takeWhile: none", () => {
    expect(L.takeWhile([5, 6], (x) => x < 3)).toEqual([]);
  });
  it("dropWhile", () => {
    expect(L.dropWhile([1, 2, 3, 1, 2], (x) => x < 3)).toEqual([3, 1, 2]);
  });

  it("span", () => {
    expect(L.span([1, 2, 3, 4], (x) => x < 3)).toEqual([[1, 2], [3, 4]]);
  });
  it("break_", () => {
    expect(L.break_([1, 2, 3, 4], (x) => x >= 3)).toEqual([[1, 2], [3, 4]]);
  });

  it("partition", () => {
    expect(L.partition([1, 2, 3, 4, 5], (x) => x % 2 === 0)).toEqual([[2, 4], [1, 3, 5]]);
  });

  it("group: even chunks", () => {
    expect(L.group([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
  it("group: uneven last chunk", () => {
    expect(L.group([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("group: bad n panics", () => {
    expect(() => L.group([1, 2], 0)).toThrow();
  });

  it("groupBy", () => {
    expect(L.groupBy([1, 1, 2, 2, 2, 3], (x) => x)).toEqual([[1, 1], [2, 2, 2], [3]]);
  });
  it("groupBy: empty", () => {
    expect(L.groupBy([], (x) => x)).toEqual([]);
  });

  it("window", () => {
    expect(L.window([1, 2, 3, 4], 2)).toEqual([[1, 2], [2, 3], [3, 4]]);
  });
  it("window: window larger than arr returns []", () => {
    expect(L.window([1, 2], 5)).toEqual([]);
  });

  it("intersperse", () => {
    expect(L.intersperse([1, 2, 3], 0)).toEqual([1, 0, 2, 0, 3]);
  });
  it("intersperse: empty", () => {
    expect(L.intersperse([], 0)).toEqual([]);
  });
  it("intersperse: single", () => {
    expect(L.intersperse([1], 0)).toEqual([1]);
  });

  it("scan", () => {
    expect(L.scan([1, 2, 3], (a, x) => a + x, 0)).toEqual([0, 1, 3, 6]);
  });
  it("scanr", () => {
    // [1,2,3], f(x,acc)=x+acc, init=0 => [6,5,3,0]
    expect(L.scanr([1, 2, 3], (x, acc) => x + acc, 0)).toEqual([6, 5, 3, 0]);
  });

  it("unfold", () => {
    expect(L.unfold(1, (x) => x * 2, 4)).toEqual([1, 2, 4, 8]);
  });
  it("rangeBy", () => {
    expect(L.rangeBy(0, 5, 4)).toEqual([0, 5, 10, 15]);
  });
  it("rangeBy: negative step", () => {
    expect(L.rangeBy(10, -2, 3)).toEqual([10, 8, 6]);
  });
  it("iterate", () => {
    expect(L.iterate((x) => x + 1, 4, 0)).toEqual([0, 1, 2, 3]);
  });

  it("permutations: 3 elements yields 6", () => {
    const ps = L.permutations([1, 2, 3]);
    expect(ps).toHaveLength(6);
    expect(ps[0]).toEqual([1, 2, 3]);
    expect(ps[5]).toEqual([3, 2, 1]);
  });
  it("permutations: empty yields [[]]", () => {
    expect(L.permutations([])).toEqual([[]]);
  });
  it("permutations: dedup not done — input treated as distinct", () => {
    const ps = L.permutations([1, 1]);
    expect(ps).toHaveLength(2);
  });

  it("combinations: 4 choose 2", () => {
    const cs = L.combinations([1, 2, 3, 4], 2);
    expect(cs).toHaveLength(6);
    expect(cs[0]).toEqual([1, 2]);
    expect(cs[5]).toEqual([3, 4]);
  });
  it("combinations: 4 choose 0", () => {
    expect(L.combinations([1, 2, 3, 4], 0)).toEqual([[]]);
  });
  it("combinations: k > n panics", () => {
    expect(() => L.combinations([1, 2], 3)).toThrow();
  });

  it("rotate: positive (left)", () => {
    expect(L.rotate([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5, 1, 2]);
  });
  it("rotate: negative (right)", () => {
    expect(L.rotate([1, 2, 3, 4, 5], -2)).toEqual([4, 5, 1, 2, 3]);
  });
  it("rotate: full wrap", () => {
    expect(L.rotate([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });
  it("rotate: empty", () => {
    expect(L.rotate([], 5)).toEqual([]);
  });
});
