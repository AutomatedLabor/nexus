import { describe, it, expect } from "vitest";
import * as Q from "./index";

describe("queue module", () => {
  it("qNew: creates empty queue", () => {
    const q = Q.qNew();
    expect(Q.qSize(q)).toBe(0);
    expect(Q.qEmpty(q)).toBe(true);
    expect(Q.qToArray(q)).toEqual([]);
  });

  it("qNew: starts with empty backing array and zero head", () => {
    const q = Q.qNew();
    expect(q.arr).toEqual([]);
    expect(q.head).toBe(0);
    expect(q.size).toBe(0);
  });

  it("qPush: adds to back", () => {
    const q = Q.qNew();
    Q.qPush(q, 1);
    Q.qPush(q, 2);
    Q.qPush(q, 3);
    expect(Q.qSize(q)).toBe(3);
    expect(Q.qToArray(q)).toEqual([1, 2, 3]);
  });

  it("qPush: returns the queue (chainable)", () => {
    const q = Q.qNew();
    expect(Q.qPush(q, "a")).toBe(q);
    Q.qPush(Q.qPush(q, "b"), "c");
    expect(Q.qToArray(q)).toEqual(["a", "b", "c"]);
  });

  it("qPop: removes from front (FIFO order)", () => {
    const q = Q.qNew();
    Q.qPush(q, 1);
    Q.qPush(q, 2);
    Q.qPush(q, 3);
    expect(Q.qPop(q)).toBe(1);
    expect(Q.qPop(q)).toBe(2);
    expect(Q.qPop(q)).toBe(3);
    expect(Q.qEmpty(q)).toBe(true);
  });

  it("qPop: returns undefined when empty", () => {
    const q = Q.qNew();
    expect(Q.qPop(q)).toBe(undefined);
  });

  it("qPeek: returns front without removing", () => {
    const q = Q.qNew();
    Q.qPush(q, "x");
    Q.qPush(q, "y");
    expect(Q.qPeek(q)).toBe("x");
    expect(Q.qSize(q)).toBe(2);
    expect(Q.qPeek(q)).toBe("x");
  });

  it("qPeek: returns undefined when empty", () => {
    const q = Q.qNew();
    expect(Q.qPeek(q)).toBe(undefined);
  });

  it("qSize and qEmpty: interleaved push/pop", () => {
    const q = Q.qNew();
    expect(Q.qEmpty(q)).toBe(true);
    Q.qPush(q, "a");
    expect(Q.qEmpty(q)).toBe(false);
    expect(Q.qSize(q)).toBe(1);
    Q.qPop(q);
    expect(Q.qEmpty(q)).toBe(true);
    expect(Q.qSize(q)).toBe(0);
  });

  it("qClear: empties the queue", () => {
    const q = Q.qNew();
    Q.qPush(q, 1);
    Q.qPush(q, 2);
    Q.qPush(q, 3);
    expect(Q.qClear(q)).toBe(q);
    expect(Q.qSize(q)).toBe(0);
    expect(Q.qEmpty(q)).toBe(true);
    expect(Q.qToArray(q)).toEqual([]);
  });

  it("qClear: chainable and idempotent", () => {
    const q = Q.qNew();
    Q.qClear(q);
    Q.qClear(q);
    expect(Q.qSize(q)).toBe(0);
  });

  it("qToArray: returns a fresh snapshot (no aliasing)", () => {
    const q = Q.qNew();
    Q.qPush(q, 1);
    Q.qPush(q, 2);
    const a = Q.qToArray(q);
    const b = Q.qToArray(q);
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1, 2]);
    expect(a).not.toBe(b);
    a.push(999);
    expect(Q.qToArray(q)).toEqual([1, 2]);
  });

  it("qFromArr: builds from array (first becomes front)", () => {
    const q = Q.qFromArr([1, 2, 3]);
    expect(Q.qSize(q)).toBe(3);
    expect(Q.qPop(q)).toBe(1);
    expect(Q.qPop(q)).toBe(2);
    expect(Q.qPop(q)).toBe(3);
  });

  it("qFromArr: copies the source array", () => {
    const src = [1, 2, 3];
    const q = Q.qFromArr(src);
    src.push(999);
    expect(Q.qSize(q)).toBe(3);
    expect(Q.qToArray(q)).toEqual([1, 2, 3]);
  });

  it("qFromArr: empty array", () => {
    const q = Q.qFromArr([]);
    expect(Q.qEmpty(q)).toBe(true);
  });

  it("qFromArr: rejects non-array", () => {
    expect(() => Q.qFromArr(null as any)).toThrow();
    expect(() => Q.qFromArr({} as any)).toThrow();
    expect(() => Q.qFromArr("abc" as any)).toThrow();
  });

  it("qToString: empty queue", () => {
    expect(Q.qToString(Q.qNew())).toBe("Queue[]");
  });

  it("qToString: single element", () => {
    const q = Q.qNew();
    Q.qPush(q, 42);
    expect(Q.qToString(q)).toBe("Queue[42]");
  });

  it("qToString: multiple elements", () => {
    const q = Q.qFromArr([1, 2, 3]);
    expect(Q.qToString(q)).toBe("Queue[1, 2, 3]");
  });

  it("qToString: string elements are JSON-quoted", () => {
    const q = Q.qFromArr(["a", "b"]);
    expect(Q.qToString(q)).toBe('Queue["a", "b"]');
  });

  it("compaction: many pushes and pops keep size correct", () => {
    const q = Q.qNew();
    for (let i = 0; i < 100; i++) Q.qPush(q, i);
    let sum = 0;
    for (let i = 0; i < 50; i++) sum += Q.qPop(q) as number;
    expect(sum).toBe(0 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 + 21 + 22 + 23 + 24 + 25 + 26 + 27 + 28 + 29 + 30 + 31 + 32 + 33 + 34 + 35 + 36 + 37 + 38 + 39 + 40 + 41 + 42 + 43 + 44 + 45 + 46 + 47 + 48 + 49);
    expect(Q.qSize(q)).toBe(50);
    expect(Q.qPeek(q)).toBe(50);
  });

  it("compaction: pushes after partial drain keep order", () => {
    const q = Q.qFromArr([1, 2, 3, 4, 5]);
    Q.qPop(q); Q.qPop(q);
    Q.qPush(q, 6);
    Q.qPush(q, 7);
    expect(Q.qToArray(q)).toEqual([3, 4, 5, 6, 7]);
  });

  it("alternating push/pop keeps FIFO order", () => {
    const q = Q.qNew();
    for (let i = 0; i < 10; i++) {
      Q.qPush(q, i);
      expect(Q.qPop(q)).toBe(i);
    }
    expect(Q.qEmpty(q)).toBe(true);
  });

  it("validates types: qPush on non-queue", () => {
    expect(() => Q.qPush(null as any, 1)).toThrow();
    expect(() => Q.qPush({} as any, 1)).toThrow();
  });

  it("validates types: qPop on non-queue", () => {
    expect(() => Q.qPop(null as any)).toThrow();
    expect(() => Q.qPop({} as any)).toThrow();
  });

  it("validates types: qPeek / qSize / qEmpty / qClear", () => {
    expect(() => Q.qPeek(null as any)).toThrow();
    expect(() => Q.qSize(null as any)).toThrow();
    expect(() => Q.qEmpty(null as any)).toThrow();
    expect(() => Q.qClear(null as any)).toThrow();
  });

  it("validates types: qToArray / qToString", () => {
    expect(() => Q.qToArray(null as any)).toThrow();
    expect(() => Q.qToString(null as any)).toThrow();
  });

  it("works with mixed types: numbers, strings, objects", () => {
    const q = Q.qNew();
    Q.qPush(q, 1);
    Q.qPush(q, "two");
    Q.qPush(q, { a: 3 });
    expect(Q.qPop(q)).toBe(1);
    expect(Q.qPop(q)).toBe("two");
    const o = Q.qPop(q) as any;
    expect(o.a).toBe(3);
  });

  it("stress: 1000 push then 1000 pop round-trips", () => {
    const q = Q.qNew();
    for (let i = 0; i < 1000; i++) Q.qPush(q, i);
    expect(Q.qSize(q)).toBe(1000);
    let ok = true;
    for (let i = 0; i < 1000; i++) {
      if (Q.qPop(q) !== i) ok = false;
    }
    expect(ok).toBe(true);
    expect(Q.qEmpty(q)).toBe(true);
  });
});
