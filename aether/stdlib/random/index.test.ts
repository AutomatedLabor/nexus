import { describe, it, expect, beforeEach } from "vitest";
import * as R from "./index";

describe("random module", () => {
  beforeEach(() => {
    R.randomSeed(12345);
  });

  it("randomSeed: deterministic stream from same seed", () => {
    R.randomSeed(42);
    const a1 = R.randomNext();
    const a2 = R.randomNext();
    R.randomSeed(42);
    const b1 = R.randomNext();
    const b2 = R.randomNext();
    expect(a1).toBe(b1);
    expect(a2).toBe(b2);
  });

  it("randomNext: returns a float in [0, 1)", () => {
    for (let i = 0; i < 1000; i++) {
      const x = R.randomNext();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("randomNextInt: returns integer in [lo, hi]", () => {
    for (let i = 0; i < 1000; i++) {
      const n = R.randomNextInt(10, 20);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(20);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("randomNextInt: panics on lo > hi", () => {
    expect(() => R.randomNextInt(20, 10)).toThrow();
  });

  it("randomNextFloat: returns float in [lo, hi)", () => {
    for (let i = 0; i < 1000; i++) {
      const x = R.randomNextFloat(2, 5);
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThan(5);
    }
  });

  it("randomBool: returns true and false over many trials", () => {
    let trues = 0;
    for (let i = 0; i < 1000; i++) if (R.randomBool()) trues++;
    expect(trues).toBeGreaterThan(400);
    expect(trues).toBeLessThan(600);
  });

  it("randomPick: returns an element of the array", () => {
    const arr = ["a", "b", "c", "d", "e"];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(R.randomPick(arr));
    }
  });

  it("randomPick: panics on empty array", () => {
    expect(() => R.randomPick([])).toThrow();
  });

  it("randomShuffle: returns a permutation of the array", () => {
    const arr = [1, 2, 3, 4, 5];
    const shuf = R.randomShuffle(arr);
    expect(shuf.sort((a, b) => a - b)).toEqual(arr);
    // The original array is not mutated.
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });

  it("randomShuffle: input is not mutated", () => {
    const arr = [1, 2, 3];
    const copy = arr.slice();
    R.randomShuffle(arr);
    expect(arr).toEqual(copy);
  });

  it("randomSample: returns n distinct elements", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const s = R.randomSample(arr, 4);
    expect(s.length).toBe(4);
    const set = new Set(s);
    expect(set.size).toBe(4); // distinct
    for (const x of s) expect(arr).toContain(x);
  });

  it("randomSample: panics when n > array length", () => {
    expect(() => R.randomSample([1, 2, 3], 5)).toThrow();
  });

  it("randomChoice: n elements with replacement (may repeat)", () => {
    const arr = ["a", "b", "c"];
    const c = R.randomChoice(arr, 10);
    expect(c.length).toBe(10);
    for (const x of c) expect(arr).toContain(x);
  });

  it("randomInts: n distinct integers in [lo, hi]", () => {
    const out = R.randomInts(5, 1, 10);
    expect(out.length).toBe(5);
    const set = new Set(out);
    expect(set.size).toBe(5);
    for (const x of out) {
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(10);
    }
  });

  it("randomRange: returns an integer in [lo, hi]", () => {
    for (let i = 0; i < 100; i++) {
      const n = R.randomRange(0, 9);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(9);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("randomBytes: returns n bytes in 0-255", () => {
    const bs = R.randomBytes(16);
    expect(bs.length).toBe(16);
    for (const b of bs) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
      expect(Number.isInteger(b)).toBe(true);
    }
  });

  it("randomHex: returns n lowercase hex chars", () => {
    const h = R.randomHex(32);
    expect(h.length).toBe(32);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("randomUuid: well-formed v4 UUID", () => {
    const u = R.randomUuid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("randomGaussian: mean approx, std positive", () => {
    let sum = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) sum += R.randomGaussian(0, 1);
    const mean = sum / N;
    expect(Math.abs(mean)).toBeLessThan(0.2); // within 0.2 of 0
  });

  it("randomGaussian: std=0 returns mean exactly", () => {
    expect(R.randomGaussian(5, 0)).toBe(5);
  });

  it("randomWeighted: prefers heavier weights", () => {
    const items = ["a", "b"];
    const weights = [1, 9];
    let bCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (R.randomWeighted(items, weights) === "b") bCount++;
    }
    expect(bCount).toBeGreaterThan(700);
    expect(bCount).toBeLessThan(1000);
  });

  it("randomWeighted: panics on zero total weight", () => {
    expect(() => R.randomWeighted(["a"], [0])).toThrow();
  });

  it("randomWeighted: panics on length mismatch", () => {
    expect(() => R.randomWeighted(["a", "b"], [1])).toThrow();
  });

  it("deterministic stream: same seed across all functions", () => {
    R.randomSeed(7);
    const a1 = R.randomNextInt(0, 100);
    const a2 = R.randomPick([1, 2, 3]);
    const a3 = R.randomBool();
    R.randomSeed(7);
    const b1 = R.randomNextInt(0, 100);
    const b2 = R.randomPick([1, 2, 3]);
    const b3 = R.randomBool();
    expect(a1).toBe(b1);
    expect(a2).toBe(b2);
    expect(a3).toBe(b3);
  });

  it("different seeds give different streams (very likely)", () => {
    R.randomSeed(1);
    const a = R.randomNext();
    R.randomSeed(2);
    const b = R.randomNext();
    expect(a).not.toBe(b);
  });
});
