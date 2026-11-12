import { describe, it, expect } from "vitest";
import * as I from "./index";

describe("interval module", () => {
  it("intervalNew: creates empty tree", () => {
    const t = I.intervalNew();
    expect(t.root).toBeNull();
    expect(I.intervalSize(t)).toBe(0);
    expect(I.intervalMin(t)).toBeUndefined();
    expect(I.intervalMax(t)).toBeUndefined();
    expect(I.intervalToSortedArray(t)).toEqual([]);
  });

  it("intervalInsert: adds intervals and increments size", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "a");
    I.intervalInsert(t, 10, 20, "b");
    I.intervalInsert(t, 15, 25, "c");
    expect(I.intervalSize(t)).toBe(3);
    expect(t.root).not.toBeNull();
  });

  it("intervalInsert: chainable", () => {
    const t = I.intervalNew();
    expect(I.intervalInsert(t, 1, 5)).toBe(t);
    expect(I.intervalSize(t)).toBe(1);
  });

  it("intervalInsert: throws on low > high", () => {
    const t = I.intervalNew();
    expect(() => I.intervalInsert(t, 10, 5)).toThrow();
  });

  it("intervalInsert: accepts duplicate (low, high) pairs", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "x");
    I.intervalInsert(t, 1, 5, "y");
    expect(I.intervalSize(t)).toBe(2);
  });

  it("intervalSearchPoint: finds containing interval", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "a");
    I.intervalInsert(t, 10, 20, "b");
    I.intervalInsert(t, 30, 40, "c");
    expect(I.intervalSearchPoint(t, 3)).toBe("a");
    expect(I.intervalSearchPoint(t, 15)).toBe("b");
    expect(I.intervalSearchPoint(t, 35)).toBe("c");
  });

  it("intervalSearchPoint: returns undefined for gaps", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "a");
    I.intervalInsert(t, 10, 20, "b");
    expect(I.intervalSearchPoint(t, 0)).toBeUndefined();
    expect(I.intervalSearchPoint(t, 5)).toBeUndefined();   // half-open: 5 not in [1,5)
    expect(I.intervalSearchPoint(t, 7)).toBeUndefined();
    expect(I.intervalSearchPoint(t, 100)).toBeUndefined();
  });

  it("intervalSearchPoint: half-open boundary check", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 0, 10, "x");
    expect(I.intervalSearchPoint(t, 0)).toBe("x");
    expect(I.intervalSearchPoint(t, 9)).toBe("x");
    expect(I.intervalSearchPoint(t, 10)).toBeUndefined();
  });

  it("intervalSearchRange: finds overlapping interval", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "a");
    I.intervalInsert(t, 10, 20, "b");
    I.intervalInsert(t, 30, 40, "c");
    expect(I.intervalSearchRange(t, 4, 6)).toBe("a");    // overlaps [1,5)
    expect(I.intervalSearchRange(t, 19, 25)).toBe("b"); // overlaps [10,20)
    expect(I.intervalSearchRange(t, 35, 50)).toBe("c");
  });

  it("intervalSearchRange: no overlap returns undefined", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "a");
    I.intervalInsert(t, 10, 20, "b");
    expect(I.intervalSearchRange(t, 5, 10)).toBeUndefined();  // half-open: [5,10) doesn't overlap [1,5) or [10,20)
    expect(I.intervalSearchRange(t, 100, 200)).toBeUndefined();
  });

  it("intervalSearchRange: adjacent at boundary returns undefined (half-open)", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 0, 10, "x");
    expect(I.intervalSearchRange(t, 10, 20)).toBeUndefined();
  });

  it("intervalSearchAll: returns all overlapping intervals", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 10, "a");
    I.intervalInsert(t, 5, 15, "b");
    I.intervalInsert(t, 12, 20, "c");
    I.intervalInsert(t, 30, 40, "d");
    const hits = I.intervalSearchAll(t, 6, 14);
    expect(hits.length).toBe(3);
    const vals = hits.map((h) => h.value).sort();
    expect(vals).toEqual(["a", "b", "c"]);
  });

  it("intervalSearchAll: returns empty for no overlap", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "a");
    expect(I.intervalSearchAll(t, 100, 200)).toEqual([]);
  });

  it("intervalDelete: removes a matching interval", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "a");
    I.intervalInsert(t, 10, 20, "b");
    expect(I.intervalDelete(t, 10, 20)).toBe(true);
    expect(I.intervalSize(t)).toBe(1);
    expect(I.intervalSearchPoint(t, 15)).toBeUndefined();
    expect(I.intervalSearchPoint(t, 3)).toBe("a");
  });

  it("intervalDelete: returns false for missing interval", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "a");
    expect(I.intervalDelete(t, 1, 10)).toBe(false);   // same low, different high
    expect(I.intervalDelete(t, 100, 200)).toBe(false);
    expect(I.intervalSize(t)).toBe(1);
  });

  it("intervalDelete: removes one of duplicate (low, high)", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "x");
    I.intervalInsert(t, 1, 5, "y");
    expect(I.intervalSize(t)).toBe(2);
    expect(I.intervalDelete(t, 1, 5)).toBe(true);
    expect(I.intervalSize(t)).toBe(1);
    expect(I.intervalDelete(t, 1, 5)).toBe(true);
    expect(I.intervalSize(t)).toBe(0);
    expect(I.intervalDelete(t, 1, 5)).toBe(false);
  });

  it("intervalDelete: tree remains valid after deletion", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 5, 10, "a");
    I.intervalInsert(t, 1, 4, "b");
    I.intervalInsert(t, 15, 20, "c");
    I.intervalInsert(t, 7, 12, "d");
    I.intervalDelete(t, 5, 10);
    expect(I.intervalSize(t)).toBe(3);
    // After deletion, the tree's `max` should still be correct.
    expect(I.intervalMax(t)).toBe(20);
    expect(I.intervalMin(t)).toBe(1);
    // The deleted interval (5,10) is gone; (7,12,'d') still contains 8.
    expect(I.intervalSearchPoint(t, 8)).toBe("d");
    expect(I.intervalSearchPoint(t, 2)).toBe("b");
    expect(I.intervalSearchPoint(t, 17)).toBe("c");
    // Point 5 is no longer in any interval: deleted [5,10), and [1,4) is half-open at 4.
    expect(I.intervalSearchPoint(t, 5)).toBeUndefined();
  });

  it("intervalMin / intervalMax: track endpoints", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 5, 10);
    I.intervalInsert(t, 1, 4);
    I.intervalInsert(t, 15, 20);
    expect(I.intervalMin(t)).toBe(1);
    expect(I.intervalMax(t)).toBe(20);
  });

  it("intervalMin / intervalMax: undefined on empty", () => {
    const t = I.intervalNew();
    expect(I.intervalMin(t)).toBeUndefined();
    expect(I.intervalMax(t)).toBeUndefined();
  });

  it("intervalToSortedArray: in-order by low", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 5, 10, "c");
    I.intervalInsert(t, 1, 4, "a");
    I.intervalInsert(t, 3, 6, "b");
    const arr = I.intervalToSortedArray(t);
    expect(arr.map((x) => x.low)).toEqual([1, 3, 5]);
    expect(arr.map((x) => x.value)).toEqual(["a", "b", "c"]);
  });

  it("intervalToSortedArray: returns empty for empty tree", () => {
    const t = I.intervalNew();
    expect(I.intervalToSortedArray(t)).toEqual([]);
  });

  it("intervalSearchPoint: works after many random-shaped insertions", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 10, 20, "a");
    I.intervalInsert(t, 5, 15, "b");
    I.intervalInsert(t, 1, 8, "c");
    I.intervalInsert(t, 12, 25, "d");
    I.intervalInsert(t, 18, 30, "e");
    // Point 7 is in BOTH [1,8) and [5,15); the algorithm returns any one match.
    const v7 = I.intervalSearchPoint(t, 7);
    expect(v7 === "b" || v7 === "c").toBe(true);
    // Point 27 is only in [18,30).
    expect(I.intervalSearchPoint(t, 27)).toBe("e");
    // Point 100 is in nothing.
    expect(I.intervalSearchPoint(t, 100)).toBeUndefined();
    // Point 11 is in [10,20) and [5,15).
    const v11 = I.intervalSearchPoint(t, 11);
    expect(v11 === "a" || v11 === "b").toBe(true);
    // Point 24 is in [12,25) and [18,30).
    const v24 = I.intervalSearchPoint(t, 24);
    expect(v24 === "d" || v24 === "e").toBe(true);
  });

  it("intervalSearchAll: returns array of {low, high, value} triples", () => {
    const t = I.intervalNew();
    I.intervalInsert(t, 1, 5, "a");
    I.intervalInsert(t, 3, 8, "b");
    const hits = I.intervalSearchAll(t, 0, 100);
    expect(hits.length).toBe(2);
    expect(hits[0]).toHaveProperty("low");
    expect(hits[0]).toHaveProperty("high");
    expect(hits[0]).toHaveProperty("value");
  });

  it("intervalInsert: validates types", () => {
    const t = I.intervalNew();
    expect(() => I.intervalInsert(null as any, 1, 2)).toThrow();
    expect(() => I.intervalInsert(t, "x" as any, 2)).toThrow();
    expect(() => I.intervalInsert(t, 1, NaN)).toThrow();
    expect(() => I.intervalInsert(t, Infinity, 10)).toThrow();
  });

  it("intervalSearchPoint: validates types", () => {
    const t = I.intervalNew();
    expect(() => I.intervalSearchPoint(null as any, 1)).toThrow();
    expect(() => I.intervalSearchPoint(t, "x" as any)).toThrow();
  });

  it("intervalSize: validates types", () => {
    expect(() => I.intervalSize(null as any)).toThrow();
    expect(() => I.intervalSize({} as any)).toThrow();
  });
});
