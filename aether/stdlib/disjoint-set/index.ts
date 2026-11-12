/**
 * Aether stdlib — `disjoint-set` module.
 *
 * A disjoint-set forest (a.k.a. union-find): a partition of a set
 * of elements into disjoint groups.  Supports two operations in
 * near-constant amortised time:
 *
 *   - `dsFind(x)` — return the representative (root) of the group
 *     containing `x`.  Two elements are in the same group iff
 *     their `dsFind` results are equal.
 *   - `dsUnion(x, y)` — merge the groups containing `x` and `y`
 *     into a single group (no-op if they're already together).
 *
 * The "near-constant" complexity comes from two complementary
 * optimisations:
 *
 *   1. **Path compression**: every `dsFind` flattens the path from
 *      `x` to the root, so subsequent finds are O(1).
 *   2. **Union by rank**: `dsUnion` always attaches the shorter
 *      tree under the taller one, so the worst-case tree height is
 *      O(α(n)) — the inverse Ackermann function, which is < 5 for
 *      any practical n.
 *
 * Together these give amortised O(α(n)) per operation — effectively
 * constant for any input size you'll encounter.
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DSNode {
  /** Element key (so we can recover the key from a node). */
  key: any;
  /** Parent *node* (root nodes point to themselves). */
  parent: DSNode;
  /** Rank upper bound on the subtree height. */
  rank: number;
  /** Size of the subtree rooted here (only valid at the root). */
  size: number;
}

