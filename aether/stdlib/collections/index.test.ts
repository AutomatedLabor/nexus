import { describe, it, expect } from "vitest";
import * as C from "./index";

describe("collections: vector", () => {
  it("push", () => {
    expect(C.push([1, 2], 3)).toEqual([1, 2, 3]);
    expect(C.push([], 1)).toEqual([1]);
  });
  it("push: non-mutating", () => {
    const a = [1, 2];
    C.push(a, 3);
    expect(a).toEqual([1, 2]);
  });
  it("pop", () => {
    expect(C.pop([1, 2, 3])).toEqual([1, 2]);
    expect(() => C.pop([])).toThrow();
  });
  it("shift", () => {
    expect(C.shift([1, 2, 3])).toEqual([2, 3]);
    expect(() => C.shift([])).toThrow();
  });
  it("unshift", () => {
    expect(C.unshift([2, 3], 1)).toEqual([1, 2, 3]);
  });
  it("insert", () => {
    expect(C.insert([1, 3], 1, 2)).toEqual([1, 2, 3]);
    expect(() => C.insert([1], 5, 0)).toThrow();
  });
  it("remove", () => {
    expect(C.remove([1, 2, 3], 1)).toEqual([1, 3]);
    expect(() => C.remove([1], 1)).toThrow();
  });
  it("slice: one arg", () => {
    expect(C.slice([1, 2, 3], 1)).toEqual([2, 3]);
  });
  it("slice: two args", () => {
    expect(C.slice([1, 2, 3], 0, 2)).toEqual([1, 2]);
  });
  it("concat", () => {
    expect(C.concat([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
  });
  it("reverse", () => {
    expect(C.reverse([1, 2, 3])).toEqual([3, 2, 1]);
  });
  it("sort: default", () => {
    expect(C.sort([3, 1, 2])).toEqual([1, 2, 3]);
    expect(C.sort(["b", "a", "c"])).toEqual(["a", "b", "c"]);
  });
  it("sort: custom comparator", () => {
    const r = C.sort([3, 1, 2], (a, b) => b - a);
    expect(r).toEqual([3, 2, 1]);
  });
  it("map", () => {
    expect(C.map([1, 2, 3], (v) => v * 2)).toEqual([2, 4, 6]);
    expect(C.map([1, 2], (v, i) => v + i)).toEqual([1, 3]);
  });
  it("filter", () => {
    expect(C.filter([1, 2, 3, 4], (v) => v % 2 === 0)).toEqual([2, 4]);
  });
  it("reduce", () => {
    expect(C.reduce([1, 2, 3, 4], (a, v) => a + v, 0)).toBe(10);
    expect(C.reduce([], (a, v) => a + v, 5)).toBe(5);
  });
  it("find", () => {
    expect(C.find([1, 2, 3], (v) => v > 1)).toBe(2);
    expect(C.find([1, 2, 3], (v) => v > 5)).toBeNull();
  });
  it("findIndex", () => {
    expect(C.findIndex([1, 2, 3], (v) => v === 2)).toBe(1);
    expect(C.findIndex([1, 2, 3], (v) => v === 9)).toBe(-1);
  });
  it("every", () => {
    expect(C.every([2, 4, 6], (v) => v % 2 === 0)).toBe(true);
    expect(C.every([2, 3, 6], (v) => v % 2 === 0)).toBe(false);
    expect(C.every([], (v) => false)).toBe(true);
  });
  it("some", () => {
    expect(C.some([1, 3, 5], (v) => v === 3)).toBe(true);
    expect(C.some([1, 3, 5], (v) => v === 4)).toBe(false);
    expect(C.some([], (v) => true)).toBe(false);
  });
  it("includes", () => {
    expect(C.includes([1, 2, 3], 2)).toBe(true);
    expect(C.includes([1, 2, 3], 5)).toBe(false);
    expect(C.includes([[1], [2]], [1])).toBe(true);
  });
  it("indexOf", () => {
    expect(C.indexOf([1, 2, 3], 2)).toBe(1);
    expect(C.indexOf([1, 2, 3], 9)).toBe(-1);
  });
  it("flat", () => {
    expect(C.flat([[1, 2], [3]])).toEqual([1, 2, 3]);
    expect(C.flat([1, [2, [3]]])).toEqual([1, 2, [3]]);
  });
  it("flatMap", () => {
    expect(C.flatMap([1, 2, 3], (v) => [v, v * 10])).toEqual([1, 10, 2, 20, 3, 30]);
    expect(C.flatMap([1, 2], (v) => v)).toEqual([1, 2]);
  });
  it("zip", () => {
    expect(C.zip([1, 2, 3], ["a", "b"])).toEqual([[1, "a"], [2, "b"]]);
  });
  it("chunk", () => {
    expect(C.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => C.chunk([1], 0)).toThrow();
  });
  it("unique", () => {
    expect(C.unique([1, 1, 2, 3, 3])).toEqual([1, 2, 3]);
    expect(C.unique(["a", "a", "b"])).toEqual(["a", "b"]);
  });
  it("len", () => {
    expect(C.len([1, 2, 3])).toBe(3);
    expect(C.len(C.mapNew())).toBe(0);
    expect(C.len(C.setNew())).toBe(0);
  });
});

describe("collections: map", () => {
  it("mapNew/mapSet/mapGet", () => {
    const m = C.mapNew();
    C.mapSet(m, "a", 1);
    C.mapSet(m, "b", 2);
    expect(C.mapGet(m, "a")).toBe(1);
    expect(C.mapGet(m, "b")).toBe(2);
  });
  it("mapHas", () => {
    const m = C.mapNew();
    C.mapSet(m, "a", 1);
    expect(C.mapHas(m, "a")).toBe(true);
    expect(C.mapHas(m, "z")).toBe(false);
  });
  it("mapDelete", () => {
    const m = C.mapNew();
    C.mapSet(m, "a", 1);
    expect(C.mapDelete(m, "a")).toBe(true);
    expect(C.mapDelete(m, "a")).toBe(false);
  });
  it("mapKeys / mapValues / mapEntries", () => {
    const m = C.mapNew();
    C.mapSet(m, "a", 1);
    C.mapSet(m, "b", 2);
    expect(C.mapKeys(m)).toEqual(["a", "b"]);
    expect(C.mapValues(m)).toEqual([1, 2]);
    const entries = C.mapEntries(m);
    expect(entries[0].fields.key).toBe("a");
    expect(entries[0].fields.value).toBe(1);
  });
  it("mapSize", () => {
    const m = C.mapNew();
    C.mapSet(m, "a", 1);
    expect(C.mapSize(m)).toBe(1);
  });
  it("mapGet: missing key panics", () => {
    const m = C.mapNew();
    expect(() => C.mapGet(m, "nope")).toThrow();
  });
  it("map: numeric keys", () => {
    const m = C.mapNew();
    C.mapSet(m, 1, "one");
    C.mapSet(m, 2, "two");
    expect(C.mapGet(m, 2)).toBe("two");
  });
});

describe("collections: set", () => {
  it("setNew / setAdd / setHas", () => {
    const s = C.setNew();
    C.setAdd(s, "x");
    C.setAdd(s, "y");
    expect(C.setHas(s, "x")).toBe(true);
    expect(C.setHas(s, "z")).toBe(false);
  });
  it("setAdd: dedupes", () => {
    const s = C.setNew();
    C.setAdd(s, 1);
    C.setAdd(s, 1);
    expect(C.setSize(s)).toBe(1);
  });
  it("setDelete", () => {
    const s = C.setNew();
    C.setAdd(s, 1);
    expect(C.setDelete(s, 1)).toBe(true);
    expect(C.setDelete(s, 1)).toBe(false);
  });
  it("setSize", () => {
    const s = C.setNew();
    C.setAdd(s, 1);
    C.setAdd(s, 2);
    expect(C.setSize(s)).toBe(2);
  });
  it("setToArray", () => {
    const s = C.setNew();
    C.setAdd(s, 1);
    C.setAdd(s, 2);
    expect(C.setToArray(s)).toEqual([1, 2]);
  });
});
