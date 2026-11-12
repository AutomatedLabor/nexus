/**
 * Aether stdlib — `deque` module.
 *
 * A double-ended queue ("deque" — pronounced "deck"). Elements can
 * be added or removed at both ends in O(1) amortised time.  This
 * generalises both stacks (one end only) and queues (in one end,
 * out the other).
 *
 * Implementation: a circular buffer with a `head` index and a
 * `size` count.  The backing array grows geometrically (2x) when
 * full; `dqPushBack`/`dqPushFront` write into the slot just
 * past/before the current live range.  When the live range wraps
 * past the end of the backing array, the modulo arithmetic handles
 * it transparently.  This is the standard textbook deque.
 *
 * Functions:
 *   - dqNew, dqPushFront, dqPushBack, dqPopFront, dqPopBack,
 *     dqPeekFront, dqPeekBack, dqSize, dqEmpty, dqToArray
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Deque<T = any> {
  /** Backing circular buffer. */
  buf: T[];
  /** Index of the front element (0 when empty). */
  head: number;
  /** Number of live elements. */
  size: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh, empty deque. */
export function dqNew<T = any>(): Deque<T> {
  return { buf: [], head: 0, size: 0 };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Ensure there's room for one more element.  If the backing buffer
 *  is full, double its capacity and unwrap any wrap-around. */
function ensureCapacity<T>(d: Deque<T>): void {
  if (d.size < d.buf.length) return;
  // Need to grow.  Always unwrap to a flat array (head = 0) so the
  // new buffer is contiguous — simpler than a partial copy.
  const cap = d.buf.length === 0 ? 4 : d.buf.length * 2;
  const fresh = new Array(cap);
  for (let i = 0; i < d.size; i++) {
    fresh[i] = d.buf[(d.head + i) % d.buf.length];
  }
  d.buf = fresh;
  d.head = 0;
}

/** Internal: index of the slot just before `head` (wrapping). */
function prevIndex<T>(d: Deque<T>, i: number): number {
  const cap = d.buf.length;
  return (i - 1 + cap) % cap;
}

/** Internal: index of the slot just after the back element. */
function backIndex<T>(d: Deque<T>): number {
  const cap = d.buf.length;
  return (d.head + d.size) % cap;
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/** Push `x` onto the front.  Returns the deque (chainable). */
export function dqPushFront<T>(d: Deque<T>, x: T): Deque<T> {
  assertDq(d, "dqPushFront");
  ensureCapacity(d);
  d.head = prevIndex(d, d.head);
  d.buf[d.head] = x;
  d.size++;
  return d;
}

/** Push `x` onto the back.  Returns the deque (chainable). */
export function dqPushBack<T>(d: Deque<T>, x: T): Deque<T> {
  assertDq(d, "dqPushBack");
  ensureCapacity(d);
  d.buf[backIndex(d)] = x;
  d.size++;
  return d;
}

/** Remove and return the front element.  Returns `undefined` if
 *  the deque is empty (does NOT panic). */
export function dqPopFront<T>(d: Deque<T>): T | undefined {
  assertDq(d, "dqPopFront");
  if (d.size === 0) return undefined;
  const v = d.buf[d.head];
  d.buf[d.head] = undefined as any;  // help GC
  d.head = (d.head + 1) % d.buf.length;
  d.size--;
  return v;
}

/** Remove and return the back element.  Returns `undefined` if
 *  the deque is empty (does NOT panic). */
export function dqPopBack<T>(d: Deque<T>): T | undefined {
  assertDq(d, "dqPopBack");
  if (d.size === 0) return undefined;
  const idx = (d.head + d.size - 1) % d.buf.length;
  const v = d.buf[idx];
  d.buf[idx] = undefined as any;  // help GC
  d.size--;
  return v;
}

/** Return the front element without removing it.  Returns `undefined`
 *  if the deque is empty. */
export function dqPeekFront<T>(d: Deque<T>): T | undefined {
  assertDq(d, "dqPeekFront");
  if (d.size === 0) return undefined;
  return d.buf[d.head];
}

/** Return the back element without removing it.  Returns `undefined`
 *  if the deque is empty. */
export function dqPeekBack<T>(d: Deque<T>): T | undefined {
  assertDq(d, "dqPeekBack");
  if (d.size === 0) return undefined;
  const idx = (d.head + d.size - 1) % d.buf.length;
  return d.buf[idx];
}

/** Number of elements currently in the deque. */
export function dqSize<T>(d: Deque<T>): number {
  assertDq(d, "dqSize");
  return d.size;
}

/** True when the deque is empty. */
export function dqEmpty<T>(d: Deque<T>): boolean {
  assertDq(d, "dqEmpty");
  return d.size === 0;
}

/** Return a fresh array containing the deque's elements in
 *  front-to-back order.  Does not mutate the deque. */
export function dqToArray<T>(d: Deque<T>): T[] {
  assertDq(d, "dqToArray");
  const out: T[] = new Array(d.size);
  for (let i = 0; i < d.size; i++) {
    out[i] = d.buf[(d.head + i) % d.buf.length];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "deque",
  fns: [
    { name: "dqNew", sig: "() -> Deque", desc: "Create a fresh empty deque." },
    { name: "dqPushFront", sig: "(d: Deque, x: any) -> Deque", desc: "Push x to the front; chainable." },
    { name: "dqPushBack", sig: "(d: Deque, x: any) -> Deque", desc: "Push x to the back; chainable." },
    { name: "dqPopFront", sig: "(d: Deque) -> any?", desc: "Remove and return the front element, or undefined if empty." },
    { name: "dqPopBack", sig: "(d: Deque) -> any?", desc: "Remove and return the back element, or undefined if empty." },
    { name: "dqPeekFront", sig: "(d: Deque) -> any?", desc: "Read the front element without removing it." },
    { name: "dqPeekBack", sig: "(d: Deque) -> any?", desc: "Read the back element without removing it." },
    { name: "dqSize", sig: "(d: Deque) -> int", desc: "Number of elements in the deque." },
    { name: "dqEmpty", sig: "(d: Deque) -> bool", desc: "True when the deque is empty." },
    { name: "dqToArray", sig: "(d: Deque) -> [any]", desc: "Snapshot as a fresh array (front to back)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("dqNew", dqNew);
  registerBuiltin("dqPushFront", dqPushFront);
  registerBuiltin("dqPushBack", dqPushBack);
  registerBuiltin("dqPopFront", dqPopFront);
  registerBuiltin("dqPopBack", dqPopBack);
  registerBuiltin("dqPeekFront", dqPeekFront);
  registerBuiltin("dqPeekBack", dqPeekBack);
  registerBuiltin("dqSize", dqSize);
  registerBuiltin("dqEmpty", dqEmpty);
  registerBuiltin("dqToArray", dqToArray);
}

// ---------------------------------------------------------------------------
// Validators & helpers
// ---------------------------------------------------------------------------

function assertDq<T>(x: any, fn: string): asserts x is Deque<T> {
  if (typeof x !== "object" || x === null ||
      !Array.isArray(x.buf) ||
      typeof x.head !== "number" ||
      typeof x.size !== "number") {
    throw new Error(fn + ": expected Deque, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
