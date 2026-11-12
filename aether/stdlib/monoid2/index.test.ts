import { describe, it, expect } from "vitest";
import * as M from "./index";
import * as M1 from "../monoid";

describe("monoid2 module", () => {
  // monoidEndo -----------------------------------------------------------
  it("monoidEndo: empty is identity", () => {
    const m = M.monoidEndo<number>();
    expect(m.empty(42)).toBe(42);
  });
  it("monoidEndo: combine composes (g runs first)", () => {
    const m = M.monoidEndo<number>();
    const f = (x: number) => x + 1;
    const g = (x: number) => x * 2;
    const fg = m.combine(f, g);
    expect(fg(3)).toBe(7); // g(3)=6, f(6)=7
  });
  it("monoidEndo: combineAll folds a list of transformers", () => {
    const m = M.monoidEndo<number>();
    const composed = m.combineAll([(x) => x + 1, (x) => x * 2, (x) => x - 3]);
    // right-to-left: ((3 - 3) * 2) + 1 = 1
    expect(composed(3)).toBe(1);
  });
  it("monoidEndo: combineAll empty -> identity", () => {
    const m = M.monoidEndo<string>();
    expect(m.combineAll([])("hi")).toBe("hi");
  });

  // monoidDual -----------------------------------------------------------
  it("monoidDual: combine reversed", () => {
    const sum = M1.monoidSum();
    const dual = M.monoidDual(sum);
    // dual.combine(a, b) === sum.combine(b, a) === a + b (addition is commutative)
    expect(dual.combine(3, 4)).toBe(7);
  });
  it("monoidDual: difference is visible for non-commutative monoids", () => {
    // String concatenation is NOT commutative.
    const str = M1.monoidString();
    const dual = M.monoidDual(str);
    expect(str.combine("a", "b")).toBe("ab");
    expect(dual.combine("a", "b")).toBe("ba");
  });
  it("monoidDual: combineAll reverses the fold order", () => {
    const str = M1.monoidString();
    const dual = M.monoidDual(str);
    // Dual fold: combine accumulator with each element from left to right
    // but the combine flips, so:
    //   start=""
    //   combine("", "a") = "a"
    //   combine("a", "b") = "b" + "a" = "ba"
    //   combine("ba", "c") = "c" + "ba" = "cba"
    expect(dual.combineAll(["a", "b", "c"])).toBe("cba");
  });
  it("monoidDual: throws on non-monoid", () => {
    expect(() => M.monoidDual(null as any)).toThrow(/expected a Monoid/);
  });

  // monoidCount ---------------------------------------------------------
  it("monoidCount: empty is 0", () => {
    expect(M.monoidCount().empty).toBe(0);
  });
  it("monoidCount: combine ignores b and increments", () => {
    const m = M.monoidCount();
    expect(m.combine(3, 100)).toBe(4);
    expect(m.combine(0, 1)).toBe(1);
  });
  it("monoidCount: combineAll returns the array length", () => {
    const m = M.monoidCount();
    expect(m.combineAll([10, 20, 30, 40])).toBe(4);
    expect(m.combineAll([])).toBe(0);
  });

  // monoidSumAndCount ---------------------------------------------------
  it("monoidSumAndCount: empty is [0, 0]", () => {
    expect(M.monoidSumAndCount().empty).toEqual([0, 0]);
  });
  it("monoidSumAndCount: combine with a number adds to sum and count", () => {
    const m = M.monoidSumAndCount();
    expect(m.combine([0, 0], 5)).toEqual([5, 1]);
    expect(m.combine([5, 1], 7)).toEqual([12, 2]);
  });
  it("monoidSumAndCount: combine with a pair merges both", () => {
    const m = M.monoidSumAndCount();
    expect(m.combine([5, 1], [7, 2])).toEqual([12, 3]);
  });
  it("monoidSumAndCount: combineAll produces (sum, count) for averaging", () => {
    const m = M.monoidSumAndCount();
    const r = m.combineAll([1, 2, 3, 4, 5]);
    expect(r).toEqual([15, 5]);
    expect(r[0] / r[1]).toBe(3);
  });
  it("monoidSumAndCount: combineAll empty -> [0, 0]", () => {
    expect(M.monoidSumAndCount().combineAll([])).toEqual([0, 0]);
  });
  it("monoidSumAndCount: throws on non-number non-pair", () => {
    const m = M.monoidSumAndCount();
    expect(() => m.combine([0, 0], "x" as any)).toThrow(/must be a number or/);
  });

  // monoidSetUnion ------------------------------------------------------
  it("monoidSetUnion: empty is []", () => {
    expect(M.monoidSetUnion().empty).toEqual([]);
  });
  it("monoidSetUnion: combine deduplicates", () => {
    const m = M.monoidSetUnion<number>();
    expect(m.combine([1, 2, 3], [2, 3, 4])).toEqual([1, 2, 3, 4]);
  });
  it("monoidSetUnion: combineAll flattens with dedup", () => {
    const m = M.monoidSetUnion<number>();
    expect(m.combineAll([[1, 2], [2, 3], [3, 4], [4, 5]])).toEqual([1, 2, 3, 4, 5]);
  });
  it("monoidSetUnion: combineAll empty -> []", () => {
    expect(M.monoidSetUnion().combineAll([])).toEqual([]);
  });

  // monoidIntersect -----------------------------------------------------
  it("monoidIntersect: empty is []", () => {
    expect(M.monoidIntersect().empty).toEqual([]);
  });
  it("monoidIntersect: combine returns intersection in a's order", () => {
    const m = M.monoidIntersect<number>();
    expect(m.combine([1, 2, 3, 4], [2, 4, 6])).toEqual([2, 4]);
  });
  it("monoidIntersect: combineAll finds common subset", () => {
    const m = M.monoidIntersect<number>();
    expect(m.combineAll([[1, 2, 3], [2, 3, 4], [3, 4, 5]])).toEqual([3]);
  });
  it("monoidIntersect: combineAll empty -> []", () => {
    expect(M.monoidIntersect().combineAll([])).toEqual([]);
  });

  // monoidDict ---------------------------------------------------------
  it("monoidDict: empty is {}", () => {
    expect(M.monoidDict().empty).toEqual({});
  });
  it("monoidDict: combine is shallow merge (right wins)", () => {
    const m = M.monoidDict<number>();
    expect(m.combine({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });
  it("monoidDict: combineAll merges records right-to-left", () => {
    const m = M.monoidDict<number>();
    const r = m.combineAll([{ a: 1 }, { a: 2, b: 3 }, { b: 4 }]);
    expect(r).toEqual({ a: 2, b: 4 });
  });
  it("monoidDict: combineAll empty -> {}", () => {
    expect(M.monoidDict().combineAll([])).toEqual({});
  });
  it("monoidDict: throws on array input", () => {
    const m = M.monoidDict();
    expect(() => m.combine({}, [1, 2] as any)).toThrow(/plain object/);
  });

  // monoidMaybe ---------------------------------------------------------
  it("monoidMaybe: empty is null", () => {
    expect(M.monoidMaybe(M1.monoidSum()).empty).toBeNull();
  });
  it("monoidMaybe: combine(null, x) returns x", () => {
    const m = M.monoidMaybe(M1.monoidSum());
    expect(m.combine(null, 5)).toBe(5);
  });
  it("monoidMaybe: combine(x, null) returns x", () => {
    const m = M.monoidMaybe(M1.monoidSum());
    expect(m.combine(5, null)).toBe(5);
  });
  it("monoidMaybe: combine(x, y) uses underlying combine", () => {
    const m = M.monoidMaybe(M1.monoidSum());
    expect(m.combine(5, 7)).toBe(12);
  });
  it("monoidMaybe: combineAll skips nulls", () => {
    const m = M.monoidMaybe(M1.monoidSum());
    expect(m.combineAll([null, 1, null, 2, null, 3, null])).toBe(6);
  });
  it("monoidMaybe: combineAll all null -> null", () => {
    const m = M.monoidMaybe(M1.monoidSum());
    expect(m.combineAll([null, null, null])).toBeNull();
  });
  it("monoidMaybe: throws on non-monoid base", () => {
    expect(() => M.monoidMaybe(null as any)).toThrow(/expected a Monoid/);
  });

  // monoidFirstNonEmpty -------------------------------------------------
  it("monoidFirstNonEmpty: empty is ''", () => {
    expect(M.monoidFirstNonEmpty<string>().empty).toBe("");
  });
  it("monoidFirstNonEmpty: combine keeps first non-empty", () => {
    const m = M.monoidFirstNonEmpty<string>();
    expect(m.combine("", "x")).toBe("x");
    expect(m.combine("x", "")).toBe("x");
    expect(m.combine("x", "y")).toBe("x");
  });
  it("monoidFirstNonEmpty: combineAll finds first non-empty", () => {
    const m = M.monoidFirstNonEmpty<string>();
    expect(m.combineAll(["", "", "hello", "world"])).toBe("hello");
    expect(m.combineAll(["", "", ""])).toBe("");
  });
  it("monoidFirstNonEmpty: works with arrays too", () => {
    const m = M.monoidFirstNonEmpty<number[]>();
    expect(m.combineAll([[], [], [1, 2], [3]])).toEqual([1, 2]);
  });

  // monoidLastNonEmpty --------------------------------------------------
  it("monoidLastNonEmpty: empty is ''", () => {
    expect(M.monoidLastNonEmpty<string>().empty).toBe("");
  });
  it("monoidLastNonEmpty: combine keeps last non-empty", () => {
    const m = M.monoidLastNonEmpty<string>();
    expect(m.combine("", "x")).toBe("x");
    expect(m.combine("x", "")).toBe("x");
    expect(m.combine("x", "y")).toBe("y");
  });
  it("monoidLastNonEmpty: combineAll finds last non-empty", () => {
    const m = M.monoidLastNonEmpty<string>();
    expect(m.combineAll(["a", "b", "", ""])).toBe("b");
    expect(m.combineAll(["", "", ""])).toBe("");
  });

  // Monoid laws ---------------------------------------------------------
  it("monoidCount: identity law (combine with empty == +1)", () => {
    const m = M.monoidCount();
    expect(m.combine(m.empty, 999)).toBe(1);
  });
  it("monoidSetUnion: identity law (combine with empty == self)", () => {
    const m = M.monoidSetUnion<number>();
    expect(m.combine(m.empty, [1, 2, 3])).toEqual([1, 2, 3]);
    expect(m.combine([1, 2, 3], m.empty)).toEqual([1, 2, 3]);
  });
  it("monoidDict: identity law (combine with empty == self)", () => {
    const m = M.monoidDict<number>();
    const x = { a: 1 };
    expect(m.combine(m.empty, x)).toEqual(x);
    expect(m.combine(x, m.empty)).toEqual(x);
  });
});
