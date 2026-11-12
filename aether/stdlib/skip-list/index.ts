/**
 * Aether stdlib — `skip-list` module.
 *
 * A skip list — a probabilistic ordered data structure that
 * supports O(log n) average-time search, insert, and delete on a
 * sorted set of comparable keys.  Skip lists are an alternative
 * to balanced trees (AVL, red-black): they're simpler to
 * implement, lock-free-friendly for concurrent variants, and
 * have the same asymptotic complexity.
 *
 * Implementation: a multi-level linked list.  The bottom level is
 * a sorted linked list of all elements.  Each higher level is a
 * "express lane" — a sparser linked list that skips over some
 * elements (each element appears in the next-higher level with
 * probability 1/2).  Search starts at the top, moves right while
 * the next key is smaller than the target, then drops down a
 * level when the next key is larger; eventually reaches the
 * bottom level where the search completes.
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkipNode<K = any, V = any> {
  key: K;
  value: V;
  /** next[i] = next node at level i.  Levels are 0..maxLevel. */
  next: (SkipNode | null)[];
}

export interface SkipList<K = any, V = any> {
  /** Maximum level (top level is maxLevel-1). */
  maxLevel: number;
  /** Current highest level actually used (grows as needed). */
  level: number;
  /** Head sentinel — its key is -Infinity (or never compared). */
  head: SkipNode<K, V>;
  /** Default comparator: < 0 if a < b, 0 if equal, > 0 if a > b. */
  cmp: (a: K, b: K) => number;
  /** Number of elements in the list. */
  size: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

const MAX_LEVEL = 32;  // allows up to ~2^32 elements

function defaultCmp<K>(a: K, b: K): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function slNew<K, V>(cmp?: (a: K, b: K) => number): SkipList<K, V> {
  const head: SkipNode<K, V> = { key: undefined as K, value: undefined as V, next: new Array(MAX_LEVEL).fill(null) };
  return {
    maxLevel: MAX_LEVEL,
    level: 1,
    head,
    cmp: (cmp ?? defaultCmp) as (a: K, b: K) => number,
    size: 0,
  };
}

// ---------------------------------------------------------------------------
// Random level generation (geometric distribution, p = 0.5)
// ---------------------------------------------------------------------------

function randomLevel(): number {
  let lvl = 1;
  while (Math.random() < 0.5 && lvl < MAX_LEVEL) {
    lvl++;
  }
  return lvl;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Insert a (key, value) pair.  If the key already exists, the value
 *  is updated (and `false` is returned to indicate "updated, not
 *  inserted").  If the key is new, a new node is inserted (and
 *  `true` is returned).  The list remains sorted by key. */
export function slInsert<K, V>(sl: SkipList<K, V>, key: K, value: V): boolean {
  assertSl(sl, "slInsert");
  const update: (SkipNode<K, V> | null)[] = new Array(MAX_LEVEL).fill(null);
  let x: SkipNode<K, V> | null = sl.head;
  for (let i = sl.level - 1; i >= 0; i--) {
    while (x!.next[i] !== null && sl.cmp(x!.next[i]!.key, key) < 0) {
      x = x!.next[i];
    }
    update[i] = x;
  }
  x = x!.next[0];
  // If key already present, update the value.
  if (x !== null && sl.cmp(x.key, key) === 0) {
    x.value = value;
    return false;
  }
  // New node.
  const lvl = randomLevel();
  if (lvl > sl.level) {
    for (let i = sl.level; i < lvl; i++) {
      update[i] = sl.head;
    }
    sl.level = lvl;
  }
  const node: SkipNode<K, V> = { key, value, next: new Array(lvl).fill(null) };
  for (let i = 0; i < lvl; i++) {
    node.next[i] = update[i]!.next[i];
    update[i]!.next[i] = node;
  }
  sl.size++;
  return true;
}

/** Search for a key.  Returns the value if found, or `undefined`
 *  if not in the list. */
export function slSearch<K, V>(sl: SkipList<K, V>, key: K): V | undefined {
  assertSl(sl, "slSearch");
  let x: SkipNode<K, V> | null = sl.head;
  for (let i = sl.level - 1; i >= 0; i--) {
    while (x!.next[i] !== null && sl.cmp(x!.next[i]!.key, key) < 0) {
      x = x!.next[i];
    }
  }
  x = x!.next[0];
  if (x !== null && sl.cmp(x.key, key) === 0) return x.value;
  return undefined;
}

/** Returns true if the key is in the list. */
export function slContains<K, V>(sl: SkipList<K, V>, key: K): boolean {
  assertSl(sl, "slContains");
  return slSearch(sl, key) !== undefined;
}

/** Delete a key.  Returns true if the key was present (and removed),
 *  false if not. */
export function slDelete<K, V>(sl: SkipList<K, V>, key: K): boolean {
  assertSl(sl, "slDelete");
  const update: (SkipNode<K, V> | null)[] = new Array(MAX_LEVEL).fill(null);
  let x: SkipNode<K, V> | null = sl.head;
  for (let i = sl.level - 1; i >= 0; i--) {
    while (x!.next[i] !== null && sl.cmp(x!.next[i]!.key, key) < 0) {
      x = x!.next[i];
    }
    update[i] = x;
  }
  x = x!.next[0];
  if (x === null || sl.cmp(x.key, key) !== 0) return false;
  for (let i = 0; i < sl.level; i++) {
    if (update[i]!.next[i] !== x) break;
    update[i]!.next[i] = x.next[i];
  }
  // Shrink the level if the top levels are now empty.
  while (sl.level > 1 && sl.head.next[sl.level - 1] === null) {
    sl.level--;
  }
  sl.size--;
  return true;
}

/** Find the minimum key in the list (the first node).  Returns
 *  `undefined` if the list is empty. */
export function slMin<K, V>(sl: SkipList<K, V>): K | undefined {
  assertSl(sl, "slMin");
  const first = sl.head.next[0];
  return first ? first.key : undefined;
}

/** Find the maximum key in the list.  Returns `undefined` if empty. */
export function slMax<K, V>(sl: SkipList<K, V>): K | undefined {
  assertSl(sl, "slMax");
  let x: SkipNode<K, V> | null = sl.head;
  for (let i = sl.level - 1; i >= 0; i--) {
    while (x!.next[i] !== null) {
      x = x!.next[i];
    }
  }
  return x === sl.head ? undefined : x!.key;
}

/** Number of elements in the list. */
export function slSize<K, V>(sl: SkipList<K, V>): number {
  assertSl(sl, "slSize");
  return sl.size;
}

/** Return all keys in sorted order. */
export function slToSortedArray<K, V>(sl: SkipList<K, V>): K[] {
  assertSl(sl, "slToSortedArray");
  const out: K[] = [];
  let x: SkipNode<K, V> | null = sl.head.next[0];
  while (x !== null) {
    out.push(x.key);
    x = x.next[0];
  }
  return out;
}

/** Current height of the list (the highest level actually used). */
export function slHeight<K, V>(sl: SkipList<K, V>): number {
  assertSl(sl, "slHeight");
  return sl.level;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "skip-list",
  fns: [
    { name: "slNew", sig: "(cmp?: (a, b) -> int) -> SkipList", desc: "Create a new empty skip list with optional comparator." },
    { name: "slInsert", sig: "(sl: SkipList, key: any, value: any) -> bool", desc: "Insert (key, value); returns true if new, false if updated existing." },
    { name: "slSearch", sig: "(sl: SkipList, key: any) -> any?", desc: "Find value by key; returns undefined if not present." },
    { name: "slDelete", sig: "(sl: SkipList, key: any) -> bool", desc: "Remove a key; returns true if removed, false if absent." },
    { name: "slMin", sig: "(sl: SkipList) -> any?", desc: "Minimum key (first node), or undefined if empty." },
    { name: "slMax", sig: "(sl: SkipList) -> any?", desc: "Maximum key (last node), or undefined if empty." },
    { name: "slSize", sig: "(sl: SkipList) -> int", desc: "Number of elements in the list." },
    { name: "slContains", sig: "(sl: SkipList, key: any) -> bool", desc: "True if the key is in the list." },
    { name: "slToSortedArray", sig: "(sl: SkipList) -> any[]", desc: "All keys in sorted order." },
    { name: "slHeight", sig: "(sl: SkipList) -> int", desc: "Current height (highest level actually used)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("slNew", slNew);
  registerBuiltin("slInsert", slInsert);
  registerBuiltin("slSearch", slSearch);
  registerBuiltin("slDelete", slDelete);
  registerBuiltin("slMin", slMin);
  registerBuiltin("slMax", slMax);
  registerBuiltin("slSize", slSize);
  registerBuiltin("slContains", slContains);
  registerBuiltin("slToSortedArray", slToSortedArray);
  registerBuiltin("slHeight", slHeight);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertSl(x: any, fn: string): asserts x is SkipList {
  if (typeof x !== "object" || x === null ||
      typeof x.maxLevel !== "number" ||
      typeof x.level !== "number" ||
      typeof x.head !== "object" || x.head === null ||
      typeof x.cmp !== "function" ||
      typeof x.size !== "number") {
    throw new Error(fn + ": expected SkipList, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
