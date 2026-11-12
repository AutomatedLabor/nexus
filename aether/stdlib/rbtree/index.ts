/**
 * Aether stdlib — `rbtree` module.
 *
 * A red-black tree: a self-balancing binary search tree.  Guarantees
 * O(log n) time for insert, delete, and search.  Unlike a plain
 * BST, the tree is kept approximately balanced via rotations and
 * colour flips so the worst-case height stays at 2 log(n+1).
 *
 * The classic properties:
 *   1. Every node is either RED or BLACK.
 *   2. The root is BLACK.
 *   3. Every leaf (NIL) is BLACK.
 *   4. If a node is RED, both its children are BLACK (no two reds
 *      in a row on any root-to-leaf path).
 *   5. For each node, all simple paths from the node to descendant
 *      leaves contain the same number of BLACK nodes (the
 *      "black-height").
 *
 * Together these guarantee O(log n) height.
 *
 * Functions:
 *   - rbNew, rbInsert, rbDelete, rbSearch   — basics
 *   - rbMin, rbMax                          — extremes
 *   - rbSuccessor, rbPredecessor           — ordered traversal
 *   - rbInOrder                            — snapshot
 *   - rbSize                               — introspection
 *
 * The tree stores arbitrary (key, value) pairs.  The default
 * comparator is `<`/`>` on the keys themselves; pass a custom
 * comparator to `rbNew` for non-numeric keys or for descending
 * order.  The comparator returns a number: negative if a < b,
 * zero if equal, positive if a > b.
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Node colours. */
const RED = 0;
const BLACK = 1;

interface RBNode<K = any, V = any> {
  key: K;
  value: V;
  color: number;       // RED or BLACK
  left: RBNode<K, V> | null;
  right: RBNode<K, V> | null;
  parent: RBNode<K, V> | null;
}

