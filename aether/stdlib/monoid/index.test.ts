import { describe, it, expect } from "vitest";
import * as M from "./index";

describe("monoid module", () => {
  // monoidSum -----------------------------------------------------------
  it("monoidSum: empty is 0", () => {
    expect(M.monoidSum().empty).toBe(0);
  });
  it("monoidSum: combine adds", () => {
    const m = M.monoidSum();
    expect(m.combine(3, 4)).toBe(7);
  });
  it("monoidSum: combineAll sums array", () => {
    expect(M.monoidSum().combineAll([1, 2, 3, 4, 5])).toBe(15);
  });
  it("monoidSum: combineAll empty array -> 0", () => {
    expect(M.monoidSum().combineAll([])).toBe(0);
  });

  // monoidProduct -------------------------------------------------------
  it("monoidProduct: empty is 1", () => {
    expect(M.monoidProduct().empty).toBe(1);
  });
  it("monoidProduct: combine multiplies", () => {
    expect(M.monoidProduct().combine(3, 4)).toBe(12);
  });
  it("monoidProduct: combineAll product", () => {
    expect(M.monoidProduct().combineAll([1, 2, 3, 4])).toBe(24);
  });
  it("monoidProduct: combineAll empty -> 1", () => {
    expect(M.monoidProduct().combineAll([])).toBe(1);
  });

  // monoidString --------------------------------------------------------
  it("monoidString: empty is ''", () => {
    expect(M.monoidString().empty).toBe("");
  });
  it("monoidString: combine concatenates", () => {
    expect(M.monoidString().combine("foo", "bar")).toBe("foobar");
  });
  it("monoidString: combineAll joins strings", () => {
    expect(M.monoidString().combineAll(["a", "b", "c"])).toBe("abc");
  });

  // monoidArray ---------------------------------------------------------
  it("monoidArray: empty is []", () => {
    const e = M.monoidArray().empty;
    expect(Array.isArray(e)).toBe(true);
    expect(e.length).toBe(0);
  });
  it("monoidArray: combine concatenates", () => {
    expect(M.monoidArray().combine([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
  });
  it("monoidArray: combineAll flattens", () => {
    expect(M.monoidArray().combineAll([[1], [2, 3], [4]])).toEqual([1, 2, 3, 4]);
  });

  // monoidAnd / monoidOr ------------------------------------------------
  it("monoidAnd: empty is true", () => {
    expect(M.monoidAnd().empty).toBe(true);
  });
  it("monoidAnd: combine is &&", () => {
    const m = M.monoidAnd();
    expect(m.combine(true, true)).toBe(true);
    expect(m.combine(true, false)).toBe(false);
    expect(m.combine(false, true)).toBe(false);
  });
  it("monoidAnd: combineAll over booleans", () => {
    expect(M.monoidAnd().combineAll([true, true, true])).toBe(true);
    expect(M.monoidAnd().combineAll([true, false, true])).toBe(false);
  });
  it("monoidOr: empty is false", () => {
    expect(M.monoidOr().empty).toBe(false);
  });
  it("monoidOr: combine is ||", () => {
    const m = M.monoidOr();
    expect(m.combine(false, false)).toBe(false);
    expect(m.combine(false, true)).toBe(true);
  });
  it("monoidOr: combineAll over booleans", () => {
    expect(M.monoidOr().combineAll([false, false, false])).toBe(false);
    expect(M.monoidOr().combineAll([false, true, false])).toBe(true);
  });

  // monoidMax / monoidMin ----------------------------------------------
  it("monoidMax: empty is -Infinity", () => {
    expect(M.monoidMax().empty).toBe(-Infinity);
  });
  it("monoidMax: combine is Math.max", () => {
    expect(M.monoidMax().combine(3, 7)).toBe(7);
  });
  it("monoidMax: combineAll finds max", () => {
    expect(M.monoidMax().combineAll([3, 1, 4, 1, 5, 9, 2, 6])).toBe(9);
  });
  it("monoidMax: combineAll empty -> -Infinity", () => {
    expect(M.monoidMax().combineAll([])).toBe(-Infinity);
  });
  it("monoidMin: empty is +Infinity", () => {
    expect(M.monoidMin().empty).toBe(Infinity);
  });
  it("monoidMin: combine is Math.min", () => {
    expect(M.monoidMin().combine(3, 7)).toBe(3);
  });
  it("monoidMin: combineAll finds min", () => {
    expect(M.monoidMin().combineAll([3, 1, 4, 1, 5, 9, 2, 6])).toBe(1);
  });

  // monoidFirst / monoidLast --------------------------------------------
  it("monoidFirst: empty is null", () => {
    expect(M.monoidFirst().empty).toBeNull();
  });
  it("monoidFirst: combine keeps first non-null", () => {
    const m = M.monoidFirst();
    expect(m.combine(null, "x")).toBe("x");
    expect(m.combine("x", null)).toBe("x");
    expect(m.combine("x", "y")).toBe("x");
  });
  it("monoidFirst: combineAll finds first non-null", () => {
    expect(M.monoidFirst().combineAll([null, null, "a", "b", "c"])).toBe("a");
    expect(M.monoidFirst().combineAll([null, null, null])).toBeNull();
  });
  it("monoidLast: empty is null", () => {
    expect(M.monoidLast().empty).toBeNull();
  });
  it("monoidLast: combine keeps last non-null", () => {
    const m = M.monoidLast();
    expect(m.combine(null, "x")).toBe("x");
    expect(m.combine("x", null)).toBe("x");
    expect(m.combine("x", "y")).toBe("y");
  });
  it("monoidLast: combineAll finds last non-null", () => {
    expect(M.monoidLast().combineAll(["a", "b", "c", null, null])).toBe("c");
    expect(M.monoidLast().combineAll([null, null, null])).toBeNull();
  });

  // Monoid laws (quickcheck-style) -------------------------------------
  it("monoidSum: left identity law", () => {
    const m = M.monoidSum();
    expect(m.combine(m.empty, 42)).toBe(42);
  });
  it("monoidSum: right identity law", () => {
    const m = M.monoidSum();
    expect(m.combine(42, m.empty)).toBe(42);
  });
  it("monoidString: associativity law", () => {
    const m = M.monoidString();
    const l = m.combine(m.combine("a", "b"), "c");
    const r = m.combine("a", m.combine("b", "c"));
    expect(l).toBe(r);
    expect(l).toBe("abc");
  });
  it("monoidAnd: identity law (empty=true)", () => {
    const m = M.monoidAnd();
    expect(m.combine(m.empty, false)).toBe(false);
    expect(m.combine(true, m.empty)).toBe(true);
  });
});
