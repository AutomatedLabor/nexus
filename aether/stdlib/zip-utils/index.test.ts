import { describe, it, expect } from "vitest";
import * as ZU from "./index";
import * as Z from "../zip";

// These tests intentionally differ from the `zip` module's tests so
// the combined suite exercises a broader set of edge cases. Where
// the `zip` tests cover the happy path and a few error cases, these
// tests focus on: mixed-type tuples, large inputs, unicode keys,
// partial-fill round trips through `unzip`, `zipAll` with one or
// many arrays, and `zipToDict` semantics on numeric and boolean
// keys.

describe("zip-utils module (re-export of zip)", () => {
  it("zip: mixed types in tuple", () => {
    expect(ZU.zip([1, 2, 3], [true, false, true]))
      .toEqual([[1, true], [2, false], [3, true]]);
  });

  it("zip: 100 elements round trip", () => {
    const a = Array.from({ length: 100 }, (_, i) => i);
    const b = Array.from({ length: 100 }, (_, i) => i * 2);
    const z = ZU.zip(a, b);
    expect(z.length).toBe(100);
    expect(z[0]).toEqual([0, 0]);
    expect(z[50]).toEqual([50, 100]);
    expect(z[99]).toEqual([99, 198]);
  });

  it("zip: one empty, one non-empty -> empty", () => {
    expect(ZU.zip([], [1, 2, 3])).toEqual([]);
    expect(ZU.zip([1, 2, 3], [])).toEqual([]);
  });

  it("zip: panic on non-array first arg", () => {
    expect(() => ZU.zip("nope" as any, [1])).toThrow();
  });

  it("zip3: truncate to shortest of three", () => {
    expect(ZU.zip3([1, 2, 3], ["a", "b"], [true, false, true, false]))
      .toEqual([[1, "a", true], [2, "b", false]]);
  });

  it("zip3: empty result when any input is empty", () => {
    expect(ZU.zip3([], [1], [true])).toEqual([]);
  });

  it("zipWith: combine to objects", () => {
    expect(ZU.zipWith(["a", "b"], [1, 2], (k, v) => ({ k, v })))
      .toEqual([{ k: "a", v: 1 }, { k: "b", v: 2 }]);
  });

  it("zipWith: index parameter used", () => {
    expect(ZU.zipWith([10, 20, 30], [1, 2, 3], (a, b, i) => a + b + i * 100))
      .toEqual([11, 122, 233]);
  });

  it("zipWith: truncate to shorter input", () => {
    expect(ZU.zipWith([1, 2, 3], [10], (a, b) => a + b)).toEqual([11]);
  });

  it("unzip: round trip through zipLongest with null fill", () => {
    const z = ZU.zipLongest([1, 2, 3], ["a", "b"]);
    const [as, bs] = ZU.unzip(z);
    expect(as).toEqual([1, 2, 3]);
    expect(bs).toEqual(["a", "b", null]);
  });

  it("unzip: mixed-type values", () => {
    expect(ZU.unzip([[1, "x"], [2, 99], [3, true]]))
      .toEqual([[1, 2, 3], ["x", 99, true]]);
  });

  it("unzip3: round trip through zip3", () => {
    const z = ZU.zip3([1, 2], ["a", "b"], [true, false]);
    const [a, b, c] = ZU.unzip3(z);
    expect(a).toEqual([1, 2]);
    expect(b).toEqual(["a", "b"]);
    expect(c).toEqual([true, false]);
  });

  it("zipLongest: both inputs equal length -> no padding", () => {
    expect(ZU.zipLongest([1, 2], [3, 4], 0)).toEqual([[1, 3], [2, 4]]);
  });

  it("zipLongest: first shorter than second", () => {
    expect(ZU.zipLongest([1], [10, 20, 30], "?"))
      .toEqual([[1, 10], ["?", 20], ["?", 30]]);
  });

  it("zipAll: variadic with explicit fill first", () => {
    expect(ZU.zipAll(0, [1, 2, 3], [10, 20], [100]))
      .toEqual([[1, 10, 100], [2, 20, 0], [3, 0, 0]]);
  });

  it("zipAll: variadic without fill (null default)", () => {
    expect(ZU.zipAll([1, 2, 3], [10, 20]))
      .toEqual([[1, 10], [2, 20], [3, null]]);
  });

  it("zipAll: single array -> tuples of length 1", () => {
    expect(ZU.zipAll([1, 2, 3])).toEqual([[1], [2], [3]]);
  });

  it("zipAll: no arrays at all -> []", () => {
    expect(ZU.zipAll(0)).toEqual([]);
  });

  it("zipToDict: unicode string keys", () => {
    expect(ZU.zipToDict(["α", "β", "γ"], [1, 2, 3]))
      .toEqual({ "α": 1, "β": 2, "γ": 3 });
  });

  it("zipToDict: boolean keys stringified", () => {
    expect(ZU.zipToDict([true, false], ["yes", "no"]))
      .toEqual({ "true": "yes", "false": "no" });
  });

  it("zipToDict: later duplicate key wins (string)", () => {
    expect(ZU.zipToDict(["a", "a", "a"], [1, 2, 3])).toEqual({ "a": 3 });
  });

  it("zipStrict: equal lengths", () => {
    expect(ZU.zipStrict([1, 2], ["a", "b"])).toEqual([[1, "a"], [2, "b"]]);
  });

  it("zipStrict: panic on length mismatch (off by one)", () => {
    expect(() => ZU.zipStrict([1, 2, 3], ["a", "b"])).toThrow();
  });

  it("zipWithIndex: 50 elements", () => {
    const out = ZU.zipWithIndex(Array.from({ length: 50 }, (_, i) => i * i));
    expect(out.length).toBe(50);
    expect(out[0]).toEqual([0, 0]);
    expect(out[10]).toEqual([10, 100]);
    expect(out[49]).toEqual([49, 2401]);
  });

  it("zipWithIndex: empty -> empty", () => {
    expect(ZU.zipWithIndex([])).toEqual([]);
  });

  it("re-exports same function refs as the zip module", () => {
    // Sanity check: the re-export gives us the exact function reference.
    // This protects against accidental drift if `zip` ever rewrites a
    // function without updating the re-export.
    expect(ZU.zip).toBe(Z.zip);
    expect(ZU.zipWith).toBe(Z.zipWith);
    expect(ZU.zipToDict).toBe(Z.zipToDict);
  });
});
