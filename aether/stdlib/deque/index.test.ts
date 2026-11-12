import { describe, it, expect } from "vitest";
import * as D from "./index";

describe("deque module", () => {
  it("dqNew: creates empty deque", () => {
    const d = D.dqNew();
    expect(D.dqSize(d)).toBe(0);
    expect(D.dqEmpty(d)).toBe(true);
    expect(D.dqToArray(d)).toEqual([]);
  });

  it("dqPushBack: adds to back", () => {
    const d = D.dqNew();
    D.dqPushBack(d, 1);
    D.dqPushBack(d, 2);
    D.dqPushBack(d, 3);
    expect(D.dqToArray(d)).toEqual([1, 2, 3]);
    expect(D.dqSize(d)).toBe(3);
  });

  it("dqPushFront: adds to front", () => {
    const d = D.dqNew();
    D.dqPushFront(d, 1);
    D.dqPushFront(d, 2);
    D.dqPushFront(d, 3);
    expect(D.dqToArray(d)).toEqual([3, 2, 1]);
    expect(D.dqSize(d)).toBe(3);
  });

  it("dqPushBack / dqPushFront: chainable", () => {
    const d = D.dqNew();
    expect(D.dqPushBack(d, "a")).toBe(d);
    expect(D.dqPushFront(d, "z")).toBe(d);
    expect(D.dqToArray(d)).toEqual(["z", "a"]);
  });

  it("dqPopFront: removes from front (FIFO via push back)", () => {
    const d = D.dqNew();
    D.dqPushBack(d, 1);
    D.dqPushBack(d, 2);
    D.dqPushBack(d, 3);
    expect(D.dqPopFront(d)).toBe(1);
    expect(D.dqPopFront(d)).toBe(2);
    expect(D.dqPopFront(d)).toBe(3);
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("dqPopBack: removes from back (LIFO via push back)", () => {
    const d = D.dqNew();
    D.dqPushBack(d, 1);
    D.dqPushBack(d, 2);
    D.dqPushBack(d, 3);
    expect(D.dqPopBack(d)).toBe(3);
    expect(D.dqPopBack(d)).toBe(2);
    expect(D.dqPopBack(d)).toBe(1);
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("dqPopFront / dqPopBack: empty returns undefined", () => {
    const d = D.dqNew();
    expect(D.dqPopFront(d)).toBe(undefined);
    expect(D.dqPopBack(d)).toBe(undefined);
  });

  it("dqPeekFront / dqPeekBack: read without removing", () => {
    const d = D.dqNew();
    D.dqPushBack(d, 1);
    D.dqPushBack(d, 2);
    D.dqPushBack(d, 3);
    expect(D.dqPeekFront(d)).toBe(1);
    expect(D.dqPeekBack(d)).toBe(3);
    expect(D.dqSize(d)).toBe(3);
  });

  it("dqPeekFront / dqPeekBack: undefined when empty", () => {
    const d = D.dqNew();
    expect(D.dqPeekFront(d)).toBe(undefined);
    expect(D.dqPeekBack(d)).toBe(undefined);
  });

  it("Mixed pushFront/pushBack keeps correct order", () => {
    const d = D.dqNew();
    D.dqPushBack(d, 2);
    D.dqPushFront(d, 1);
    D.dqPushBack(d, 3);
    D.dqPushFront(d, 0);
    expect(D.dqToArray(d)).toEqual([0, 1, 2, 3]);
  });

  it("Mixed popFront/popBack keeps correct order", () => {
    const d = D.dqNew();
    D.dqPushBack(d, 1);
    D.dqPushBack(d, 2);
    D.dqPushBack(d, 3);
    D.dqPushBack(d, 4);
    expect(D.dqPopFront(d)).toBe(1);
    expect(D.dqPopBack(d)).toBe(4);
    expect(D.dqPopFront(d)).toBe(2);
    expect(D.dqPopBack(d)).toBe(3);
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("dqToArray: returns fresh snapshot, no aliasing", () => {
    const d = D.dqNew();
    D.dqPushBack(d, 1);
    D.dqPushBack(d, 2);
    const a = D.dqToArray(d);
    const b = D.dqToArray(d);
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1, 2]);
    expect(a).not.toBe(b);
    a.push(999);
    expect(D.dqToArray(d)).toEqual([1, 2]);
  });

  it("Simulates stack via pushBack/popBack", () => {
    const d = D.dqNew();
    for (let i = 0; i < 5; i++) D.dqPushBack(d, i);
    for (let i = 4; i >= 0; i--) expect(D.dqPopBack(d)).toBe(i);
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("Simulates queue via pushBack/popFront", () => {
    const d = D.dqNew();
    for (let i = 0; i < 5; i++) D.dqPushBack(d, i);
    for (let i = 0; i < 5; i++) expect(D.dqPopFront(d)).toBe(i);
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("Simulates stack via pushFront/popFront", () => {
    const d = D.dqNew();
    for (let i = 0; i < 5; i++) D.dqPushFront(d, i);
    for (let i = 4; i >= 0; i--) expect(D.dqPopFront(d)).toBe(i);
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("Simulates reverse-queue via pushFront/popBack", () => {
    const d = D.dqNew();
    for (let i = 0; i < 5; i++) D.dqPushFront(d, i);
    for (let i = 0; i < 5; i++) expect(D.dqPopBack(d)).toBe(i);
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("Wrap-around: capacity grows correctly", () => {
    const d = D.dqNew();
    // Push enough to trigger the initial 4-capacity grow to 8, 16, 32.
    for (let i = 0; i < 100; i++) D.dqPushBack(d, i);
    expect(D.dqSize(d)).toBe(100);
    expect(D.dqPeekFront(d)).toBe(0);
    expect(D.dqPeekBack(d)).toBe(99);
    for (let i = 0; i < 100; i++) {
      if (D.dqPopFront(d) !== i) throw new Error("mismatch at " + i);
    }
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("Wrap-around: pushFront triggers grow correctly", () => {
    const d = D.dqNew();
    for (let i = 0; i < 100; i++) D.dqPushFront(d, i);
    expect(D.dqSize(d)).toBe(100);
    expect(D.dqPeekFront(d)).toBe(99);
    expect(D.dqPeekBack(d)).toBe(0);
    for (let i = 0; i < 100; i++) {
      if (D.dqPopBack(d) !== i) throw new Error("mismatch at " + i);
    }
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("Alternating pushFront / popBack interleaves correctly", () => {
    const d = D.dqNew();
    for (let i = 0; i < 10; i++) {
      D.dqPushFront(d, i);
      expect(D.dqPopBack(d)).toBe(i);
    }
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("Drain then re-fill keeps state correct", () => {
    const d = D.dqNew();
    D.dqPushBack(d, 1);
    D.dqPushBack(d, 2);
    D.dqPopFront(d);
    D.dqPopFront(d);
    D.dqPushBack(d, 3);
    D.dqPushBack(d, 4);
    expect(D.dqToArray(d)).toEqual([3, 4]);
  });

  it("validates types: pushFront / pushBack on non-deque", () => {
    expect(() => D.dqPushFront(null as any, 1)).toThrow();
    expect(() => D.dqPushBack(null as any, 1)).toThrow();
    expect(() => D.dqPushFront({} as any, 1)).toThrow();
  });

  it("validates types: popFront / popBack on non-deque", () => {
    expect(() => D.dqPopFront(null as any)).toThrow();
    expect(() => D.dqPopBack(null as any)).toThrow();
    expect(() => D.dqPopFront({} as any)).toThrow();
  });

  it("validates types: peek / size / empty / toArray", () => {
    expect(() => D.dqPeekFront(null as any)).toThrow();
    expect(() => D.dqPeekBack(null as any)).toThrow();
    expect(() => D.dqSize(null as any)).toThrow();
    expect(() => D.dqEmpty(null as any)).toThrow();
    expect(() => D.dqToArray(null as any)).toThrow();
  });

  it("works with mixed types: numbers, strings, objects", () => {
    const d = D.dqNew();
    D.dqPushFront(d, "front");
    D.dqPushBack(d, 42);
    D.dqPushBack(d, { x: 1 });
    expect(D.dqPopFront(d)).toBe("front");
    expect(D.dqPopFront(d)).toBe(42);
    expect(D.dqPopFront(d)).toEqual({ x: 1 });
  });

  it("stress: 1000 pushBack then 1000 popBack LIFO", () => {
    const d = D.dqNew();
    for (let i = 0; i < 1000; i++) D.dqPushBack(d, i);
    expect(D.dqSize(d)).toBe(1000);
    let ok = true;
    for (let i = 999; i >= 0; i--) {
      if (D.dqPopBack(d) !== i) ok = false;
    }
    expect(ok).toBe(true);
    expect(D.dqEmpty(d)).toBe(true);
  });

  it("stress: sliding-window pattern (push back, pop front)", () => {
    const d = D.dqNew();
    const windowSize = 5;
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      D.dqPushBack(d, i);
      sum += i;
      if (D.dqSize(d) > windowSize) {
        sum -= D.dqPopFront(d) as number;
      }
    }
    // Final window is [45..49], sum should be 45+46+47+48+49 = 235.
    expect(sum).toBe(235);
    expect(D.dqSize(d)).toBe(windowSize);
  });

  it("stress: mixed pushFront/pushBack/popFront/popBack", () => {
    const d = D.dqNew();
    let expected: number[] = [];
    for (let i = 0; i < 200; i++) {
      if (i % 4 === 0) { D.dqPushBack(d, i); expected.push(i); }
      else if (i % 4 === 1) { D.dqPushFront(d, i); expected.unshift(i); }
      else if (i % 4 === 2) {
        if (expected.length > 0) {
          const v = D.dqPopFront(d);
          if (v !== expected[0]) throw new Error("popFront mismatch at " + i);
          expected = expected.slice(1);
        }
      } else {
        if (expected.length > 0) {
          const v = D.dqPopBack(d);
          if (v !== expected[expected.length - 1]) throw new Error("popBack mismatch at " + i);
          expected = expected.slice(0, -1);
        }
      }
    }
    expect(D.dqToArray(d)).toEqual(expected);
  });
});