export interface RBTree<K = any, V = any> {
  /** Root node (null when empty). */
  root: RBNode<K, V> | null;
  /** Comparator: < 0 if a < b, 0 if equal, > 0 if a > b. */
  cmp: (a: K, b: K) => number;
  /** Number of nodes currently in the tree. */
  size: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function defaultCmp<K>(a: K, b: K): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Create a fresh, empty red-black tree.  The optional comparator
 *  returns negative if `a < b`, zero if equal, positive if `a > b`.
 *  The default uses `<`/`>` directly, which works for numbers and
 *  strings. */
export function rbNew<K = any, V = any>(cmp?: (a: K, b: K) => number): RBTree<K, V> {
  return {
    root: null,
    cmp: (cmp ?? defaultCmp) as (a: K, b: K) => number,
    size: 0,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeNode<K, V>(key: K, value: V): RBNode<K, V> {
  return { key, value, color: RED, left: null, right: null, parent: null };
}

function nodeColor<K, V>(n: RBNode<K, V> | null): number {
  // null leaves are treated as BLACK (rule 3).
  return n === null ? BLACK : n.color;
}

/** Rotate left around `x`: x's right child y becomes x's parent;
 *  x becomes y's left child; y's old left subtree becomes x's
 *  right subtree.  The tree's root pointer is updated if needed. */
function rotateLeft<K, V>(t: RBTree<K, V>, x: RBNode<K, V>): void {
  const y = x.right!;
  x.right = y.left;
  if (y.left !== null) y.left.parent = x;
  y.parent = x.parent;
  if (x.parent === null) {
    t.root = y;
  } else if (x === x.parent.left) {
    x.parent.left = y;
  } else {
    x.parent.right = y;
  }
  y.left = x;
  x.parent = y;
}

/** Rotate right around `x`: the mirror of rotateLeft. */
function rotateRight<K, V>(t: RBTree<K, V>, x: RBNode<K, V>): void {
  const y = x.left!;
  x.left = y.right;
  if (y.right !== null) y.right.parent = x;
  y.parent = x.parent;
  if (x.parent === null) {
    t.root = y;
  } else if (x === x.parent.right) {
    x.parent.right = y;
  } else {
    x.parent.left = y;
  }
  y.right = x;
  x.parent = y;
}

/** Find the minimum node in a subtree rooted at `n` (n != null). */
function minNode<K, V>(n: RBNode<K, V>): RBNode<K, V> {
  while (n.left !== null) n = n.left;
  return n;
}

/** Find the maximum node in a subtree rooted at `n` (n != null). */
function maxNode<K, V>(n: RBNode<K, V>): RBNode<K, V> {
  while (n.right !== null) n = n.right;
  return n;
}

/** Find the node with the given key, or null if not present. */
function findNode<K, V>(t: RBTree<K, V>, key: K): RBNode<K, V> | null {
  let n = t.root;
  while (n !== null) {
    const c = t.cmp(key, n.key);
    if (c < 0) n = n.left;
    else if (c > 0) n = n.right;
    else return n;
  }
  return null;
}

/** The successor of `n` in sorted order: the next-larger node. */
function successor<K, V>(n: RBNode<K, V>): RBNode<K, V> | null {
  if (n.right !== null) return minNode(n.right);
  let x = n;
  let p = n.parent;
  while (p !== null && x === p.right) {
    x = p;
    p = p.parent;
  }
  return p;
}

/** The predecessor of `n` in sorted order: the next-smaller node. */
function predecessor<K, V>(n: RBNode<K, V>): RBNode<K, V> | null {
  if (n.left !== null) return maxNode(n.left);
  let x = n;
  let p = n.parent;
  while (p !== null && x === p.left) {
    x = p;
    p = p.parent;
  }
  return p;
}

/** Fix up the tree after inserting `z` (a freshly-added RED node). */
function insertFixup<K, V>(t: RBTree<K, V>, z: RBNode<K, V>): void {
  while (z.parent !== null && z.parent.color === RED) {
    const gp = z.parent.parent;
    if (gp === null) break;
    if (z.parent === gp.left) {
      const uncle = gp.right;
      if (uncle !== null && uncle.color === RED) {
        // Case 1: red uncle — recolour and move up.
        z.parent.color = BLACK;
        uncle.color = BLACK;
        gp.color = RED;
        z = gp;
      } else {
        if (z === z.parent.right) {
          // Case 2: triangle — rotate to make it a line.
          z = z.parent;
          rotateLeft(t, z);
        }
        // Case 3: line — recolour and rotate.
        z.parent!.color = BLACK;
        z.parent!.parent!.color = RED;
        rotateRight(t, z.parent!.parent!);
      }
    } else {
      // Mirror of the above.
      const uncle = gp.left;
      if (uncle !== null && uncle.color === RED) {
        z.parent.color = BLACK;
        uncle.color = BLACK;
        gp.color = RED;
        z = gp;
      } else {
        if (z === z.parent.left) {
          z = z.parent;
          rotateRight(t, z);
        }
        z.parent!.color = BLACK;
        z.parent!.parent!.color = RED;
        rotateLeft(t, z.parent!.parent!);
      }
    }
  }
  t.root!.color = BLACK;
}

/** Replace subtree rooted at `u` with subtree rooted at `v`. */
function transplant<K, V>(t: RBTree<K, V>, u: RBNode<K, V>, v: RBNode<K, V> | null): void {
  if (u.parent === null) {
    t.root = v;
  } else if (u === u.parent.left) {
    u.parent.left = v;
  } else {
    u.parent.right = v;
  }
  if (v !== null) v.parent = u.parent;
}

/** Fix up the tree after deleting a node, restoring the
 *  red-black invariants.  `x` is the node that took the place
 *  of the deleted (or moved) node; `xParent` is its parent (since
 *  x might be null). */
function deleteFixup<K, V>(t: RBTree<K, V>, x: RBNode<K, V> | null, xParent: RBNode<K, V> | null): void {
  while (x !== t.root && nodeColor(x) === BLACK) {
    if (xParent === null) break;
    if (x === xParent.left) {
      let w = xParent.right;
      if (w !== null && w.color === RED) {
        w.color = BLACK;
        xParent.color = RED;
        rotateLeft(t, xParent);
        w = xParent.right;
      }
      if (w === null) break;
      const wlc = w.left;
      const wrc = w.right;
      if (nodeColor(wlc) === BLACK && nodeColor(wrc) === BLACK) {
        w.color = RED;
        x = xParent;
        xParent = x.parent;
      } else {
        if (nodeColor(wrc) === BLACK) {
          if (wlc !== null) wlc.color = BLACK;
          w.color = RED;
          rotateRight(t, w);
          w = xParent.right;
        }
        if (w === null) break;
        w.color = xParent.color;
        xParent.color = BLACK;
        if (w.right !== null) w.right.color = BLACK;
        rotateLeft(t, xParent);
        x = t.root;
        xParent = null;
      }
    } else {
      let w = xParent.left;
      if (w !== null && w.color === RED) {
        w.color = BLACK;
        xParent.color = RED;
        rotateRight(t, xParent);
        w = xParent.left;
      }
      if (w === null) break;
      const wlc = w.left;
      const wrc = w.right;
      if (nodeColor(wrc) === BLACK && nodeColor(wlc) === BLACK) {
        w.color = RED;
        x = xParent;
        xParent = x.parent;
      } else {
        if (nodeColor(wlc) === BLACK) {
          if (wrc !== null) wrc.color = BLACK;
          w.color = RED;
          rotateLeft(t, w);
          w = xParent.left;
        }
        if (w === null) break;
        w.color = xParent.color;
        xParent.color = BLACK;
        if (w.left !== null) w.left.color = BLACK;
        rotateRight(t, xParent);
        x = t.root;
        xParent = null;
      }
    }
  }
  if (x !== null) x.color = BLACK;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Insert a (key, value) pair.  If `key` already exists, the
 *  value is updated (and `false` is returned to indicate
 *  "updated, not inserted").  If `key` is new, a new node is
 *  inserted and `true` is returned.  The tree is re-balanced
 *  as needed. */
export function rbInsert<K, V>(t: RBTree<K, V>, key: K, value: V): boolean {
  assertTree(t, "rbInsert");
  let parent: RBNode<K, V> | null = null;
  let cur = t.root;
  while (cur !== null) {
    parent = cur;
    const c = t.cmp(key, cur.key);
    if (c < 0) cur = cur.left;
    else if (c > 0) cur = cur.right;
    else {
      // Key already present — update the value, no new node.
      cur.value = value;
      return false;
    }
  }
  const z = makeNode(key, value);
  z.parent = parent;
  if (parent === null) {
    t.root = z;
  } else if (t.cmp(key, parent.key) < 0) {
    parent.left = z;
  } else {
    parent.right = z;
  }
  t.size++;
  insertFixup(t, z);
  return true;
}

/** Delete the node with the given key.  Returns true if a node
 *  was removed, false if the key was not present. */
export function rbDelete<K, V>(t: RBTree<K, V>, key: K): boolean {
  assertTree(t, "rbDelete");
  const z = findNode(t, key);
  if (z === null) return false;
  // Standard CLRS delete with the y / x tracking.
  let y: RBNode<K, V> = z;
  let yOriginalColor = y.color;
  let x: RBNode<K, V> | null;
  let xParent: RBNode<K, V> | null;
  if (z.left === null) {
    x = z.right;
    xParent = z.parent;
    transplant(t, z, z.right);
  } else if (z.right === null) {
    x = z.left;
    xParent = z.parent;
    transplant(t, z, z.left);
  } else {
    y = minNode(z.right);
    yOriginalColor = y.color;
    x = y.right;
    xParent = y.parent === z ? y : y.parent;
    if (y.parent === z) {
      // x's parent (if x exists) is y, which will take z's place.
      if (x !== null) x.parent = y;
    } else {
      transplant(t, y, y.right);
      y.right = z.right;
      y.right.parent = y;
    }
    transplant(t, z, y);
    y.left = z.left;
    y.left.parent = y;
    y.color = z.color;
  }
  if (yOriginalColor === BLACK) {
    deleteFixup(t, x, xParent);
  }
  t.size--;
  return true;
}

/** Look up the value for a given key.  Returns `undefined` if
 *  the key is not present. */
export function rbSearch<K, V>(t: RBTree<K, V>, key: K): V | undefined {
  assertTree(t, "rbSearch");
  const n = findNode(t, key);
  return n === null ? undefined : n.value;
}

/** The minimum key in the tree.  Returns `undefined` if the
 *  tree is empty. */
export function rbMin<K, V>(t: RBTree<K, V>): K | undefined {
  assertTree(t, "rbMin");
  if (t.root === null) return undefined;
  return minNode(t.root).key;
}

/** The maximum key in the tree.  Returns `undefined` if the
 *  tree is empty. */
export function rbMax<K, V>(t: RBTree<K, V>): K | undefined {
  assertTree(t, "rbMax");
  if (t.root === null) return undefined;
  return maxNode(t.root).key;
}

/** The smallest key strictly greater than `key`.  Returns
 *  `undefined` if `key` is not in the tree or has no successor. */
export function rbSuccessor<K, V>(t: RBTree<K, V>, key: K): K | undefined {
  assertTree(t, "rbSuccessor");
  const n = findNode(t, key);
  if (n === null) return undefined;
  const s = successor(n);
  return s === null ? undefined : s.key;
}

/** The largest key strictly less than `key`.  Returns `undefined`
 *  if `key` is not in the tree or has no predecessor. */
export function rbPredecessor<K, V>(t: RBTree<K, V>, key: K): K | undefined {
  assertTree(t, "rbPredecessor");
  const n = findNode(t, key);
  if (n === null) return undefined;
  const p = predecessor(n);
  return p === null ? undefined : p.key;
}

/** Return a fresh array of `[key, value]` pairs in sorted order
 *  (in-order traversal).  Does not mutate the tree. */
export function rbInOrder<K, V>(t: RBTree<K, V>): Array<[K, V]> {
  assertTree(t, "rbInOrder");
  const out: Array<[K, V]> = [];
  // Iterative in-order traversal with an explicit stack.
  const stack: Array<RBNode<K, V>> = [];
  let cur: RBNode<K, V> | null = t.root;
  while (cur !== null || stack.length > 0) {
    while (cur !== null) {
      stack.push(cur);
      cur = cur.left;
    }
    const top = stack.pop()!;
    out.push([top.key, top.value]);
    cur = top.right;
  }
  return out;
}

/** Number of elements currently in the tree. */
export function rbSize<K, V>(t: RBTree<K, V>): number {
  assertTree(t, "rbSize");
  return t.size;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "rbtree",
  fns: [
    { name: "rbNew", sig: "(cmp?: (a, b) -> int) -> RBTree", desc: "Create a fresh empty red-black tree." },
    { name: "rbInsert", sig: "(t: RBTree, key: any, value: any) -> bool", desc: "Insert (key, value); returns true if new, false if updated existing." },
    { name: "rbDelete", sig: "(t: RBTree, key: any) -> bool", desc: "Delete by key; returns true if removed, false if not present." },
    { name: "rbSearch", sig: "(t: RBTree, key: any) -> any?", desc: "Look up value by key; undefined if not present." },
    { name: "rbMin", sig: "(t: RBTree) -> any?", desc: "Smallest key, or undefined if empty." },
    { name: "rbMax", sig: "(t: RBTree) -> any?", desc: "Largest key, or undefined if empty." },
    { name: "rbSuccessor", sig: "(t: RBTree, key: any) -> any?", desc: "Next-larger key in the tree, or undefined." },
    { name: "rbPredecessor", sig: "(t: RBTree, key: any) -> any?", desc: "Next-smaller key in the tree, or undefined." },
    { name: "rbInOrder", sig: "(t: RBTree) -> [[any, any]]", desc: "Fresh array of [key, value] pairs in sorted order." },
    { name: "rbSize", sig: "(t: RBTree) -> int", desc: "Number of elements in the tree." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("rbNew", rbNew);
  registerBuiltin("rbInsert", rbInsert);
  registerBuiltin("rbDelete", rbDelete);
  registerBuiltin("rbSearch", rbSearch);
  registerBuiltin("rbMin", rbMin);
  registerBuiltin("rbMax", rbMax);
  registerBuiltin("rbSuccessor", rbSuccessor);
  registerBuiltin("rbPredecessor", rbPredecessor);
  registerBuiltin("rbInOrder", rbInOrder);
  registerBuiltin("rbSize", rbSize);
}

// ---------------------------------------------------------------------------
// Validators & helpers
// ---------------------------------------------------------------------------

function assertTree<K, V>(x: any, fn: string): asserts x is RBTree<K, V> {
  if (typeof x !== "object" || x === null ||
      typeof x.cmp !== "function" ||
      typeof x.size !== "number" ||
      (x.root !== null && typeof x.root !== "object")) {
    throw new Error(fn + ": expected RBTree, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
