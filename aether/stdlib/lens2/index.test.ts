import { describe, it, expect } from "vitest";
import * as L from "./index";

describe("lens2 module", () => {
  // lensWhere -----------------------------------------------------------
  it("lensWhere: get returns first matching element", () => {
    const l = L.lensWhere<number>((x) => x > 2);
    expect(l.get([1, 2, 3, 4])).toBe(3);
  });
  it("lensWhere: get returns undefined when no match", () => {
    const l = L.lensWhere<number>((x) => x > 100);
    expect(l.get([1, 2, 3])).toBeUndefined();
  });
  it("lensWhere: set replaces first matching element", () => {
    const l = L.lensWhere<number>((x) => x > 2);
    expect(l.set([1, 2, 3, 4], 999)).toEqual([1, 2, 999, 4]);
  });
  it("lensWhere: set is a no-op when no match", () => {
    const l = L.lensWhere<number>((x) => x > 100);
    expect(l.set([1, 2, 3], 999)).toEqual([1, 2, 3]);
  });
  it("lensWhere: throws on non-function predicate", () => {
    expect(() => L.lensWhere(null as any)).toThrow(/pred must be a function/);
  });

  // lensRecord ---------------------------------------------------------
  it("lensRecord: get returns a subset of keys", () => {
    const l = L.lensRecord(["a", "c"]);
    expect(l.get({ a: 1, b: 2, c: 3, d: 4 })).toEqual({ a: 1, c: 3 });
  });
  it("lensRecord: get on null returns empty record", () => {
    const l = L.lensRecord(["a"]);
    expect(l.get(null as any)).toEqual({});
  });
  it("lensRecord: set replaces listed keys, preserves rest", () => {
    const l = L.lensRecord(["a", "c"]);
    const r = l.set({ a: 1, b: 2, c: 3, d: 4 }, { a: 10, c: 30 });
    expect(r).toEqual({ a: 10, b: 2, c: 30, d: 4 });
  });
  it("lensRecord: set with partial value updates only provided keys", () => {
    const l = L.lensRecord(["a", "c"]);
    const r = l.set({ a: 1, b: 2, c: 3 }, { a: 99 });
    expect(r).toEqual({ a: 99, b: 2, c: 3 });
  });
  it("lensRecord: throws on non-array keys", () => {
    expect(() => L.lensRecord(null as any)).toThrow(/keys must be an array/);
  });
  it("lensRecord: throws on non-string key", () => {
    expect(() => L.lensRecord(["a", 5 as any])).toThrow(/each key must be a string/);
  });

  // lensSlice ---------------------------------------------------------
  it("lensSlice: get returns the sub-array slice", () => {
    const l = L.lensSlice(1, 3);
    expect(l.get([0, 1, 2, 3, 4])).toEqual([1, 2]);
  });
  it("lensSlice: set replaces the slice", () => {
    const l = L.lensSlice(1, 3);
    expect(l.set([0, 1, 2, 3, 4], [9, 8, 7])).toEqual([0, 9, 8, 7, 3, 4]);
  });
  it("lensSlice: throws on non-integer indices", () => {
    expect(() => L.lensSlice(1.5, 3)).toThrow(/integers/);
  });
  it("lensSlice: throws on end < start", () => {
    expect(() => L.lensSlice(3, 1)).toThrow(/0 <= start <= end/);
  });
  it("lensSlice: set throws on end beyond array length", () => {
    const l = L.lensSlice(1, 10);
    expect(() => l.set([0, 1, 2], [9])).toThrow(/end exceeds array length/);
  });

  // lensAppend / lensPrepend --------------------------------------------
  it("lensAppend: get returns undefined", () => {
    expect(L.lensAppend().get([1, 2, 3])).toBeUndefined();
  });
  it("lensAppend: set appends the value", () => {
    expect(L.lensAppend().set([1, 2, 3], 4)).toEqual([1, 2, 3, 4]);
  });
  it("lensAppend: set with undefined is a no-op", () => {
    expect(L.lensAppend().set([1, 2, 3], undefined)).toEqual([1, 2, 3]);
  });
  it("lensPrepend: set prepends the value", () => {
    expect(L.lensPrepend().set([1, 2, 3], 0)).toEqual([0, 1, 2, 3]);
  });

  // lensHead / lensTail -------------------------------------------------
  it("lensHead: get returns the first element", () => {
    expect(L.lensHead().get([1, 2, 3])).toBe(1);
  });
  it("lensHead: get on empty array returns undefined", () => {
    expect(L.lensHead().get([])).toBeUndefined();
  });
  it("lensHead: set on non-empty array replaces the first element", () => {
    expect(L.lensHead().set([1, 2, 3], 99)).toEqual([99, 2, 3]);
  });
  it("lensHead: set on empty array creates a single-element array", () => {
    expect(L.lensHead().set([], 7)).toEqual([7]);
  });
  it("lensHead: set with undefined drops the first element", () => {
    expect(L.lensHead().set([1, 2, 3], undefined)).toEqual([2, 3]);
  });
  it("lensTail: get returns the tail of the array", () => {
    expect(L.lensTail().get([1, 2, 3])).toEqual([2, 3]);
  });
  it("lensTail: get on empty array returns empty", () => {
    expect(L.lensTail().get([])).toEqual([]);
  });
  it("lensTail: set replaces the tail, preserves the head", () => {
    expect(L.lensTail().set([1, 2, 3], [9, 8, 7])).toEqual([1, 9, 8, 7]);
  });

  // lensDefault --------------------------------------------------------
  it("lensDefault: get returns the focus when defined", () => {
    const base = L.lensWhere<number>((x) => x > 2);
    const l = L.lensDefault(base, 0);
    expect(l.get([1, 2, 3, 4])).toBe(3);
  });
  it("lensDefault: get returns the default when focus is undefined", () => {
    const base = L.lensWhere<number>((x) => x > 100);
    const l = L.lensDefault(base, 0);
    expect(l.get([1, 2, 3])).toBe(0);
  });
  it("lensDefault: set delegates to the underlying lens", () => {
    const base = L.lensWhere<number>((x) => x > 2);
    const l = L.lensDefault(base, 0);
    expect(l.set([1, 2, 3, 4], 99)).toEqual([1, 2, 99, 4]);
  });
  it("lensDefault: throws on non-lens base", () => {
    expect(() => L.lensDefault(null as any, 0)).toThrow(/expected a lens/);
  });

  // lensChoice ---------------------------------------------------------
  it("lensChoice: get prefers l1 when defined", () => {
    const l1 = L.lensWhere<number>((x) => x > 2);
    const l2 = L.lensWhere<number>((x) => x < 0);
    const l = L.lensChoice(l1, l2);
    expect(l.get([1, 2, 3])).toBe(3);
  });
  it("lensChoice: get falls back to l2 when l1 undefined", () => {
    const l1 = L.lensWhere<number>((x) => x > 100);
    const l2 = L.lensWhere<number>((x) => x < 0);
    const l = L.lensChoice(l1, l2);
    expect(l.get([1, 2, 3])).toBeUndefined();
    expect(l.get([1, 2, -3])).toBe(-3);
  });
  it("lensChoice: set writes to l1 when l1 defined", () => {
    const l1 = L.lensWhere<number>((x) => x > 2);
    const l2 = L.lensWhere<number>((x) => x < 0);
    const l = L.lensChoice(l1, l2);
    expect(l.set([1, 2, 3, 4], 99)).toEqual([1, 2, 99, 4]);
  });
  it("lensChoice: set writes to l2 when l1 undefined", () => {
    const l1 = L.lensWhere<number>((x) => x > 100);
    const l2 = L.lensWhere<number>((x) => x < 0);
    const l = L.lensChoice(l1, l2);
    expect(l.set([1, 2, -3], -99)).toEqual([1, 2, -99]);
  });
  it("lensChoice: throws on non-lens args", () => {
    expect(() => L.lensChoice(null as any, L.lensHead())).toThrow(/expected a lens/);
  });

  // lensIso ------------------------------------------------------------
  it("lensIso: get converts the focus via iso.to", () => {
    const iso = { to: (n: number) => String(n), from: (s: string) => Number(s) };
    const base = L.lensWhere<number>((x) => x > 2);
    const l = L.lensIso(iso, base);
    expect(l.get([1, 2, 3, 4])).toBe("3");
  });
  it("lensIso: set converts the value via iso.from, writes through base", () => {
    const iso = { to: (n: number) => String(n), from: (s: string) => Number(s) };
    const base = L.lensWhere<number>((x) => x > 2);
    const l = L.lensIso(iso, base);
    expect(l.set([1, 2, 3, 4], "99")).toEqual([1, 2, 99, 4]);
  });
  it("lensIso: throws on non-iso input", () => {
    expect(() => L.lensIso(null as any, L.lensHead())).toThrow(/iso must be/);
  });

  // Purity -------------------------------------------------------------
  it("lensWhere: set does not mutate the input", () => {
    const l = L.lensWhere<number>((x) => x > 2);
    const arr = [1, 2, 3, 4];
    const before = arr.slice();
    l.set(arr, 99);
    expect(arr).toEqual(before);
  });
  it("lensRecord: set does not mutate the input", () => {
    const l = L.lensRecord(["a"]);
    const obj = { a: 1, b: 2 };
    l.set(obj, { a: 99 });
    expect(obj).toEqual({ a: 1, b: 2 });
  });
});
