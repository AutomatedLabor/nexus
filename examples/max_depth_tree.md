# max_depth_tree.ae

Compute the maximum depth of a binary tree. The depth is the
number of nodes on the longest path from the root to a leaf.

## What it does

1. **`enum Tree { Node(int, Tree, Tree), Leaf }`** — a recursive
   sum type for a binary tree. `Leaf` is the empty tree; a
   `Node` carries an int value plus left and right subtrees.
2. **`max_depth(t)`** — pure-functional recursion:
   - A leaf has depth 0.
   - A node has depth `1 + max(max_depth(left), max_depth(right))`.
3. **`build(arr, i)`** — recursive helper that constructs a tree
   from a pre-order flat array of values (with `-1` as the "no
   node here" sentinel). Returns a tuple `(tree, next_index)` so
   the caller knows where the next subtree starts.
4. **`from_level_order(arr)`** — wrapper around `build` that
   discards the next-index and just returns the tree.
5. **Driver** — builds five trees (an asymmetric 4-node tree, a
   right-leaning 5-node tree, the empty tree, a single node, and
   a 5-node left chain) and prints their depths, then asserts
   seven sub-results including a 4-level balanced tree.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/max_depth_tree.ae
```

## Key language features

- **Recursive enum `Tree`** — Aether's v1 supports recursive sum
  types via `enum`, with `match` for pattern matching and the
  `Tree::Node(_, l, r)` syntax for destructuring.
- **`match` with arms returning int expressions** — each arm is
  an if/else expression that computes `1 + max(dl, dr)` without
  needing early returns.
- **Tuple returns from `build`** — `(Tree, int)` lets us thread
  the next-array-index through the recursion. The caller uses
  `.0` and `.1` to project.
- **`-1` sentinel for "no node"** — lets us serialize any
  binary tree as a flat pre-order array.

## Expected output

```
== Max depth of binary tree ==

Tree 1: depth = 3
Tree 2: depth = 4
Empty: depth = 0
Single: depth = 1
Left chain of 5: depth = 5

Headline: max_depth(t1) = 3

All assertions passed.
```

## Design notes

- The pre-order serialization with `-1` sentinels is the
  canonical way to serialize a binary tree compactly. Each
  node is followed by its left subtree, then its right subtree.
- The empty tree has depth 0 (no nodes at all). A single node
  has depth 1.
- The left chain of 5 nodes has depth 5 — the worst-case
  shape for an unbalanced tree.
- The balanced 15-node tree has depth 4 — the best case.
- Fully clean compile (`ok = true`).
