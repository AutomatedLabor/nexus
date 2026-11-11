/**
 * Aether stdlib — `tree` module.
 *
 * Tree operations on a simple `{ value, children: [...] }` shape (n-ary
 * tree, each node carries a single value and a list of child nodes).
 * The module exposes constructors, accessors, traversal (BFS / DFS), higher-
 * order transforms (map / filter / find / path), and shape queries (depth,
 * height, size, isLeaf).
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeNode<T> {
  value: T;
  children: TreeNode<T>[];
}

// ---------------------------------------------------------------------------
// Construction & accessors
// ---------------------------------------------------------------------------

/** Create a leaf node with value `v` and no children. */
export function treeNew<T>(v: T): TreeNode<T> {
  return { value: v, children: [] };
}

/** Return the value of the root node. */
export function treeValue<T>(t: TreeNode<T>): T {
  assertTree(t, "treeValue");
  return t.value;
}

/** Return the children array (by reference — mutating it mutates the tree). */
export function treeChildren<T>(t: TreeNode<T>): TreeNode<T>[] {
  assertTree(t, "treeChildren");
  return t.children;
}

/** Append a new child with value `v` to `t`.  Returns the new child. */
export function treeAddChild<T>(t: TreeNode<T>, v: T): TreeNode<T> {
  assertTree(t, "treeAddChild");
  const child = treeNew(v);
  t.children.push(child);
  return child;
}

/** True when `t` has no children. */
export function treeIsLeaf<T>(t: TreeNode<T>): boolean {
  assertTree(t, "treeIsLeaf");
  return t.children.length === 0;
}

// ---------------------------------------------------------------------------
// Shape queries
// ---------------------------------------------------------------------------

/** Number of nodes in the tree (root included). */
export function treeSize<T>(t: TreeNode<T>): number {
  assertTree(t, "treeSize");
  let n = 0;
  walk(t, () => { n++; });
  return n;
}

/** Depth = number of nodes from root to deepest leaf (root counts as 1). */
export function treeDepth<T>(t: TreeNode<T>): number {
  assertTree(t, "treeDepth");
  if (t.children.length === 0) return 1;
  let d = 0;
  for (const c of t.children) d = Math.max(d, treeDepth(c));
  return 1 + d;
}

/** Height = number of edges on the longest root-to-leaf path (root = 0). */
export function treeHeight<T>(t: TreeNode<T>): number {
  return treeDepth(t) - 1;
}

// ---------------------------------------------------------------------------
// Higher-order transforms
// ---------------------------------------------------------------------------

/** Build a new tree whose values are `fn(value)` for each node. */
export function treeMap<T, U>(t: TreeNode<T>, fn: (v: T) => U): TreeNode<U> {
  assertTree(t, "treeMap");
  if (typeof fn !== "function") throw new Error("treeMap: expected function");
  const out: TreeNode<U> = { value: fn(t.value), children: [] };
  for (const c of t.children) out.children.push(treeMap(c, fn));
  return out;
}

/** Build a new tree containing only the nodes whose values satisfy `fn`,
 *  along with their ancestors.  A node that fails `fn` but has a passing
 *  descendant is kept (its own value is preserved) so that the structure
 *  down to the matching descendant stays intact. */
export function treeFilter<T>(t: TreeNode<T>, fn: (v: T) => boolean): TreeNode<T> | null {
  assertTree(t, "treeFilter");
  if (typeof fn !== "function") throw new Error("treeFilter: expected function");
  const keptChildren: TreeNode<T>[] = [];
  for (const c of t.children) {
    const k = treeFilter(c, fn);
    if (k !== null) keptChildren.push(k);
  }
  if (keptChildren.length === 0 && !fn(t.value)) return null;
  return { value: t.value, children: keptChildren };
}

/** Return the first node whose value satisfies `fn`, or null.  Pre-order. */
export function treeFind<T>(t: TreeNode<T>, fn: (v: T) => boolean): TreeNode<T> | null {
  assertTree(t, "treeFind");
  if (typeof fn !== "function") throw new Error("treeFind: expected function");
  if (fn(t.value)) return t;
  for (const c of t.children) {
    const r = treeFind(c, fn);
    if (r !== null) return r;
  }
  return null;
}

/** Return the path (array of values) from root down to the first node
 *  whose value satisfies `fn`, or null if none match. */
