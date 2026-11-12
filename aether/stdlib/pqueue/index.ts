/**
 * Aether stdlib — `pqueue` module.
 *
 * A binary min-heap priority queue with a custom comparator (or
 * "smaller comes first" by default).  Supports insertion, peek/pop,
 * arbitrary key updates (for Dijkstra-style decrement-key), merge,
 * and conversion to a sorted array.  All operations are O(log n)
 * except peek/size/empty (O(1)) and merge/toSorted (O(n) or
 * O(n log n)).
 *
 * Functions:
 *   - pqNew, pqPush, pqPop, pqPeek   — basics
 *   - pqSize, pqEmpty                — introspection
 *   - pqMerge                        — combine two queues
 *   - pqUpdateKey                    — re-position an element
 *   - pqDelete                       — remove by identity
 *   - pqToSorted                     — snapshot sort
 *
 * Each element is wrapped in a record `{ item, seq }` so that
 * `pqDelete`/`pqUpdateKey` can find it in O(n). The internal heap
 * is a plain JS array; sift-up / sift-down keep it invariant.
 *
 * All functions throw a plain `Error` on invalid input.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PQItem<T = any> {
  item: T;
  /** Monotonic insertion sequence number — used as a tie-breaker so
   *  equal-priority items come out in FIFO order. */
  seq: number;
}

