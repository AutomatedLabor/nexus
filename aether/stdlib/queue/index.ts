/**
 * Aether stdlib — `queue` module.
 *
 * A simple FIFO queue backed by a dynamic array. The queue grows by
 * appending to the back and shrinks by reading from the front. To
 * avoid the O(n) cost of `Array.shift()`, the implementation uses a
 * head-index pointer: `qPop` simply advances `head` and reads
 * `arr[head - 1]`. When the head index grows past half the backing
 * array, the live elements are compacted back to index 0. This gives
 * amortised O(1) for every operation.
 *
 * Functions:
 *   - qNew, qPush, qPop, qPeek, qSize, qEmpty, qClear  — basics
 *   - qToArray, qFromArr                              — bulk ops
 *   - qToString                                       — human-readable dump
 *
 * The queue is a plain JS object with three fields:
 *   - `arr`   — backing array of elements (head sits at `head`)
 *   - `head`  — index of the front element (0 when empty)
 *   - `tail`  — index just past the back element (== arr.length
 *               in this implementation; we always append to the end)
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Queue<T = any> {
  /** Backing array (live elements are arr[head..tail-1]). */
  arr: T[];
  /** Index of the front element (0 when empty). */
  head: number;
  /** Number of elements currently in the queue. */
  size: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh, empty queue. */
export function qNew<T = any>(): Queue<T> {
  return { arr: [], head: 0, size: 0 };
}

/** Build a queue from an array, preserving order (first element
 *  becomes the front of the queue).  Non-array inputs throw. */
export function qFromArr<T = any>(xs: T[]): Queue<T> {
  if (!Array.isArray(xs)) throw new Error("qFromArr: expected array, got " + kind(xs));
  // Copy to be defensive — caller might keep mutating `xs`.
  const copy = xs.slice();
  return { arr: copy, head: 0, size: copy.length };
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/** Push `x` onto the back of the queue.  Returns the queue (chainable). */
export function qPush<T>(q: Queue<T>, x: T): Queue<T> {
  assertQ(q, "qPush");
  q.arr.push(x);
  q.size++;
  return q;
}

/** Remove and return the front element.  Returns `undefined` if the
 *  queue is empty (does NOT panic — caller should check `qEmpty`
 *  first if a sentinel is ambiguous).  The head index advances; the
 *  backing array is compacted when it gets too sparse. */
export function qPop<T>(q: Queue<T>): T | undefined {
  assertQ(q, "qPop");
  if (q.size === 0) return undefined;
  const v = q.arr[q.head];
  // Avoid retaining a reference in the backing array (helps GC).
  q.arr[q.head] = undefined as any;
  q.head++;
  q.size--;
  // Compact when more than half of the array is dead space.
  if (q.head > 0 && q.head >= q.arr.length - q.size) {
    if (q.size === 0) {
      q.arr = [];
      q.head = 0;
    } else {
      q.arr = q.arr.slice(q.head, q.head + q.size);
      q.head = 0;
    }
  }
  return v;
}

/** Return the front element without removing it.  Returns `undefined`
 *  if the queue is empty. */
export function qPeek<T>(q: Queue<T>): T | undefined {
  assertQ(q, "qPeek");
  if (q.size === 0) return undefined;
  return q.arr[q.head];
}

/** Number of elements currently in the queue. */
export function qSize<T>(q: Queue<T>): number {
  assertQ(q, "qSize");
  return q.size;
}

/** True when the queue is empty. */
export function qEmpty<T>(q: Queue<T>): boolean {
  assertQ(q, "qEmpty");
  return q.size === 0;
}

/** Reset the queue to empty.  Returns the queue (chainable). */
export function qClear<T>(q: Queue<T>): Queue<T> {
  assertQ(q, "qClear");
  q.arr = [];
  q.head = 0;
  q.size = 0;
  return q;
}

// ---------------------------------------------------------------------------
// Conversion & inspection
// ---------------------------------------------------------------------------

/** Return a fresh array containing the queue's elements in front-to-
 *  back order.  Does not mutate the queue. */
export function qToArray<T>(q: Queue<T>): T[] {
  assertQ(q, "qToArray");
  if (q.size === 0) return [];
  return q.arr.slice(q.head, q.head + q.size);
}

/** Human-readable rendering: `Queue[1, 2, 3]` (front first).
 *  Elements are JSON-stringified so nested objects render safely. */
export function qToString<T>(q: Queue<T>): string {
  assertQ(q, "qToString");
  if (q.size === 0) return "Queue[]";
  const xs = qToArray(q);
  return "Queue[" + xs.map((x) => describe(x)).join(", ") + "]";
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "queue",
  fns: [
    { name: "qNew", sig: "() -> Queue", desc: "Create a fresh empty FIFO queue." },
    { name: "qPush", sig: "(q: Queue, x: any) -> Queue", desc: "Push x onto the back; chainable." },
    { name: "qPop", sig: "(q: Queue) -> any?", desc: "Remove and return the front element, or undefined if empty." },
    { name: "qPeek", sig: "(q: Queue) -> any?", desc: "Return the front element without removing it." },
    { name: "qSize", sig: "(q: Queue) -> int", desc: "Number of elements in the queue." },
    { name: "qEmpty", sig: "(q: Queue) -> bool", desc: "True when the queue is empty." },
    { name: "qClear", sig: "(q: Queue) -> Queue", desc: "Empty the queue; chainable." },
    { name: "qToArray", sig: "(q: Queue) -> [any]", desc: "Snapshot as a fresh array (front to back)." },
    { name: "qFromArr", sig: "(xs: [any]) -> Queue", desc: "Build a queue from an array (first element becomes front)." },
    { name: "qToString", sig: "(q: Queue) -> string", desc: "Human-readable rendering: Queue[a, b, c]." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("qNew", qNew);
  registerBuiltin("qPush", qPush);
  registerBuiltin("qPop", qPop);
  registerBuiltin("qPeek", qPeek);
  registerBuiltin("qSize", qSize);
  registerBuiltin("qEmpty", qEmpty);
  registerBuiltin("qClear", qClear);
  registerBuiltin("qToArray", qToArray);
  registerBuiltin("qFromArr", qFromArr);
  registerBuiltin("qToString", qToString);
}

// ---------------------------------------------------------------------------
// Validators & helpers
// ---------------------------------------------------------------------------

function assertQ<T>(x: any, fn: string): asserts x is Queue<T> {
  if (typeof x !== "object" || x === null ||
      !Array.isArray(x.arr) ||
      typeof x.head !== "number" ||
      typeof x.size !== "number") {
    throw new Error(fn + ": expected Queue, got " + kind(x));
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
