/**
 * Aether stdlib — `stack` module.
 *
 * A simple LIFO stack backed by a dynamic array. The stack grows
 * by appending to the back and shrinks by popping from the back.
 * Both `stkPush` and `stkPop` are O(1) amortised — the JS array's
 * `push`/`pop` give us this for free, with the rare O(n) resize
 * when the backing array's capacity grows.
 *
 * Functions:
 *   - stkNew, stkPush, stkPop, stkPeek, stkSize, stkEmpty,
 *     stkClear                              — basics
 *   - stkToArray, stkFromArr                — bulk ops
 *   - stkToString                           — human-readable dump
 *
 * The stack is a plain JS object with two fields:
 *   - `arr`   — backing array; the last element is the top
 *   - `size`  — number of elements (kept in sync with arr.length
 *               for the benefit of the host-side test surface)
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Stack<T = any> {
  /** Backing array; the last element is the top of the stack. */
  arr: T[];
  /** Number of elements currently on the stack (== arr.length). */
  size: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh, empty stack. */
export function stkNew<T = any>(): Stack<T> {
  return { arr: [], size: 0 };
}

/** Build a stack from an array. The first element of `xs` becomes
 *  the bottom of the stack; the last becomes the top.  Non-array
 *  inputs throw. */
export function stkFromArr<T = any>(xs: T[]): Stack<T> {
  if (!Array.isArray(xs)) throw new Error("stkFromArr: expected array, got " + kind(xs));
  const copy = xs.slice();
  return { arr: copy, size: copy.length };
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/** Push `x` onto the top of the stack.  Returns the stack (chainable). */
export function stkPush<T>(s: Stack<T>, x: T): Stack<T> {
  assertStk(s, "stkPush");
  s.arr.push(x);
  s.size++;
  return s;
}

/** Remove and return the top element.  Returns `undefined` if the
 *  stack is empty (does NOT panic). */
export function stkPop<T>(s: Stack<T>): T | undefined {
  assertStk(s, "stkPop");
  if (s.size === 0) return undefined;
  const v = s.arr.pop();
  s.size--;
  return v;
}

/** Return the top element without removing it.  Returns `undefined`
 *  if the stack is empty. */
export function stkPeek<T>(s: Stack<T>): T | undefined {
  assertStk(s, "stkPeek");
  if (s.size === 0) return undefined;
  return s.arr[s.size - 1];
}

/** Number of elements currently on the stack. */
export function stkSize<T>(s: Stack<T>): number {
  assertStk(s, "stkSize");
  return s.size;
}

/** True when the stack is empty. */
export function stkEmpty<T>(s: Stack<T>): boolean {
  assertStk(s, "stkEmpty");
  return s.size === 0;
}

/** Reset the stack to empty.  Returns the stack (chainable). */
export function stkClear<T>(s: Stack<T>): Stack<T> {
  assertStk(s, "stkClear");
  s.arr = [];
  s.size = 0;
  return s;
}

// ---------------------------------------------------------------------------
// Conversion & inspection
// ---------------------------------------------------------------------------

/** Return a fresh array containing the stack's elements in
 *  bottom-to-top order.  Does not mutate the stack. */
export function stkToArray<T>(s: Stack<T>): T[] {
  assertStk(s, "stkToArray");
  return s.arr.slice();
}

/** Human-readable rendering: `Stack[1, 2, 3]` (bottom first, top last). */
export function stkToString<T>(s: Stack<T>): string {
  assertStk(s, "stkToString");
  if (s.size === 0) return "Stack[]";
  return "Stack[" + s.arr.map((x) => describe(x)).join(", ") + "]";
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "stack",
  fns: [
    { name: "stkNew", sig: "() -> Stack", desc: "Create a fresh empty LIFO stack." },
    { name: "stkPush", sig: "(s: Stack, x: any) -> Stack", desc: "Push x onto the top; chainable." },
    { name: "stkPop", sig: "(s: Stack) -> any?", desc: "Remove and return the top element, or undefined if empty." },
    { name: "stkPeek", sig: "(s: Stack) -> any?", desc: "Return the top element without removing it." },
    { name: "stkSize", sig: "(s: Stack) -> int", desc: "Number of elements in the stack." },
    { name: "stkEmpty", sig: "(s: Stack) -> bool", desc: "True when the stack is empty." },
    { name: "stkClear", sig: "(s: Stack) -> Stack", desc: "Empty the stack; chainable." },
    { name: "stkToArray", sig: "(s: Stack) -> [any]", desc: "Snapshot as a fresh array (bottom to top)." },
    { name: "stkFromArr", sig: "(xs: [any]) -> Stack", desc: "Build a stack from an array (first becomes bottom)." },
    { name: "stkToString", sig: "(s: Stack) -> string", desc: "Human-readable rendering: Stack[a, b, c]." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("stkNew", stkNew);
  registerBuiltin("stkPush", stkPush);
  registerBuiltin("stkPop", stkPop);
  registerBuiltin("stkPeek", stkPeek);
  registerBuiltin("stkSize", stkSize);
  registerBuiltin("stkEmpty", stkEmpty);
  registerBuiltin("stkClear", stkClear);
  registerBuiltin("stkToArray", stkToArray);
  registerBuiltin("stkFromArr", stkFromArr);
  registerBuiltin("stkToString", stkToString);
}

// ---------------------------------------------------------------------------
// Validators & helpers
// ---------------------------------------------------------------------------

function assertStk<T>(x: any, fn: string): asserts x is Stack<T> {
  if (typeof x !== "object" || x === null ||
      !Array.isArray(x.arr) ||
      typeof x.size !== "number") {
    throw new Error(fn + ": expected Stack, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}

function describe(x: any): string {
  if (typeof x === "string") return JSON.stringify(x);
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (typeof x === "object") {
    try {
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  }
  return String(x);
}