export interface PriorityQueue<T = any> {
  /** Heap array (0-indexed binary heap). */
  heap: PQItem<T>[];
  /** Comparator: returns true if `a` should pop before `b`.  The
   *  default is `a < b` (min-heap on the item itself). */
  less: (a: T, b: T) => boolean;
  /** Monotonic counter for tie-breakers. */
  nextSeq: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh priority queue.  The optional comparator returns
 *  true if `a` should come out *before* `b` (min-heap by default). */
export function pqNew<T = any>(less?: (a: T, b: T) => boolean): PriorityQueue<T> {
  return {
    heap: [],
    less: less ?? ((a: any, b: any) => a < b),
    nextSeq: 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lt<T>(q: PriorityQueue<T>, i: PQItem<T>, j: PQItem<T>): boolean {
  // Lower priority (per `less`) pops first; ties broken by seq (FIFO).
  if (q.less(i.item, j.item)) return true;
  if (q.less(j.item, i.item)) return false;
  return i.seq < j.seq;
}

function swap<T>(q: PriorityQueue<T>, i: number, j: number): void {
  const tmp = q.heap[i];
  q.heap[i] = q.heap[j];
  q.heap[j] = tmp;
}

function siftUp<T>(q: PriorityQueue<T>, i: number): void {
  while (i > 0) {
    const parent = (i - 1) >>> 1;
    if (lt(q, q.heap[i], q.heap[parent])) {
      swap(q, i, parent);
      i = parent;
    } else {
      break;
    }
  }
}

function siftDown<T>(q: PriorityQueue<T>, i: number): void {
  const n = q.heap.length;
  while (true) {
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    let smallest = i;
    if (left < n && lt(q, q.heap[left], q.heap[smallest])) smallest = left;
    if (right < n && lt(q, q.heap[right], q.heap[smallest])) smallest = right;
    if (smallest === i) break;
    swap(q, i, smallest);
    i = smallest;
  }
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Insert `item` into the queue.  Returns the queue (chainable). */
export function pqPush<T>(q: PriorityQueue<T>, item: T): PriorityQueue<T> {
  assertQ(q, "pqPush");
  const entry: PQItem<T> = { item, seq: q.nextSeq++ };
  q.heap.push(entry);
  siftUp(q, q.heap.length - 1);
  return q;
}

/** Remove and return the top element.  Returns `undefined` if the
 *  queue is empty. */
export function pqPop<T>(q: PriorityQueue<T>): T | undefined {
  assertQ(q, "pqPop");
  if (q.heap.length === 0) return undefined;
  const top = q.heap[0];
  const last = q.heap.pop()!;
  if (q.heap.length > 0) {
    q.heap[0] = last;
    siftDown(q, 0);
  }
  return top.item;
}

/** Look at the top element without removing it.  Returns `undefined`
 *  if the queue is empty. */
export function pqPeek<T>(q: PriorityQueue<T>): T | undefined {
  assertQ(q, "pqPeek");
  if (q.heap.length === 0) return undefined;
  return q.heap[0].item;
}

/** Number of elements in the queue. */
export function pqSize<T>(q: PriorityQueue<T>): number {
  assertQ(q, "pqSize");
  return q.heap.length;
}

/** True if the queue is empty. */
export function pqEmpty<T>(q: PriorityQueue<T>): boolean {
  assertQ(q, "pqEmpty");
  return q.heap.length === 0;
}

/** Merge `src` into `dst`, emptying `src`.  Both queues MUST share
 *  the same `less` comparator (we copy entries over verbatim and
 *  re-heapify by repeated siftUp, which is O(n log n)).  Returns
 *  `dst` (chainable). */
export function pqMerge<T>(dst: PriorityQueue<T>, src: PriorityQueue<T>): PriorityQueue<T> {
  assertQ(dst, "pqMerge");
  assertQ(src, "pqMerge");
  for (const entry of src.heap) {
    dst.heap.push(entry);
    siftUp(dst, dst.heap.length - 1);
  }
  src.heap = [];
  src.nextSeq = 0;
  return dst;
}

/** Find an entry by identity (`===`) and replace its item with
 *  `newItem`.  Re-sifts to maintain the heap invariant.  Returns
 *  true if found & updated, false otherwise. */
export function pqUpdateKey<T>(q: PriorityQueue<T>, oldItem: T, newItem: T): boolean {
  assertQ(q, "pqUpdateKey");
  let i = -1;
  for (let k = 0; k < q.heap.length; k++) {
    if (q.heap[k].item === oldItem) { i = k; break; }
  }
  if (i === -1) return false;
  q.heap[i].item = newItem;
  // Need to re-sift both directions.
  siftUp(q, i);
  siftDown(q, i);
  return true;
}

/** Find an entry by identity and remove it.  Returns true if
 *  removed, false otherwise.  O(n) lookup + O(log n) sift. */
export function pqDelete<T>(q: PriorityQueue<T>, item: T): boolean {
  assertQ(q, "pqDelete");
  let i = -1;
  for (let k = 0; k < q.heap.length; k++) {
    if (q.heap[k].item === item) { i = k; break; }
  }
  if (i === -1) return false;
  const last = q.heap.pop()!;
  if (i < q.heap.length) {
    q.heap[i] = last;
    siftUp(q, i);
    siftDown(q, i);
  }
  return true;
}

/** Return all items in pop order (without modifying the queue). */
export function pqToSorted<T>(q: PriorityQueue<T>): T[] {
  assertQ(q, "pqToSorted");
  // Copy and pop — O(n log n) but stable & simple.
  const copy: PriorityQueue<T> = {
    heap: q.heap.map((e) => ({ item: e.item, seq: e.seq })),
    less: q.less,
    nextSeq: q.nextSeq,
  };
  const out: T[] = [];
  while (copy.heap.length > 0) {
    const top = copy.heap[0];
    const last = copy.heap.pop()!;
    if (copy.heap.length > 0) {
      copy.heap[0] = last;
      siftDown(copy, 0);
    }
    out.push(top.item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "pqueue",
  fns: [
    { name: "pqNew", sig: "(less?: (a, b) -> bool) -> PriorityQueue", desc: "Create a fresh min-heap priority queue." },
    { name: "pqPush", sig: "(q: PriorityQueue, item: any) -> PriorityQueue", desc: "Insert an item; chainable." },
    { name: "pqPop", sig: "(q: PriorityQueue) -> any?", desc: "Remove and return the top element." },
    { name: "pqPeek", sig: "(q: PriorityQueue) -> any?", desc: "Look at the top element without removing it." },
    { name: "pqSize", sig: "(q: PriorityQueue) -> int", desc: "Number of elements." },
    { name: "pqEmpty", sig: "(q: PriorityQueue) -> bool", desc: "True if empty." },
    { name: "pqMerge", sig: "(dst: PriorityQueue, src: PriorityQueue) -> PriorityQueue", desc: "Merge src into dst (empties src)." },
    { name: "pqUpdateKey", sig: "(q: PriorityQueue, oldItem: any, newItem: any) -> bool", desc: "Replace an item by identity; re-sift." },
    { name: "pqDelete", sig: "(q: PriorityQueue, item: any) -> bool", desc: "Remove an item by identity." },
    { name: "pqToSorted", sig: "(q: PriorityQueue) -> any[]", desc: "Snapshot of all items in pop order (queue unchanged)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("pqNew", pqNew);
  registerBuiltin("pqPush", pqPush);
  registerBuiltin("pqPop", pqPop);
  registerBuiltin("pqPeek", pqPeek);
  registerBuiltin("pqSize", pqSize);
  registerBuiltin("pqEmpty", pqEmpty);
  registerBuiltin("pqMerge", pqMerge);
  registerBuiltin("pqUpdateKey", pqUpdateKey);
  registerBuiltin("pqDelete", pqDelete);
  registerBuiltin("pqToSorted", pqToSorted);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertQ<T>(x: any, fn: string): asserts x is PriorityQueue<T> {
  if (typeof x !== "object" || x === null ||
      !Array.isArray(x.heap) ||
      typeof x.less !== "function" ||
      typeof x.nextSeq !== "number") {
    throw new Error(fn + ": expected PriorityQueue, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
