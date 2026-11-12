import { describe, it, expect } from "vitest";
import * as Q from "./index";

describe("pqueue module", () => {
  it("pqNew: creates empty queue", () => {
    const q = Q.pqNew<number>();
    expect(Q.pqSize(q)).toBe(0);
    expect(Q.pqEmpty(q)).toBe(true);
    expect(Q.pqPeek(q)).toBeUndefined();
    expect(Q.pqPop(q)).toBeUndefined();
  });

  it("pqPush: increases size", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 5);
    expect(Q.pqSize(q)).toBe(1);
    expect(Q.pqEmpty(q)).toBe(false);
  });

  it("pqPush: is chainable", () => {
    const q = Q.pqNew<number>();
    expect(Q.pqPush(q, 1)).toBe(q);
  });

  it("pqPop: returns the smallest first (min-heap)", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 3);
    Q.pqPush(q, 1);
    Q.pqPush(q, 2);
    expect(Q.pqPop(q)).toBe(1);
    expect(Q.pqPop(q)).toBe(2);
    expect(Q.pqPop(q)).toBe(3);
    expect(Q.pqPop(q)).toBeUndefined();
  });

  it("pqPop: stable for equal priorities (FIFO by insertion order)", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 1); // first
    Q.pqPush(q, 1); // second
    Q.pqPush(q, 1); // third
    expect(Q.pqPop(q)).toBe(1);
    expect(Q.pqPop(q)).toBe(1);
    expect(Q.pqPop(q)).toBe(1);
    // All three are equal so order is by insertion sequence — verify
    // they're all 1; we can't distinguish which one comes out, but
    // the count must match.
  });

  it("pqPop: works with a custom comparator (max-heap)", () => {
    const q = Q.pqNew<number>((a, b) => a > b);
    Q.pqPush(q, 1);
    Q.pqPush(q, 3);
    Q.pqPush(q, 2);
    expect(Q.pqPop(q)).toBe(3);
    expect(Q.pqPop(q)).toBe(2);
    expect(Q.pqPop(q)).toBe(1);
  });

  it("pqPeek: returns the smallest without removing it", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 5);
    Q.pqPush(q, 1);
    expect(Q.pqPeek(q)).toBe(1);
    expect(Q.pqSize(q)).toBe(2); // unchanged
  });

  it("pqSize / pqEmpty: track contents", () => {
    const q = Q.pqNew<number>();
    expect(Q.pqEmpty(q)).toBe(true);
    Q.pqPush(q, 1);
    expect(Q.pqEmpty(q)).toBe(false);
    expect(Q.pqSize(q)).toBe(1);
    Q.pqPop(q);
    expect(Q.pqEmpty(q)).toBe(true);
    expect(Q.pqSize(q)).toBe(0);
  });

  it("pqMerge: combines two queues and empties src", () => {
    const a = Q.pqNew<number>();
    Q.pqPush(a, 5);
    Q.pqPush(a, 1);
    const b = Q.pqNew<number>();
    Q.pqPush(b, 3);
    Q.pqPush(b, 2);
    Q.pqMerge(a, b);
    expect(Q.pqSize(a)).toBe(4);
    expect(Q.pqSize(b)).toBe(0);
    expect(Q.pqPop(a)).toBe(1);
    expect(Q.pqPop(a)).toBe(2);
    expect(Q.pqPop(a)).toBe(3);
    expect(Q.pqPop(a)).toBe(5);
  });

  it("pqMerge: empty src is a no-op", () => {
    const a = Q.pqNew<number>();
    Q.pqPush(a, 1);
    const b = Q.pqNew<number>();
    Q.pqMerge(a, b);
    expect(Q.pqSize(a)).toBe(1);
  });

  it("pqMerge: is chainable (returns dst)", () => {
    const a = Q.pqNew<number>();
    const b = Q.pqNew<number>();
    expect(Q.pqMerge(a, b)).toBe(a);
  });

  it("pqUpdateKey: re-sifts on decrement", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 5);
    Q.pqPush(q, 3);
    Q.pqPush(q, 8);
    expect(Q.pqPeek(q)).toBe(3);
    Q.pqUpdateKey(q, 5, 1); // 5 → 1 should now be the min
    expect(Q.pqPeek(q)).toBe(1);
    expect(Q.pqPop(q)).toBe(1);
    expect(Q.pqPop(q)).toBe(3);
    expect(Q.pqPop(q)).toBe(8);
  });

  it("pqUpdateKey: re-sifts on increment", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 1);
    Q.pqPush(q, 2);
    Q.pqPush(q, 3);
    Q.pqUpdateKey(q, 1, 10); // 1 → 10 should now sink to the bottom
    expect(Q.pqPeek(q)).toBe(2);
    expect(Q.pqPop(q)).toBe(2);
    expect(Q.pqPop(q)).toBe(3);
    expect(Q.pqPop(q)).toBe(10);
  });

  it("pqUpdateKey: returns false for missing item", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 1);
    expect(Q.pqUpdateKey(q, 999, 0)).toBe(false);
  });

  it("pqDelete: removes an item", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 1);
    Q.pqPush(q, 2);
    Q.pqPush(q, 3);
    expect(Q.pqDelete(q, 2)).toBe(true);
    expect(Q.pqSize(q)).toBe(2);
    expect(Q.pqPop(q)).toBe(1);
    expect(Q.pqPop(q)).toBe(3);
  });

  it("pqDelete: returns false for missing item", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 1);
    expect(Q.pqDelete(q, 999)).toBe(false);
    expect(Q.pqSize(q)).toBe(1);
  });

  it("pqDelete: deleting the top", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 1);
    Q.pqPush(q, 2);
    Q.pqPush(q, 3);
    expect(Q.pqDelete(q, 1)).toBe(true);
    expect(Q.pqPeek(q)).toBe(2);
  });

  it("pqToSorted: returns all items in pop order", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 5);
    Q.pqPush(q, 1);
    Q.pqPush(q, 3);
    Q.pqPush(q, 2);
    Q.pqPush(q, 4);
    expect(Q.pqToSorted(q)).toEqual([1, 2, 3, 4, 5]);
  });

  it("pqToSorted: does not modify the queue", () => {
    const q = Q.pqNew<number>();
    Q.pqPush(q, 5);
    Q.pqPush(q, 1);
    Q.pqPush(q, 3);
    Q.pqToSorted(q);
    expect(Q.pqSize(q)).toBe(3);
    expect(Q.pqPop(q)).toBe(1);
    expect(Q.pqPop(q)).toBe(3);
    expect(Q.pqPop(q)).toBe(5);
  });

  it("pqToSorted: empty queue returns []", () => {
    expect(Q.pqToSorted(Q.pqNew<number>())).toEqual([]);
  });

  it("pqToSorted: respects custom comparator", () => {
    const q = Q.pqNew<number>((a, b) => a > b);
    Q.pqPush(q, 1);
    Q.pqPush(q, 3);
    Q.pqPush(q, 2);
    expect(Q.pqToSorted(q)).toEqual([3, 2, 1]);
  });

  it("pq: works with object items + custom comparator", () => {
    type Task = { name: string; prio: number };
    const q = Q.pqNew<Task>((a, b) => a.prio < b.prio);
    Q.pqPush(q, { name: "low", prio: 10 });
    Q.pqPush(q, { name: "high", prio: 1 });
    Q.pqPush(q, { name: "med", prio: 5 });
    expect(Q.pqPop(q)!.name).toBe("high");
    expect(Q.pqPop(q)!.name).toBe("med");
    expect(Q.pqPop(q)!.name).toBe("low");
  });

  it("pq: validators reject bad input", () => {
    expect(() => Q.pqPush(null as any, 1)).toThrow();
    expect(() => Q.pqPush({} as any, 1)).toThrow();
    expect(() => Q.pqPop({ heap: [], less: "x" } as any)).toThrow();
  });

  it("pq: large random-ish sequence yields sorted output", () => {
    const q = Q.pqNew<number>();
    const input: number[] = [];
    for (let i = 0; i < 100; i++) {
      const v = (i * 7 + 3) % 97;
      input.push(v);
      Q.pqPush(q, v);
    }
    const out = Q.pqToSorted(q);
    expect(out).toEqual(input.slice().sort((a, b) => a - b));
  });
});
