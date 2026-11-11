/**
 * Aether stdlib — `heap` module.
 *
 * Binary heap / priority queue.  A heap is `{ arr: any[], cmp }`
 * where `cmp(a, b)` returns true when `a` should bubble up over `b`
 * (i.e., `a` is "higher priority").  By default we use a min-heap
 * (smaller values bubble up).  The `arr` slot 0 is kept unused so
 * the standard parent/left/right index formulas hold:
 *
 *   parent(i)   = (i - 1) >> 1     (or i >> 1 if 1-indexed)
 *   left(i)     = 2 * i + 1
 *   right(i)    = 2 * i + 2
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Cmp<T> = (a: T, b: T) => boolean;
export interface Heap<T> {
  arr: T[];
  cmp: Cmp<T>;
}

const defaultCmp: Cmp<any> = (a, b) => a < b;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh heap with the given comparator (default: min-heap). */
export function heapNew<T>(cmp?: Cmp<T>): Heap<T> {
  return { arr: [], cmp: cmp ?? defaultCmp };
}

/** Build a heap from an existing array by sifting each non-leaf down. */
export function heapFromArray<T>(arr: T[], cmp?: Cmp<T>): Heap<T> {
  if (!Array.isArray(arr)) throw new Error("heapFromArray: expected array");
  const h: Heap<T> = { arr: arr.slice(), cmp: cmp ?? defaultCmp };
  for (let i = (h.arr.length >> 1) - 1; i >= 0; i--) heapSiftDown(h, i);
  return h;
}

/** Floyd's heapify: same as `heapFromArray` (alias). */
export function heapify<T>(arr: T[], cmp?: Cmp<T>): Heap<T> {
  return heapFromArray(arr, cmp);
}

// ---------------------------------------------------------------------------
// Index helpers (exposed for teaching / debugging)
// ---------------------------------------------------------------------------

export function heapParent(i: number): number {
  if (!Number.isInteger(i) || i < 0) throw new Error("heapParent: index must be non-negative int");
  return (i - 1) >> 1;
}

export function heapLeft(i: number): number {
  if (!Number.isInteger(i) || i < 0) throw new Error("heapLeft: index must be non-negative int");
  return 2 * i + 1;
}

export function heapRight(i: number): number {
  if (!Number.isInteger(i) || i < 0) throw new Error("heapRight: index must be non-negative int");
  return 2 * i + 2;
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/** Insert `v` into the heap. */
export function heapPush<T>(h: Heap<T>, v: T): void {
  assertHeap(h, "heapPush");
  h.arr.push(v);
  heapSiftUp(h, h.arr.length - 1);
}

/** Remove and return the top (highest-priority) element.  Panics if empty. */
export function heapPop<T>(h: Heap<T>): T {
  assertHeap(h, "heapPop");
  if (h.arr.length === 0) throw new Error("heapPop: heap is empty");
  const top = h.arr[0];
  const last = h.arr.pop() as T;
  if (h.arr.length > 0) {
    h.arr[0] = last;
    heapSiftDown(h, 0);
  }
  return top;
}

/** Return the top element without removing it (panics if empty). */
export function heapPeek<T>(h: Heap<T>): T {
  assertHeap(h, "heapPeek");
  if (h.arr.length === 0) throw new Error("heapPeek: heap is empty");
  return h.arr[0];
}

/** Number of elements in the heap. */
export function heapSize<T>(h: Heap<T>): number {
  assertHeap(h, "heapSize");
  return h.arr.length;
}

/** True when the heap has no elements. */
export function heapIsEmpty<T>(h: Heap<T>): boolean {
  assertHeap(h, "heapIsEmpty");
  return h.arr.length === 0;
}

/** Pop the top and push `v` in one operation (more efficient than pop+push). */
export function heapReplace<T>(h: Heap<T>, v: T): T {
  assertHeap(h, "heapReplace");
  if (h.arr.length === 0) throw new Error("heapReplace: heap is empty");
  const top = h.arr[0];
  h.arr[0] = v;
  heapSiftDown(h, 0);
  return top;
}

// ---------------------------------------------------------------------------
// Heap-sort
// ---------------------------------------------------------------------------

/** Sort `arr` in ascending order using heap-sort (descending if cmp is `>`).
 *  Returns a new array; the input is not mutated. */
export function heapSort<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("heapSort: expected array");
  const h = heapFromArray(arr, cmp);
  const out: T[] = [];
  while (h.arr.length > 0) out.push(heapPop(h));
  return out;
}

