/**
 * Aether stdlib — `interval` module.
 *
 * An interval tree: a sorted, search-optimised collection of
 * half-open intervals `[low, high)` with an associated value.
 * Supports insertion, deletion, and queries:
 *
 *   - "Does any interval contain this point?"        -> intervalSearchPoint
 *   - "Does any interval overlap this range?"        -> intervalSearchRange
 *   - "Give me every interval overlapping this range" -> intervalSearchAll
 *   - "What's the smallest low endpoint / largest high endpoint?"
 *
 * Implementation: a classic CLRS-style augmented binary search tree
 * keyed by `low`.  Each node stores `max` — the maximum `high`
 * among all intervals in the subtree rooted at that node — so range
 * queries can prune whole subtrees when their `max` is below the
 * query's lower bound.  The tree is *not* self-balancing; the worst
 * case is O(n) for adversarial insertion order, but average case is
 * O(log n) for randomly ordered inputs.  For pathological inputs,
 * pair with a skip-list or RB-tree module.
 *
 * Half-open semantics: an interval `[low, high)` contains a point `p`
 * iff `low <= p < high`.  Two intervals `[a, b)` and `[c, d)` overlap
 * iff `a < d && c < b`.
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntervalNode<V = any> {
  low: number;
  high: number;
  value: V;
  /** Maximum `high` in the subtree rooted at this node. */
  max: number;
  left: IntervalNode<V> | null;
  right: IntervalNode<V> | null;
}