export interface DisjointSet {
  /** Element -> node lookup. */
  nodes: Map<any, DSNode>;
  /** Number of distinct elements ever added (size of the universe). */
  count: number;
  /** Number of disjoint groups (components). */
  components: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh, empty disjoint-set. */
export function dsNew(): DisjointSet {
  return { nodes: new Map(), count: 0, components: 0 };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureNode(ds: DisjointSet, x: any): DSNode {
  let n = ds.nodes.get(x);
  if (n === undefined) {
    n = { key: x, parent: null as any, rank: 0, size: 1 };
    n.parent = n;   // self-loop: this node is a root
    ds.nodes.set(x, n);
    ds.count++;
    ds.components++;
  }
  return n;
}

/** Iterative find with path compression.  Returns the root node's
 *  *key*.  Unknown elements are treated as implicit singletons:
 *  the function returns `x` itself (without registering it). */
function findRoot(ds: DisjointSet, x: any): any {
  const start = ds.nodes.get(x);
  if (start === undefined) return x;
  // Walk to the root, collecting the path.
  const path: DSNode[] = [];
  let cur: DSNode = start;
  while (cur.parent !== cur) {
    path.push(cur);
    cur = cur.parent;
  }
  // `cur` is the root. Compress the path: every node on the path
  // points to the root directly.
  for (const p of path) p.parent = cur;
  return cur.key;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Add `x` to the universe as a new singleton set.  Returns true if
 *  `x` was newly added, false if `x` was already present (no-op).
 *  This is the only way to add an element to the disjoint-set;
 *  `dsFind` and `dsUnion` are read-only with respect to the universe
 *  (dsFind on an unknown element returns the element itself, but
 *  does not register it). */
export function dsMake(ds: DisjointSet, x: any): boolean {
  assertDs(ds, "dsMake");
  if (ds.nodes.has(x)) return false;
  ensureNode(ds, x);
  return true;
}

/** Find the representative of the group containing `x`.
 *  Two elements `a` and `b` are in the same group iff
 *  `dsFind(ds, a) === dsFind(ds, b)`.  If `x` is not in the set,
 *  returns `x` itself (implicit singleton).  Uses path compression
 *  so subsequent finds are O(1). */
export function dsFind(ds: DisjointSet, x: any): any {
  assertDs(ds, "dsFind");
  return findRoot(ds, x);
}

/** Merge the groups containing `x` and `y`.  Returns true if a
 *  merge actually happened (the two were in different groups
 *  before), false if they were already in the same group.  Uses
 *  union by rank so tree heights stay O(α(n)).  If `x` or `y` is
 *  not in the universe, they're added as singletons first
 *  (equivalent to calling `dsMake` on them). */
export function dsUnion(ds: DisjointSet, x: any, y: any): boolean {
  assertDs(ds, "dsUnion");
  // Auto-register unknown elements as singletons (transparent to caller).
  const nx = ensureNode(ds, x);
  const ny = ensureNode(ds, y);
  // Find root nodes (with path compression).
  const pathX: DSNode[] = [];
  let rx: DSNode = nx;
  while (rx.parent !== rx) { pathX.push(rx); rx = rx.parent; }
  for (const p of pathX) p.parent = rx;
  const pathY: DSNode[] = [];
  let ry: DSNode = ny;
  while (ry.parent !== ry) { pathY.push(ry); ry = ry.parent; }
  for (const p of pathY) p.parent = ry;
  if (rx === ry) return false;
  // Union by rank: attach the shorter tree under the taller one.
  if (rx.rank < ry.rank) {
    rx.parent = ry;
    ry.size += rx.size;
  } else if (rx.rank > ry.rank) {
    ry.parent = rx;
    rx.size += ry.size;
  } else {
    // Equal rank: attach Y under X, bump X's rank.
    ry.parent = rx;
    rx.size += ry.size;
    rx.rank++;
  }
  ds.components--;
  return true;
}

/** True if `x` and `y` are in the same group.  Implicit singletons
 *  (unknown elements) are considered to be in their own group, so
 *  `dsConnected(ds, x, x)` is always true and
 *  `dsConnected(ds, x, y)` for two unknown distinct elements is
 *  false. */
export function dsConnected(ds: DisjointSet, x: any, y: any): boolean {
  assertDs(ds, "dsConnected");
  return findRoot(ds, x) === findRoot(ds, y);
}

/** Number of distinct elements ever added to the universe. */
export function dsCount(ds: DisjointSet): number {
  assertDs(ds, "dsCount");
  return ds.count;
}

/** Number of disjoint groups (components) currently in the set. */
export function dsComponents(ds: DisjointSet): number {
  assertDs(ds, "dsComponents");
  return ds.components;
}

/** Size of the group containing `x`.  If `x` is unknown, returns
 *  1 (the implicit singleton). */
export function dsSize(ds: DisjointSet, x: any): number {
  assertDs(ds, "dsSize");
  const root = findRoot(ds, x);
  const n = ds.nodes.get(root);
  return n ? n.size : 1;
}

/** Reset the disjoint-set to empty. */
export function dsReset(ds: DisjointSet): void {
  assertDs(ds, "dsReset");
  ds.nodes.clear();
  ds.count = 0;
  ds.components = 0;
}

/** Human-readable string.  Each group is rendered as `{a, b, c}`
 *  (sorted, JSON-stringified elements); multiple groups are
 *  separated by `, `.  An empty disjoint-set renders as `{}`. */
export function dsToString(ds: DisjointSet): string {
  assertDs(ds, "dsToString");
  const groups = new Map<any, any[]>();
  for (const key of ds.nodes.keys()) {
    const root = findRoot(ds, key);
    let arr = groups.get(root);
    if (arr === undefined) {
      arr = [];
      groups.set(root, arr);
    }
    arr.push(key);
  }
  if (groups.size === 0) return "{}";
  const lines: string[] = [];
  for (const [, arr] of groups) {
    arr.sort((a, b) => {
      const sa = String(a);
      const sb = String(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
    lines.push("{" + arr.map((x) => JSON.stringify(x)).join(", ") + "}");
  }
  // Sort the groups themselves by their first element's string form for
  // deterministic output across JS engine iteration orders.
  lines.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return lines.join(", ");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "disjoint-set",
  fns: [
    { name: "dsNew", sig: "() -> DisjointSet", desc: "Create a new empty disjoint-set." },
    { name: "dsMake", sig: "(ds: DisjointSet, x: any) -> bool", desc: "Add x as a new singleton; returns true if new, false if already present." },
    { name: "dsFind", sig: "(ds: DisjointSet, x: any) -> any", desc: "Representative of x's group (path compression). Unknown x returns x." },
    { name: "dsUnion", sig: "(ds: DisjointSet, x: any, y: any) -> bool", desc: "Merge x's and y's groups (union by rank); returns true if merged, false if already same." },
    { name: "dsConnected", sig: "(ds: DisjointSet, x: any, y: any) -> bool", desc: "True if x and y are in the same group." },
    { name: "dsCount", sig: "(ds: DisjointSet) -> int", desc: "Number of distinct elements in the universe." },
    { name: "dsComponents", sig: "(ds: DisjointSet) -> int", desc: "Number of disjoint groups (components)." },
    { name: "dsSize", sig: "(ds: DisjointSet, x: any) -> int", desc: "Size of the group containing x." },
    { name: "dsReset", sig: "(ds: DisjointSet) -> void", desc: "Reset to empty." },
    { name: "dsToString", sig: "(ds: DisjointSet) -> string", desc: "Human-readable string: groups as {a, b, c}." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("dsNew", dsNew);
  registerBuiltin("dsMake", dsMake);
  registerBuiltin("dsFind", dsFind);
  registerBuiltin("dsUnion", dsUnion);
  registerBuiltin("dsConnected", dsConnected);
  registerBuiltin("dsCount", dsCount);
  registerBuiltin("dsComponents", dsComponents);
  registerBuiltin("dsSize", dsSize);
  registerBuiltin("dsReset", dsReset);
  registerBuiltin("dsToString", dsToString);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertDs(x: any, fn: string): asserts x is DisjointSet {
  if (typeof x !== "object" || x === null ||
      !(x.nodes instanceof Map) ||
      typeof x.count !== "number" ||
      typeof x.components !== "number") {
    throw new Error(fn + ": expected DisjointSet, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