export function treePath<T>(t: TreeNode<T>, fn: (v: T) => boolean): T[] | null {
  assertTree(t, "treePath");
  if (typeof fn !== "function") throw new Error("treePath: expected function");
  function go(node: TreeNode<T>): T[] | null {
    if (fn(node.value)) return [node.value];
    for (const c of node.children) {
      const p = go(c);
      if (p !== null) return [node.value, ...p];
    }
    return null;
  }
  return go(t);
}

/** Flatten to a list of values in pre-order (root, then each subtree). */
export function treeFlatten<T>(t: TreeNode<T>): T[] {
  assertTree(t, "treeFlatten");
  const out: T[] = [];
  walk(t, (n) => out.push(n.value));
  return out;
}

/** Pre-order walk: call `fn(value)` on every node. */
export function treeWalk<T>(t: TreeNode<T>, fn: (v: T) => void): void {
  assertTree(t, "treeWalk");
  if (typeof fn !== "function") throw new Error("treeWalk: expected function");
  walk(t, (n) => fn(n.value));
}

/** Breadth-first walk: call `fn(value)`, level by level. */
export function treeBfs<T>(t: TreeNode<T>, fn: (v: T) => void): void {
  assertTree(t, "treeBfs");
  if (typeof fn !== "function") throw new Error("treeBfs: expected function");
  const q: TreeNode<T>[] = [t];
  while (q.length > 0) {
    const n = q.shift() as TreeNode<T>;
    fn(n.value);
    for (const c of n.children) q.push(c);
  }
}

