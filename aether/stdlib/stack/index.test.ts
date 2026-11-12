import { describe, it, expect } from "vitest";
import * as S from "./index";

describe("stack module", () => {
  it("stkNew: creates empty stack", () => {
    const s = S.stkNew();
    expect(S.stkSize(s)).toBe(0);
    expect(S.stkEmpty(s)).toBe(true);
    expect(S.stkToArray(s)).toEqual([]);
  });

  it("stkNew: starts with empty backing array", () => {
    const s = S.stkNew();
    expect(s.arr).toEqual([]);
    expect(s.size).toBe(0);
  });

  it("stkPush: adds to top (back of array)", () => {
    const s = S.stkNew();
    S.stkPush(s, 1);
    S.stkPush(s, 2);
    S.stkPush(s, 3);
    expect(S.stkSize(s)).toBe(3);
    expect(S.stkToArray(s)).toEqual([1, 2, 3]);
  });

  it("stkPush: chainable", () => {
    const s = S.stkNew();
    expect(S.stkPush(s, "a")).toBe(s);
    S.stkPush(S.stkPush(s, "b"), "c");
    expect(S.stkToArray(s)).toEqual(["a", "b", "c"]);
  });

  it("stkPop: removes from top (LIFO order)", () => {
    const s = S.stkNew();
    S.stkPush(s, 1);
    S.stkPush(s, 2);
    S.stkPush(s, 3);
    expect(S.stkPop(s)).toBe(3);
    expect(S.stkPop(s)).toBe(2);
    expect(S.stkPop(s)).toBe(1);
    expect(S.stkEmpty(s)).toBe(true);
  });

  it("stkPop: returns undefined when empty", () => {
    const s = S.stkNew();
    expect(S.stkPop(s)).toBe(undefined);
  });

  it("stkPeek: returns top without removing", () => {
    const s = S.stkNew();
    S.stkPush(s, "x");
    S.stkPush(s, "y");
    expect(S.stkPeek(s)).toBe("y");
    expect(S.stkSize(s)).toBe(2);
    expect(S.stkPeek(s)).toBe("y");
  });

  it("stkPeek: returns undefined when empty", () => {
    const s = S.stkNew();
    expect(S.stkPeek(s)).toBe(undefined);
  });

  it("stkSize and stkEmpty: interleaved push/pop", () => {
    const s = S.stkNew();
    expect(S.stkEmpty(s)).toBe(true);
    S.stkPush(s, "a");
    expect(S.stkEmpty(s)).toBe(false);
    expect(S.stkSize(s)).toBe(1);
    S.stkPop(s);
    expect(S.stkEmpty(s)).toBe(true);
    expect(S.stkSize(s)).toBe(0);
  });

  it("stkClear: empties the stack", () => {
    const s = S.stkNew();
    S.stkPush(s, 1);
    S.stkPush(s, 2);
    S.stkPush(s, 3);
    expect(S.stkClear(s)).toBe(s);
    expect(S.stkSize(s)).toBe(0);
    expect(S.stkEmpty(s)).toBe(true);
    expect(S.stkToArray(s)).toEqual([]);
  });

  it("stkClear: chainable and idempotent", () => {
    const s = S.stkNew();
    S.stkClear(s);
    S.stkClear(s);
    expect(S.stkSize(s)).toBe(0);
  });

  it("stkToArray: returns a fresh snapshot (no aliasing)", () => {
    const s = S.stkNew();
    S.stkPush(s, 1);
    S.stkPush(s, 2);
    const a = S.stkToArray(s);
    const b = S.stkToArray(s);
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1, 2]);
    expect(a).not.toBe(b);
    a.push(999);
    expect(S.stkToArray(s)).toEqual([1, 2]);
  });

  it("stkFromArr: builds from array (first becomes bottom)", () => {
    const s = S.stkFromArr([1, 2, 3]);
    expect(S.stkSize(s)).toBe(3);
    expect(S.stkPop(s)).toBe(3);
    expect(S.stkPop(s)).toBe(2);
    expect(S.stkPop(s)).toBe(1);
  });

  it("stkFromArr: copies the source array", () => {
    const src = [1, 2, 3];
    const s = S.stkFromArr(src);
    src.push(999);
    expect(S.stkSize(s)).toBe(3);
    expect(S.stkToArray(s)).toEqual([1, 2, 3]);
  });

  it("stkFromArr: empty array", () => {
    const s = S.stkFromArr([]);
    expect(S.stkEmpty(s)).toBe(true);
  });

  it("stkFromArr: rejects non-array", () => {
    expect(() => S.stkFromArr(null as any)).toThrow();
    expect(() => S.stkFromArr({} as any)).toThrow();
    expect(() => S.stkFromArr("abc" as any)).toThrow();
  });

  it("stkToString: empty stack", () => {
    expect(S.stkToString(S.stkNew())).toBe("Stack[]");
  });

  it("stkToString: single element", () => {
    const s = S.stkNew();
    S.stkPush(s, 42);
    expect(S.stkToString(s)).toBe("Stack[42]");
  });

  it("stkToString: multiple elements", () => {
    const s = S.stkFromArr([1, 2, 3]);
    expect(S.stkToString(s)).toBe("Stack[1, 2, 3]");
  });

  it("stkToString: string elements are JSON-quoted", () => {
    const s = S.stkFromArr(["a", "b"]);
    expect(S.stkToString(s)).toBe('Stack["a", "b"]');
  });

  it("alternating push/pop keeps LIFO order", () => {
    const s = S.stkNew();
    for (let i = 0; i < 10; i++) {
      S.stkPush(s, i);
      expect(S.stkPop(s)).toBe(i);
    }
    expect(S.stkEmpty(s)).toBe(true);
  });

  it("LIFO order is preserved across mixed operations", () => {
    const s = S.stkNew();
    S.stkPush(s, 1);
    S.stkPush(s, 2);
    S.stkPush(s, 3);
    expect(S.stkPop(s)).toBe(3);
    S.stkPush(s, 4);
    S.stkPush(s, 5);
    expect(S.stkPop(s)).toBe(5);
    expect(S.stkPop(s)).toBe(4);
    expect(S.stkPop(s)).toBe(2);
    expect(S.stkPop(s)).toBe(1);
  });

  it("validates types: stkPush on non-stack", () => {
    expect(() => S.stkPush(null as any, 1)).toThrow();
    expect(() => S.stkPush({} as any, 1)).toThrow();
  });

  it("validates types: stkPop on non-stack", () => {
    expect(() => S.stkPop(null as any)).toThrow();
    expect(() => S.stkPop({} as any)).toThrow();
  });

  it("validates types: stkPeek / stkSize / stkEmpty / stkClear", () => {
    expect(() => S.stkPeek(null as any)).toThrow();
    expect(() => S.stkSize(null as any)).toThrow();
    expect(() => S.stkEmpty(null as any)).toThrow();
    expect(() => S.stkClear(null as any)).toThrow();
  });

  it("validates types: stkToArray / stkToString", () => {
    expect(() => S.stkToArray(null as any)).toThrow();
    expect(() => S.stkToString(null as any)).toThrow();
  });

  it("works with mixed types: numbers, strings, objects", () => {
    const s = S.stkNew();
    S.stkPush(s, 1);
    S.stkPush(s, "two");
    S.stkPush(s, { a: 3 });
    expect(S.stkPop(s)).toEqual({ a: 3 });
    expect(S.stkPop(s)).toBe("two");
    expect(S.stkPop(s)).toBe(1);
  });

  it("stress: 1000 push then 1000 pop LIFO", () => {
    const s = S.stkNew();
    for (let i = 0; i < 1000; i++) S.stkPush(s, i);
    expect(S.stkSize(s)).toBe(1000);
    let ok = true;
    for (let i = 999; i >= 0; i--) {
      if (S.stkPop(s) !== i) ok = false;
    }
    expect(ok).toBe(true);
    expect(S.stkEmpty(s)).toBe(true);
  });

  it("mimics a parenthesis matcher use case", () => {
    // Real-world stack test: balanced parens checker.
    const s = S.stkNew();
    const input = "((a+b)*(c-d))";
    let balanced = true;
    for (const ch of input) {
      if (ch === "(") S.stkPush(s, "(");
      else if (ch === ")") {
        if (S.stkEmpty(s)) { balanced = false; break; }
        S.stkPop(s);
      }
    }
    expect(balanced).toBe(true);
    expect(S.stkEmpty(s)).toBe(true);
  });
});
