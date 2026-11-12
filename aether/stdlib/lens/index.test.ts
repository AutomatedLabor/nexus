import { describe, it, expect } from "vitest";
import * as L from "./index";

describe("lens module", () => {
  // lensNew / lensGet / lensSet / lensModify ------------------------------
  it("lensNew: builds a working lens", () => {
    const l = L.lensNew(
      (o: any) => o.name,
      (o: any, v: any) => ({ ...o, name: v }),
    );
    expect(L.lensGet(l, { name: "Alice" })).toBe("Alice");
  });
  it("lensNew: panic on non-function args", () => {
    expect(() => L.lensNew("no" as any, () => 0)).toThrow();
  });
  it("lensSet: returns a new object, original untouched", () => {
    const l = L.lensAt("name");
    const a = { name: "Alice", age: 30 };
    const b = L.lensSet(l, a, "Bob");
    expect(b).toEqual({ name: "Bob", age: 30 });
    expect(a).toEqual({ name: "Alice", age: 30 });
  });
  it("lensModify: applies fn to focus", () => {
    const l = L.lensAt("count");
    const a = { count: 10 };
    const b = L.lensModify(l, a, (v: number) => v + 5);
    expect(b).toEqual({ count: 15 });
    expect(a).toEqual({ count: 10 });
  });
  it("lensModify: panic on non-fn", () => {
    const l = L.lensAt("x");
    expect(() => L.lensModify(l, { x: 1 }, "no" as any)).toThrow();
  });

  // lensAt --------------------------------------------------------------
  it("lensAt: get existing key", () => {
    expect(L.lensGet(L.lensAt("a"), { a: 1, b: 2 })).toBe(1);
  });
  it("lensAt: get missing key returns undefined", () => {
    expect(L.lensGet(L.lensAt("a"), { b: 2 })).toBeUndefined();
  });
  it("lensAt: get on null returns undefined", () => {
    expect(L.lensGet(L.lensAt("a"), null as any)).toBeUndefined();
  });
  it("lensAt: set creates/overwrites key", () => {
    const l = L.lensAt("c");
    const a = { a: 1 };
    const b = L.lensSet(l, a, 99);
    expect(b).toEqual({ a: 1, c: 99 });
  });
  it("lensAt: panic on non-string key", () => {
    expect(() => L.lensAt(5 as any)).toThrow();
  });

  // lensIndex -----------------------------------------------------------
  it("lensIndex: get in-bounds", () => {
    expect(L.lensGet(L.lensIndex(2), [10, 20, 30, 40])).toBe(30);
  });
  it("lensIndex: get out-of-bounds returns undefined", () => {
    expect(L.lensGet(L.lensIndex(10), [10, 20])).toBeUndefined();
  });
  it("lensIndex: set in-bounds returns new array", () => {
    const a = [10, 20, 30];
    const b = L.lensSet(L.lensIndex(1), a, 99);
    expect(b).toEqual([10, 99, 30]);
    expect(a).toEqual([10, 20, 30]);
  });
  it("lensIndex: set out-of-bounds throws", () => {
    expect(() => L.lensSet(L.lensIndex(5), [1, 2, 3], 99)).toThrow();
  });
  it("lensIndex: panic on negative index", () => {
    expect(() => L.lensIndex(-1)).toThrow();
  });
  it("lensIndex: panic on non-integer index", () => {
    expect(() => L.lensIndex(1.5)).toThrow();
  });

  // lensPath ------------------------------------------------------------
  it("lensPath: get nested value", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(L.lensGet(L.lensPath(["a", "b", "c"]), obj)).toBe(42);
  });
  it("lensPath: get through array index", () => {
    const obj = { list: [10, 20, 30] };
    expect(L.lensGet(L.lensPath(["list", 1]), obj)).toBe(20);
  });
  it("lensPath: get missing intermediate returns undefined", () => {
    const obj = { a: { b: 1 } };
    expect(L.lensGet(L.lensPath(["a", "x", "y"]), obj)).toBeUndefined();
  });
  it("lensPath: set nested value, original untouched", () => {
    const obj = { a: { b: { c: 1 } }, d: 99 };
    const out = L.lensSet(L.lensPath(["a", "b", "c"]), obj, 42);
    expect(out).toEqual({ a: { b: { c: 42 } }, d: 99 });
    expect(obj).toEqual({ a: { b: { c: 1 } }, d: 99 });
  });
  it("lensPath: set through array index", () => {
    const obj = { list: [10, 20, 30] };
    const out = L.lensSet(L.lensPath(["list", 1]), obj, 99);
    expect(out).toEqual({ list: [10, 99, 30] });
  });
  it("lensPath: panic on bad path element", () => {
    expect(() => L.lensPath(["a", -1] as any)).toThrow();
  });

  // lensProp / lensCompose / lensOptional -------------------------------
  it("lensProp: alias of lensAt", () => {
    const l = L.lensProp("x");
    expect(L.lensGet(l, { x: 7 })).toBe(7);
    expect(L.lensSet(l, { x: 7, y: 8 }, 99)).toEqual({ x: 99, y: 8 });
  });
  it("lensCompose: read focus-of-focus", () => {
    const lOuter = L.lensAt("outer");
    const lInner = L.lensAt("inner");
    const composed = L.lensCompose(lOuter, lInner);
    expect(L.lensGet(composed, { outer: { inner: 42 } })).toBe(42);
  });
  it("lensCompose: write focus-of-focus", () => {
    const composed = L.lensCompose(L.lensAt("outer"), L.lensAt("inner"));
    const obj = { outer: { inner: 1, other: 2 }, extra: 3 };
    const out = L.lensSet(composed, obj, 99);
    expect(out).toEqual({ outer: { inner: 99, other: 2 }, extra: 3 });
    expect(obj).toEqual({ outer: { inner: 1, other: 2 }, extra: 3 });
  });
  it("lensCompose: modify through two lenses", () => {
    const composed = L.lensCompose(L.lensAt("a"), L.lensAt("b"));
    const out = L.lensModify(composed, { a: { b: 10 } }, (v: number) => v * 2);
    expect(out).toEqual({ a: { b: 20 } });
  });
  it("lensOptional: returns undefined when focus missing", () => {
    const inner = L.lensPath(["a", "b", "c"]);
    const opt = L.lensOptional(inner);
    expect(L.lensGet(opt, { a: { b: 1 } })).toBeUndefined();
  });
  it("lensOptional: returns value when focus present", () => {
    const inner = L.lensPath(["a", "b"]);
    const opt = L.lensOptional(inner);
    expect(L.lensGet(opt, { a: { b: 42 } })).toBe(42);
  });
  it("lensOptional: set undefined on missing focus is a no-op", () => {
    const inner = L.lensPath(["a", "x", "y"]);
    const opt = L.lensOptional(inner);
    const obj = { a: { b: 1 } };
    const out = L.lensSet(opt, obj, undefined);
    expect(out).toBe(obj);
  });
  it("lensOptional: set defined value when focus exists forwards to inner", () => {
    const inner = L.lensAt("x");
    const opt = L.lensOptional(inner);
    const out = L.lensSet(opt, { x: 1, y: 2 }, 99);
    expect(out).toEqual({ x: 99, y: 2 });
  });
});