/** Merge two heaps (with the same comparator) into a new heap. */
export function heapMerge<T>(a: Heap<T>, b: Heap<T>): Heap<T> {
  assertHeap(a, "heapMerge");
  assertHeap(b, "heapMerge");
  // We don't assume the cmps are referentially equal — pick a's cmp.
  const merged: Heap<T> = { arr: a.arr.concat(b.arr), cmp: a.cmp };
  for (let i = (merged.arr.length >> 1) - 1; i >= 0; i--) heapSiftDown(merged, i);
  return merged;
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

/** Update the key (priority) of the element at index `i` to be `key`
 *  (which must compare "higher priority" than the current value).
 *  Sifts up to restore the heap property. */
export function heapUpdateKey<T>(h: Heap<T>, i: number, key: T): void {
  assertHeap(h, "heapUpdateKey");
  if (!Number.isInteger(i) || i < 0 || i >= h.arr.length) {
    throw new Error("heapUpdateKey: index out of bounds");
  }
  if (!h.cmp(key, h.arr[i])) {
    throw new Error("heapUpdateKey: new key is not higher priority than current");
  }
  h.arr[i] = key;
  heapSiftUp(h, i);
}

/** Delete the element at index `i` and restore the heap property. */
export function heapDelete<T>(h: Heap<T>, i: number): void {
  assertHeap(h, "heapDelete");
  if (!Number.isInteger(i) || i < 0 || i >= h.arr.length) {
    throw new Error("heapDelete: index out of bounds");
  }
  // Move last element into i and sift; if that fails, fall back to a re-heapify.
  const last = h.arr.pop() as T;
  if (i < h.arr.length) {
    const old = h.arr[i];
    h.arr[i] = last;
    if (h.cmp(h.arr[i], old)) heapSiftUp(h, i);
    else heapSiftDown(h, i);
  }
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** Drain the heap into a sorted array (pops repeatedly).  Does NOT
 *  mutate the original heap's logical contents — but it does empty it. */
export function heapToSortedArray<T>(h: Heap<T>): T[] {
  assertHeap(h, "heapToSortedArray");
  const out: T[] = [];
  while (h.arr.length > 0) {
    const v: T = heapPop(h);
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Internal — sift up / down
// ---------------------------------------------------------------------------

/** Sift the element at index `i` up to restore the heap property. */
export function heapSiftUp<T>(h: Heap<T>, i: number): void {
  assertHeap(h, "heapSiftUp");
  let idx = i;
  while (idx > 0) {
    const p = (idx - 1) >> 1;
    if (h.cmp(h.arr[idx], h.arr[p])) {
      const tmp = h.arr[idx];
      h.arr[idx] = h.arr[p];
      h.arr[p] = tmp;
      idx = p;
    } else {
      break;
    }
  }
}

/** Sift the element at index `i` down to restore the heap property. */
export function heapSiftDown<T>(h: Heap<T>, i: number): void {
  assertHeap(h, "heapSiftDown");
  const n = h.arr.length;
  let idx = i;
  while (true) {
    const l = 2 * idx + 1;
    const r = 2 * idx + 2;
    let best = idx;
    if (l < n && h.cmp(h.arr[l], h.arr[best])) best = l;
    if (r < n && h.cmp(h.arr[r], h.arr[best])) best = r;
    if (best === idx) break;
    const tmp = h.arr[idx];
    h.arr[idx] = h.arr[best];
    h.arr[best] = tmp;
    idx = best;
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "heap",
  fns: [
    { name: "heapNew", sig: "(cmp?) -> Heap", desc: "Create a fresh heap (min-heap by default)." },
    { name: "heapPush", sig: "(h, v) -> void", desc: "Insert v into the heap." },
    { name: "heapPop", sig: "(h) -> any", desc: "Remove and return the top element (panics if empty)." },
    { name: "heapPeek", sig: "(h) -> any", desc: "Return the top element without removing." },
    { name: "heapSize", sig: "(h) -> int", desc: "Number of elements." },
    { name: "heapIsEmpty", sig: "(h) -> bool", desc: "True when the heap has no elements." },
    { name: "heapify", sig: "(arr, cmp?) -> Heap", desc: "Build a heap from an existing array (Floyd)." },
    { name: "heapSort", sig: "(arr, cmp?) -> any[]", desc: "Heap-sort an array (returns a new array)." },
    { name: "heapMerge", sig: "(a, b) -> Heap", desc: "Merge two heaps (assumes same comparator)." },
    { name: "heapReplace", sig: "(h, v) -> any", desc: "Pop the top and push v in one step." },
    { name: "heapUpdateKey", sig: "(h, i, key) -> void", desc: "Increase/decrease priority of element i (sifts up)." },
    { name: "heapDelete", sig: "(h, i) -> void", desc: "Delete the element at index i." },
    { name: "heapToSortedArray", sig: "(h) -> any[]", desc: "Drain the heap into a sorted array (empties the heap)." },
    { name: "heapFromArray", sig: "(arr, cmp?) -> Heap", desc: "Build a heap from an existing array (alias of heapify)." },
    { name: "heapParent", sig: "(i: int) -> int", desc: "Index of parent of i (0-indexed)." },
    { name: "heapLeft", sig: "(i: int) -> int", desc: "Index of left child of i." },
    { name: "heapRight", sig: "(i: int) -> int", desc: "Index of right child of i." },
    { name: "heapSiftUp", sig: "(h, i) -> void", desc: "Restore heap property by sifting i upward." },
    { name: "heapSiftDown", sig: "(h, i) -> void", desc: "Restore heap property by sifting i downward." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("heapNew", heapNew);
  registerBuiltin("heapPush", heapPush);
  registerBuiltin("heapPop", heapPop);
  registerBuiltin("heapPeek", heapPeek);
  registerBuiltin("heapSize", heapSize);
  registerBuiltin("heapIsEmpty", heapIsEmpty);
  registerBuiltin("heapify", heapify);
  registerBuiltin("heapSort", heapSort);
  registerBuiltin("heapMerge", heapMerge);
  registerBuiltin("heapReplace", heapReplace);
  registerBuiltin("heapUpdateKey", heapUpdateKey);
  registerBuiltin("heapDelete", heapDelete);
  registerBuiltin("heapToSortedArray", heapToSortedArray);
  registerBuiltin("heapFromArray", heapFromArray);
  registerBuiltin("heapParent", heapParent);
  registerBuiltin("heapLeft", heapLeft);
  registerBuiltin("heapRight", heapRight);
  registerBuiltin("heapSiftUp", heapSiftUp);
  registerBuiltin("heapSiftDown", heapSiftDown);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertHeap(x: any, fn: string): asserts x is Heap<any> {
  if (typeof x !== "object" || x === null || !Array.isArray(x.arr) || typeof x.cmp !== "function") {
    throw new Error(fn + ": expected heap, got " + (x === null ? "null" : x === undefined ? "undefined" : typeof x));
  }
}
