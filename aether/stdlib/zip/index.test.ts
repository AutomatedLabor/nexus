import { describe, it, expect } from "vitest";
import * as Z from "./index";

describe("zip module", () => {
  it("zip: basic", () => {
    expect(Z.zip([1, 2, 3], ["a", "b", "c"])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
  });
  it("zip: truncate to shorter", () => {
    expect(Z.zip([1, 2, 3], ["a", "b"])).toEqual([[1, "a"], [2, "b"]]);
  });
  it("zip: empty inputs", () => {
    expect(Z.zip([], [])).toEqual([]);
  });
  it("zip: panic on non-array", () => {
    expect(() => Z.zip([1], "no" as any)).toThrow();
  });

  it("zip3: basic", () => {
    expect(Z.zip3([1, 2], [10, 20], [100, 200])).toEqual([[1, 10, 100], [2, 20, 200]]);
  });
  it("zip3: truncate to shortest", () => {
    expect(Z.zip3([1, 2, 3], [10, 20], [100])).toEqual([[1, 10, 100]]);
  });

  it("zipWith: basic combine", () => {
    expect(Z.zipWith([1, 2, 3], [10, 20, 30], (a, b) => a + b)).toEqual([11, 22, 33]);
  });
  it("zipWith: index passed", () => {
    expect(Z.zipWith([5, 5, 5], [5, 5, 5], (a, b, i) => i)).toEqual([0, 1, 2]);
  });
  it("zipWith: panic on non-fn", () => {
    expect(() => Z.zipWith([1], [2], "no" as any)).toThrow();
  });

  it("unzip: basic", () => {
    expect(Z.unzip([[1, "a"], [2, "b"], [3, "c"]])).toEqual([[1, 2, 3], ["a", "b", "c"]]);
  });
  it("unzip: empty", () => {
    expect(Z.unzip([])).toEqual([[], []]);
  });
  it("unzip: panic on non-tuple", () => {
    expect(() => Z.unzip([[1, 2], [3]] as any)).toThrow();
  });

  it("unzip3: basic", () => {
    expect(Z.unzip3([[1, "a", true], [2, "b", false]]))
      .toEqual([[1, 2], ["a", "b"], [true, false]]);
  });

  it("zipLongest: default fill null", () => {
    expect(Z.zipLongest([1, 2, 3], ["a", "b"])).toEqual([[1, "a"], [2, "b"], [3, null]]);
  });
  it("zipLongest: custom fill", () => {
    expect(Z.zipLongest([1, 2], [10, 20, 30], 0)).toEqual([[1, 10], [2, 20], [0, 30]]);
  });

  it("zipAll: variadic with fill first", () => {
    expect(Z.zipAll(0, [1, 2, 3], [10, 20], [100]))
      .toEqual([[1, 10, 100], [2, 20, 0], [3, 0, 0]]);
  });
  it("zipAll: variadic without fill (null default)", () => {
    expect(Z.zipAll([1, 2, 3], [10, 20]))
      .toEqual([[1, 10], [2, 20], [3, null]]);
  });
  it("zipAll: no arrays", () => {
    expect(Z.zipAll(0)).toEqual([]);
  });

  it("zipToDict: basic", () => {
    expect(Z.zipToDict(["a", "b", "c"], [1, 2, 3])).toEqual({ a: 1, b: 2, c: 3 });
  });
  it("zipToDict: numeric keys stringified", () => {
    expect(Z.zipToDict([1, 2], ["x", "y"])).toEqual({ "1": "x", "2": "y" });
  });
  it("zipToDict: truncate to shorter", () => {
    expect(Z.zipToDict(["a", "b", "c"], [1])).toEqual({ a: 1 });
  });
  it("zipToDict: later duplicate key wins", () => {
    expect(Z.zipToDict(["a", "a"], [1, 2])).toEqual({ a: 2 });
  });

  it("zipStrict: equal lengths", () => {
    expect(Z.zipStrict([1, 2], ["a", "b"])).toEqual([[1, "a"], [2, "b"]]);
  });
  it("zipStrict: panic on mismatch", () => {
    expect(() => Z.zipStrict([1, 2, 3], ["a"])).toThrow();
  });

  it("zipWithIndex: basic", () => {
    expect(Z.zipWithIndex(["a", "b", "c"])).toEqual([[0, "a"], [1, "b"], [2, "c"]]);
  });
  it("zipWithIndex: empty", () => {
    expect(Z.zipWithIndex([])).toEqual([]);
  });
});
