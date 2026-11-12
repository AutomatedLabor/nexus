import { describe, it, expect } from "vitest";
import * as B from "./index";

describe("bloom module", () => {
  it("bloomNew: default fp rate", () => {
    const bf = B.new_(100);
    expect(B.count(bf)).toBe(0);
    expect(B.capacity(bf)).toBe(100);
    expect(B.hash_funcs(bf)).toBeGreaterThan(0);
  });

  it("bloomNew: smaller fp_rate → larger m", () => {
    const loose = B.new_(100, 0.1);
    const tight = B.new_(100, 0.001);
    expect(tight.m).toBeGreaterThan(loose.m);
    expect(tight.k).toBeGreaterThanOrEqual(loose.k);
  });

  it("bloomNew: rejects non-positive expected", () => {
    expect(() => B.new_(0 as any)).toThrow();
    expect(() => B.new_(-1 as any)).toThrow();
    expect(() => B.new_(NaN)).toThrow();
  });

  it("bloomNew: rejects out-of-range fp_rate", () => {
    expect(() => B.new_(100, 0)).toThrow();
    expect(() => B.new_(100, 1)).toThrow();
    expect(() => B.new_(100, -0.1)).toThrow();
  });

  it("bloomAdd: returns the filter (chainable)", () => {
    const bf = B.new_(10);
    expect(B.add(bf, "hello")).toBe(bf);
  });

  it("bloomAdd: increments count", () => {
    const bf = B.new_(10);
    B.add(bf, "a"); B.add(bf, "b"); B.add(bf, "c");
    expect(B.count(bf)).toBe(3);
  });

  it("bloomContains: returns true for added elements", () => {
    const bf = B.new_(50);
    B.add(bf, "apple");
    B.add(bf, "banana");
    expect(B.contains(bf, "apple")).toBe(true);
    expect(B.contains(bf, "banana")).toBe(true);
  });

  it("bloomContains: returns false for not-added elements (no false negatives)", () => {
    const bf = B.new_(50);
    B.add(bf, "apple");
    expect(B.contains(bf, "cherry")).toBe(false);
    expect(B.contains(bf, "date")).toBe(false);
    expect(B.contains(bf, "elderberry")).toBe(false);
  });

  it("bloomContains: empty filter returns false for all", () => {
    const bf = B.new_(10);
    expect(B.contains(bf, "anything")).toBe(false);
    expect(B.contains(bf, "")).toBe(false);
  });

  it("bloomContains: false-positive rate is below target for n elements", () => {
    // With 1000 elements and 1% fp, we expect ~1% false positives.
    const bf = B.new_(1000, 0.01);
    for (let i = 0; i < 1000; i++) B.add(bf, "in" + i);
    let falsePositives = 0;
    const testCount = 5000;
    for (let i = 0; i < testCount; i++) {
      if (B.contains(bf, "out" + i)) falsePositives++;
    }
    const observedFp = falsePositives / testCount;
    // Allow generous slack (5%) to avoid flakiness.
    expect(observedFp).toBeLessThan(0.05);
  });

  it("bloomFalsePositiveProb: 0 for empty filter", () => {
    const bf = B.new_(100);
    expect(B.false_positive_prob(bf)).toBe(0);
  });

  it("bloomFalsePositiveProb: increases with count", () => {
    const bf = B.new_(100, 0.01);
    const p0 = B.false_positive_prob(bf);
    for (let i = 0; i < 50; i++) B.add(bf, "x" + i);
    const p1 = B.false_positive_prob(bf);
    for (let i = 0; i < 50; i++) B.add(bf, "y" + i);
    const p2 = B.false_positive_prob(bf);
    expect(p1).toBeGreaterThan(p0);
    expect(p2).toBeGreaterThan(p1);
  });

  it("bloomCount: matches add count", () => {
    const bf = B.new_(100);
    for (let i = 0; i < 25; i++) B.add(bf, "k" + i);
    expect(B.count(bf)).toBe(25);
  });

  it("bloomCapacity: matches constructor argument", () => {
    const bf = B.new_(777);
    expect(B.capacity(bf)).toBe(777);
  });

  it("bloomHashFuncs: returns positive integer", () => {
    const bf = B.new_(100);
    const k = B.hash_funcs(bf);
    expect(Number.isInteger(k)).toBe(true);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThanOrEqual(32);
  });

  it("bloomMerge: requires same m and k", () => {
    const a = B.new_(100, 0.01);
    const b = B.new_(100, 0.001);
    expect(() => B.merge(a, b)).toThrow();
  });

  it("bloomMerge: produces union filter", () => {
    const a = B.new_(50, 0.01);
    const b = B.new_(50, 0.01);
    B.add(a, "alpha");
    B.add(b, "beta");
    const m = B.merge(a, b);
    expect(B.contains(m, "alpha")).toBe(true);
    expect(B.contains(m, "beta")).toBe(true);
    expect(B.count(m)).toBe(2);
  });

  it("bloomMerge: empty + empty = empty", () => {
    const a = B.new_(50);
    const b = B.new_(50);
    const m = B.merge(a, b);
    expect(B.count(m)).toBe(0);
    expect(B.contains(m, "x")).toBe(false);
  });

  it("non-BloomFilter argument panics", () => {
    expect(() => B.count({} as any)).toThrow();
    expect(() => B.contains(null as any, "x")).toThrow();
    expect(() => B.add(undefined as any, "x")).toThrow();
  });

  it("non-string element panics", () => {
    const bf = B.new_(10);
    expect(() => B.add(bf, 42 as any)).toThrow();
    expect(() => B.contains(bf, null as any)).toThrow();
  });

  it("many elements don't crash", () => {
    const bf = B.new_(10000, 0.01);
    for (let i = 0; i < 5000; i++) B.add(bf, "item" + i);
    let hits = 0;
    for (let i = 0; i < 5000; i++) if (B.contains(bf, "item" + i)) hits++;
    // No false negatives: all 5000 added elements should be "contains".
    expect(hits).toBe(5000);
  });
});