/** Depth-first walk (pre-order): alias for `treeWalk`. */
export function treeDfs<T>(t: TreeNode<T>, fn: (v: T) => void): void {
  treeWalk(t, fn);
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** Pretty-print the tree with branches like:
 *
 *    root
 *    ├─ a
 *    │  └─ a1
 *    └─ b
 */
export function treePrint<T>(t: TreeNode<T>): string {
  assertTree(t, "treePrint");
  const lines: string[] = [];
  function go(node: TreeNode<T>, prefix: string, isLast: boolean, isRoot: boolean) {
    const branch = isRoot ? "" : (isLast ? "└─ " : "├─ ");
    lines.push(prefix + branch + String(node.value));
    const childPrefix = isRoot ? "" : prefix + (isLast ? "   " : "│  ");
    for (let i = 0; i < node.children.length; i++) {
      go(node.children[i], childPrefix, i === node.children.length - 1, false);
    }
  }
  go(t, "", true, true);
  return lines.join("\n");
}

/** Render as a single-line `value(children, ...)` S-expression-like string. */
export function treeToString<T>(t: TreeNode<T>): string {
  assertTree(t, "treeToString");
  function go(n: TreeNode<T>): string {
    if (n.children.length === 0) return toDisplay(n.value);
    return toDisplay(n.value) + "(" + n.children.map(go).join(", ") + ")";
  }
  return go(t);
}

// ---------------------------------------------------------------------------
// Construction from edges
// ---------------------------------------------------------------------------

/** Build a tree from a list of [parent, child] edges.  The first edge's
 *  parent becomes the root (or the parent that no edge lists as a child).
 *  Returns the root node, or null if `edges` is empty.  Edge values are
 *  compared by strict equality. */
export function treeFromEdges<T>(edges: Array<[T, T]>): TreeNode<T> | null {
  if (!Array.isArray(edges)) throw new Error("treeFromEdges: expected array of [parent, child] pairs");
  if (edges.length === 0) return null;
  // Build node map (value -> node) for every distinct value seen.
  const nodes = new Map<T, TreeNode<T>>();
  const childSet = new Set<T>();
  function node(v: T): TreeNode<T> {
    let n = nodes.get(v);
    if (!n) { n = treeNew(v); nodes.set(v, n); }
    return n;
  }
  for (const [p, c] of edges) {
    if (!Array.isArray(p) === false || !Array.isArray(c) === false) {
      throw new Error("treeFromEdges: edge must be a 2-tuple [parent, child]");
    }
    node(p).children.push(node(c));
    childSet.add(c);
  }
  // Root is the parent value that never appears as a child.
  for (const [v] of nodes) {
    if (!childSet.has(v)) return nodes.get(v) as TreeNode<T>;
  }
  // Cycle (no root) — pick the first node as root.
  return nodes.values().next().value ?? null;
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Structural equality: same shape, same values (by deep equality of values). */
export function treeEquals<T>(a: TreeNode<T>, b: TreeNode<T>): boolean {
  assertTree(a, "treeEquals");
  assertTree(b, "treeEquals");
  if (!deepEq(a.value, b.value)) return false;
  if (a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) {
    if (!treeEquals(a.children[i], b.children[i])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "tree",
  fns: [
    { name: "treeNew", sig: "(v: any) -> TreeNode", desc: "Create a leaf node with value v and no children." },
    { name: "treeValue", sig: "(t: TreeNode) -> any", desc: "Return the value of the root node." },
    { name: "treeChildren", sig: "(t: TreeNode) -> TreeNode[]", desc: "Return the children array (by reference)." },
    { name: "treeAddChild", sig: "(t: TreeNode, v: any) -> TreeNode", desc: "Append a new child with value v; returns the new child." },
    { name: "treeIsLeaf", sig: "(t: TreeNode) -> bool", desc: "True when t has no children." },
    { name: "treeSize", sig: "(t: TreeNode) -> int", desc: "Number of nodes in the tree (root included)." },
    { name: "treeDepth", sig: "(t: TreeNode) -> int", desc: "Depth = nodes on the longest root-to-leaf path (root = 1)." },
    { name: "treeHeight", sig: "(t: TreeNode) -> int", desc: "Height = edges on the longest root-to-leaf path (root = 0)." },
    { name: "treeMap", sig: "(t, fn) -> TreeNode", desc: "Build a new tree whose values are fn(value)." },
    { name: "treeFilter", sig: "(t, fn) -> TreeNode?", desc: "Keep only nodes whose values (or descendants) satisfy fn." },
    { name: "treeFind", sig: "(t, fn) -> TreeNode?", desc: "First node whose value satisfies fn (pre-order)." },
    { name: "treePath", sig: "(t, fn) -> any[]?", desc: "Path (values) from root to first node satisfying fn." },
    { name: "treeFlatten", sig: "(t) -> any[]", desc: "Pre-order flatten to a list of values." },
    { name: "treeWalk", sig: "(t, fn) -> void", desc: "Pre-order walk: call fn(value) on every node." },
    { name: "treeBfs", sig: "(t, fn) -> void", desc: "Breadth-first walk: call fn(value), level by level." },
    { name: "treeDfs", sig: "(t, fn) -> void", desc: "Depth-first walk (pre-order)." },
    { name: "treePrint", sig: "(t) -> string", desc: "Pretty-print the tree as a string with ├─/└─ branches." },
    { name: "treeToString", sig: "(t) -> string", desc: "Render as value(child, child, ...) S-expression-like string." },
    { name: "treeFromEdges", sig: "(edges: [[any, any]]) -> TreeNode?", desc: "Build a tree from [parent, child] edges." },
    { name: "treeEquals", sig: "(a, b: TreeNode) -> bool", desc: "Structural equality (same shape and deep-equal values)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("treeNew", treeNew);
  registerBuiltin("treeValue", treeValue);
  registerBuiltin("treeChildren", treeChildren);
  registerBuiltin("treeAddChild", treeAddChild);
  registerBuiltin("treeIsLeaf", treeIsLeaf);
  registerBuiltin("treeSize", treeSize);
  registerBuiltin("treeDepth", treeDepth);
  registerBuiltin("treeHeight", treeHeight);
  registerBuiltin("treeMap", treeMap);
  registerBuiltin("treeFilter", treeFilter);
  registerBuiltin("treeFind", treeFind);
  registerBuiltin("treePath", treePath);
  registerBuiltin("treeFlatten", treeFlatten);
  registerBuiltin("treeWalk", treeWalk);
  registerBuiltin("treeBfs", treeBfs);
  registerBuiltin("treeDfs", treeDfs);
  registerBuiltin("treePrint", treePrint);
  registerBuiltin("treeToString", treeToString);
  registerBuiltin("treeFromEdges", treeFromEdges);
  registerBuiltin("treeEquals", treeEquals);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertTree(x: any, fn: string): asserts x is TreeNode<any> {
  if (typeof x !== "object" || x === null || !("value" in x) || !("children" in x)) {
    throw new Error(fn + ": expected tree node, got " + (x === null ? "null" : x === undefined ? "undefined" : typeof x));
  }
  if (!Array.isArray(x.children)) {
    throw new Error(fn + ": tree node's children must be an array");
  }
}

function walk<T>(t: TreeNode<T>, fn: (n: TreeNode<T>) => void): void {
  fn(t);
  for (const c of t.children) walk(c, fn);
}

function toDisplay(x: any): string {
  if (typeof x === "string") return x;
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (typeof x === "object") {
    try { return JSON.stringify(x); } catch { return String(x); }
  }
  return String(x);
}

function deepEq(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEq(a[k], b[k])) return false;
  }
  return true;
}
