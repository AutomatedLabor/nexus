import { describe, it, expect } from "vitest";
import * as F from "./index";

describe("flat module", () => {
  it("flat: one level", () => {
    expect(F.flat([[1, 2], [3, 4], 5])).toEqual([1, 2, 3, 4, 5]);
  });
  it("flat: empty", () => {
    expect(F.flat([])).toEqual([]);
  });
  it("flat: no nesting", () => {
    expect(F.flat([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it("flat: panic on non-array", () => {
    expect(() => F.flat("nope" as any)).toThrow();
  });

  it("flatDeep: deep nested", () => {
    expect(F.flatDeep([1, [2, [3, [4, [5]]]]])).toEqual([1, 2, 3, 4, 5]);
  });
  it("flatDeep: mixed", () => {
    expect(F.flatDeep([[1, [2]], [3, [[4]], 5]])).toEqual([1, 2, 3, 4, 5]);
  });
  it("flatDeep: empty nested", () => {
    expect(F.flatDeep([[], [[]], [[], []]])).toEqual([]);
  });

  it("flatten: depth=0 is a copy", () => {
    const arr = [[1, 2], [3, 4]];
    const out = F.flatten(arr, 0);
    expect(out).toEqual([[1, 2], [3, 4]]);
    // Verify it's a different array.
    expect(out).not.toBe(arr);
  });
  it("flatten: depth=1 equals flat", () => {
    expect(F.flatten([[1, 2], [3, 4]], 1)).toEqual([1, 2, 3, 4]);
  });
  it("flatten: depth=2", () => {
    expect(F.flatten([1, [2, [3, [4]]]], 2)).toEqual([1, 2, 3, [4]]);
  });
  it("flatten: negative depth is deep", () => {
    expect(F.flatten([1, [2, [3, [4]]]], -1)).toEqual([1, 2, 3, 4]);
  });
  it("flatten: default depth = 1", () => {
    expect(F.flatten([[1], [2]])).toEqual([1, 2]);
  });

  it("chunkFlat: basic", () => {
    expect(F.chunkFlat([[1, 2], [3, 4], 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });
  it("chunkFlat: uneven last chunk", () => {
    expect(F.chunkFlat([1, [2, 3], 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
  it("chunkFlat: panic on n=0", () => {
    expect(() => F.chunkFlat([1, 2], 0)).toThrow();
  });

  it("flatMap: basic", () => {
    expect(F.flatMap([1, 2, 3], (v) => [v, v * 10])).toEqual([1, 10, 2, 20, 3, 30]);
  });
  it("flatMap: scalar return kept as-is", () => {
    expect(F.flatMap([1, 2, 3], (v) => v + 1)).toEqual([2, 3, 4]);
  });
  it("flatMap: index passed", () => {
    expect(F.flatMap([10, 20], (v, i) => [i, v])).toEqual([0, 10, 1, 20]);
  });

  it("flatMapDeep: deep", () => {
    expect(F.flatMapDeep([1, 2, 3], (v) => [v, [v * 10, [v * 100]]]))
      .toEqual([1, 10, 100, 2, 20, 200, 3, 30, 300]);
  });

  it("nestedFlat: equals flatten", () => {
    expect(F.nestedFlat([1, [2, [3, [4]]]], 2)).toEqual([1, 2, 3, [4]]);
  });
  it("nestedFlat: default = 1 level", () => {
    expect(F.nestedFlat([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
  });

  it("flattenKeys: basic", () => {
    expect(F.flattenKeys({ a: { b: 1, c: 2 } })).toEqual({ "a.b": 1, "a.c": 2 });
  });
  it("flattenKeys: array indices bracketed", () => {
    expect(F.flattenKeys({ a: [10, 20] })).toEqual({ "a[0]": 10, "a[1]": 20 });
  });
  it("flattenKeys: scalar stays as-is", () => {
    expect(F.flattenKeys({ x: 5 })).toEqual({ x: 5 });
  });
  it("flattenKeys: panic on non-record", () => {
    expect(() => F.flattenKeys([1, 2] as any)).toThrow();
    expect(() => F.flattenKeys("no" as any)).toThrow();
  });

  it("flattenPath: default slash separator", () => {
    expect(F.flattenPath({ a: { b: { c: 1 } } })).toEqual({ "a/b/c": 1 });
  });
  it("flattenPath: custom separator", () => {
    expect(F.flattenPath({ a: { b: 1 } }, "__")).toEqual({ "a__b": 1 });
  });
  it("flattenPath: panic on empty separator", () => {
    expect(() => F.flattenPath({ a: 1 }, "")).toThrow();
  });

  it("concatAll: all arrays", () => {
    expect(F.concatAll([1, 2], [3, 4], [5])).toEqual([1, 2, 3, 4, 5]);
  });
  it("concatAll: mix of arrays and scalars", () => {
    expect(F.concatAll(1, [2, 3], 4, [5])).toEqual([1, 2, 3, 4, 5]);
  });
  it("concatAll: no args", () => {
    expect(F.concatAll()).toEqual([]);
  });
});