export interface IntervalTree<V = any> {
  root: IntervalNode<V> | null;
  size: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh, empty interval tree. */
export function intervalNew<V = any>(): IntervalTree<V> {
  return { root: null, size: 0 };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function updateMax<V>(n: IntervalNode<V>): void {
  let m = n.high;
  if (n.left !== null && n.left.max > m) m = n.left.max;
  if (n.right !== null && n.right.max > m) m = n.right.max;
  n.max = m;
}

function insertNode<V>(
  parent: IntervalNode<V> | null,
  node: IntervalNode<V>,
): IntervalNode<V> {
  if (parent === null) {
    node.max = node.high;
    return node;
  }
  if (node.low < parent.low) {
    parent.left = insertNode(parent.left, node);
  } else {
    parent.right = insertNode(parent.right, node);
  }
  updateMax(parent);
  return parent;
}

function findMin<V>(n: IntervalNode<V>): IntervalNode<V> {
  let cur = n;
  while (cur.left !== null) cur = cur.left;
  return cur;
}

function deleteNode<V>(
  n: IntervalNode<V> | null,
  low: number,
  high: number,
): { node: IntervalNode<V> | null; removed: boolean } {
  if (n === null) return { node: null, removed: false };
  if (low < n.low) {
    const r = deleteNode(n.left, low, high);
    n.left = r.node;
    if (r.removed) updateMax(n);
    return { node: n, removed: r.removed };
  } else if (low > n.low) {
    const r = deleteNode(n.right, low, high);
    n.right = r.node;
    if (r.removed) updateMax(n);
    return { node: n, removed: r.removed };
  }
  // low == n.low. Check if high also matches.
  if (n.high !== high) {
    // Same low, different high: try right subtree (in-order successor
    // convention). Standard BST deletion with one key collision.
    const r = deleteNode(n.right, low, high);
    n.right = r.node;
    if (r.removed) updateMax(n);
    return { node: n, removed: r.removed };
  }
  // Found the node. Standard BST delete with two-child promotion.
  if (n.left === null) return { node: n.right, removed: true };
  if (n.right === null) return { node: n.left, removed: true };
  // Two children: replace with in-order successor.
  const succ = findMin(n.right);
  n.low = succ.low;
  n.high = succ.high;
  n.value = succ.value;
  const r = deleteNode(n.right, succ.low, succ.high);
  n.right = r.node;
  updateMax(n);
  return { node: n, removed: true };
}

/** Overlap test for half-open intervals. */
function overlaps(a: number, b: number, c: number, d: number): boolean {
  return a < d && c < b;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Insert the interval `[low, high)` with the given value.  Returns
 *  the tree (chainable).  Throws if `low > high`.  Duplicate
 *  intervals (same low AND high) are allowed; they coexist in the
 *  tree and `intervalDelete` removes one at a time. */
export function intervalInsert<V>(
  t: IntervalTree<V>,
  low: number,
  high: number,
  value: V = undefined as any,
): IntervalTree<V> {
  assertTree(t, "intervalInsert");
  assertNum(low, "intervalInsert", "low");
  assertNum(high, "intervalInsert", "high");
  if (low > high) throw new Error("intervalInsert: low (" + low + ") > high (" + high + ")");
  const node: IntervalNode<V> = { low, high, value, max: high, left: null, right: null };
  t.root = insertNode(t.root, node);
  t.size++;
  return t;
}

/** Delete one interval whose `low` and `high` match exactly.
 *  Returns true if an interval was removed, false if no match.
 *  If multiple intervals share the same `(low, high)`, only one
 *  is removed per call. */
export function intervalDelete<V>(
  t: IntervalTree<V>,
  low: number,
  high: number,
): boolean {
  assertTree(t, "intervalDelete");
  assertNum(low, "intervalDelete", "low");
  assertNum(high, "intervalDelete", "high");
  const r = deleteNode(t.root, low, high);
  t.root = r.node;
  if (r.removed) t.size--;
  return r.removed;
}

/** Find any interval containing point `p`.  Returns the interval's
 *  value (or `undefined` if none).  Because the tree is keyed by
 *  `low` and augmented with `max`, the search prunes any subtree
 *  whose `max` is below `p`. */
export function intervalSearchPoint<V>(t: IntervalTree<V>, p: number): V | undefined {
  assertTree(t, "intervalSearchPoint");
  assertNum(p, "intervalSearchPoint", "p");
  let n = t.root;
  while (n !== null) {
    if (p >= n.low && p < n.high) return n.value;
    if (n.left !== null && n.left.max >= p) {
      n = n.left;
    } else {
      n = n.right;
    }
  }
  return undefined;
}

/** Find any interval overlapping `[low, high)`.  Returns the
 *  interval's value (or `undefined` if none).  Uses `max` for
 *  pruning: a subtree whose `max` is `<= low` cannot overlap. */
export function intervalSearchRange<V>(
  t: IntervalTree<V>,
  low: number,
  high: number,
): V | undefined {
  assertTree(t, "intervalSearchRange");
  assertNum(low, "intervalSearchRange", "low");
  assertNum(high, "intervalSearchRange", "high");
  if (low > high) throw new Error("intervalSearchRange: low > high");
  let n = t.root;
  while (n !== null) {
    if (overlaps(low, high, n.low, n.high)) return n.value;
    if (n.left !== null && n.left.max > low) {
      n = n.left;
    } else {
      n = n.right;
    }
  }
  return undefined;
}

/** Find ALL intervals overlapping `[low, high)`.  Returns an
 *  array of `{ low, high, value }` triples (in pre-order; for sorted
 *  order use `intervalToSortedArray` and filter). */
export function intervalSearchAll<V>(
  t: IntervalTree<V>,
  low: number,
  high: number,
): Array<{ low: number; high: number; value: V }> {
  assertTree(t, "intervalSearchAll");
  assertNum(low, "intervalSearchAll", "low");
  assertNum(high, "intervalSearchAll", "high");
  if (low > high) throw new Error("intervalSearchAll: low > high");
  const out: Array<{ low: number; high: number; value: V }> = [];
  const stack: IntervalNode<V>[] = [];
  if (t.root !== null) stack.push(t.root);
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (overlaps(low, high, n.low, n.high)) {
      out.push({ low: n.low, high: n.high, value: n.value });
    }
    // Prune: a child whose max <= low cannot overlap [low, high).
    if (n.left !== null && n.left.max > low) stack.push(n.left);
    if (n.right !== null && n.right.max > low) stack.push(n.right);
  }
  return out;
}

/** Number of intervals in the tree. */
export function intervalSize<V>(t: IntervalTree<V>): number {
  assertTree(t, "intervalSize");
  return t.size;
}

/** Minimum `low` endpoint among all intervals.  Returns
 *  `undefined` if the tree is empty. */
export function intervalMin<V>(t: IntervalTree<V>): number | undefined {
  assertTree(t, "intervalMin");
  if (t.root === null) return undefined;
  return findMin(t.root).low;
}

/** Maximum `high` endpoint among all intervals.  Returns
 *  `undefined` if the tree is empty.  This is the root's `max`
 *  field, so it's O(1). */
export function intervalMax<V>(t: IntervalTree<V>): number | undefined {
  assertTree(t, "intervalMax");
  if (t.root === null) return undefined;
  return t.root.max;
}

/** All intervals in ascending order of `low` (in-order traversal).
 *  Returns an array of `{ low, high, value }` triples. */
export function intervalToSortedArray<V>(
  t: IntervalTree<V>,
): Array<{ low: number; high: number; value: V }> {
  assertTree(t, "intervalToSortedArray");
  const out: Array<{ low: number; high: number; value: V }> = [];
  const stack: IntervalNode<V>[] = [];
  let n: IntervalNode<V> | null = t.root;
  while (n !== null || stack.length > 0) {
    while (n !== null) {
      stack.push(n);
      n = n.left;
    }
    n = stack.pop()!;
    out.push({ low: n.low, high: n.high, value: n.value });
    n = n.right;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "interval",
  fns: [
    { name: "intervalNew", sig: "() -> IntervalTree", desc: "Create a fresh empty interval tree." },
    { name: "intervalInsert", sig: "(t: IntervalTree, low: int, high: int, value?: any) -> IntervalTree", desc: "Insert [low, high) with optional value; chainable." },
    { name: "intervalDelete", sig: "(t: IntervalTree, low: int, high: int) -> bool", desc: "Delete one matching interval; returns true if removed." },
    { name: "intervalSearchPoint", sig: "(t: IntervalTree, p: int) -> any?", desc: "Find any interval containing point p; returns value or undefined." },
    { name: "intervalSearchRange", sig: "(t: IntervalTree, low: int, high: int) -> any?", desc: "Find any interval overlapping [low, high); returns value or undefined." },
    { name: "intervalSearchAll", sig: "(t: IntervalTree, low: int, high: int) -> [{low,high,value}]", desc: "All intervals overlapping [low, high) (pre-order)." },
    { name: "intervalSize", sig: "(t: IntervalTree) -> int", desc: "Number of intervals." },
    { name: "intervalMin", sig: "(t: IntervalTree) -> int?", desc: "Minimum low endpoint (or undefined)." },
    { name: "intervalMax", sig: "(t: IntervalTree) -> int?", desc: "Maximum high endpoint (or undefined). O(1)." },
    { name: "intervalToSortedArray", sig: "(t: IntervalTree) -> [{low,high,value}]", desc: "All intervals in ascending low order (in-order)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("intervalNew", intervalNew);
  registerBuiltin("intervalInsert", intervalInsert);
  registerBuiltin("intervalDelete", intervalDelete);
  registerBuiltin("intervalSearchPoint", intervalSearchPoint);
  registerBuiltin("intervalSearchRange", intervalSearchRange);
  registerBuiltin("intervalSearchAll", intervalSearchAll);
  registerBuiltin("intervalSize", intervalSize);
  registerBuiltin("intervalMin", intervalMin);
  registerBuiltin("intervalMax", intervalMax);
  registerBuiltin("intervalToSortedArray", intervalToSortedArray);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertTree<V>(x: any, fn: string): asserts x is IntervalTree<V> {
  if (typeof x !== "object" || x === null ||
      (x.root !== null && typeof x.root !== "object") ||
      typeof x.size !== "number") {
    throw new Error(fn + ": expected IntervalTree, got " + kind(x));
  }
}

function assertNum(x: any, fn: string, name: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": " + name + " must be a finite number, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
