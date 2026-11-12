# diameter_tree.ae

Compute the diameter of a binary tree: the length (in edges)
of the longest path between any two nodes. The path may or may
not pass through the root.

## What it does

1. **`enum Tree { Node(int, Tree, Tree), Leaf }`** — recursive
   sum type for a binary tree (same as in `max_depth_tree.ae`).
2. **`helper(t)`** — recursive helper returning a tuple
   `(depth, best_diameter_so_far)`:
   - A leaf has depth 0 and contributes nothing to the diameter.
   - A node's depth is `1 + max(depth(left), depth(right))` (in
     edges from this node to the deepest leaf below).
   - The longest path *through* this node is `depth(left) + depth(right)`
     (down to the deepest left leaf, back up through this node,
     down to the deepest right leaf).
   - The best diameter so far is `max(through, best_left, best_right)`.
3. **`diameter(t)`** — kicks off the recursion and returns the
   second component of the tuple.
4. **`build(arr, i)`** + **`from_pre(arr)`** — pre-order tree
   construction from a flat array with `-1` sentinels for empty
   subtrees.
5. **Driver** — builds five trees and prints their diameters,
   then asserts eight sub-results including the classic
   "diameter doesn't pass through the root" case.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/diameter_tree.ae
```

## Key language features

- **Recursive enum + tuple returns** — the helper threads both
  the depth and the best-diameter accumulator through the
  recursion via a `(int, int)` tuple, avoiding the need for a
  mutable global accumulator.
- **`if dl > dr { dl } else { dr }`** — Aether's inline-if
  expression for `max(dl, dr)` (avoids the builtin, lets the
  JIT inline the comparison).
- **`match` with arm expressions returning tuples** — each arm
  is a single tuple-valued expression; no statements needed.
- **`-1` sentinel for empty subtrees** — same pre-order
  serialization as `max_depth_tree.ae`.

## Expected output

```
== Diameter of binary tree ==

Tree 1: diameter = 4
Single: diameter = 0
Empty: diameter = 0
Left chain of 4: diameter = 3
Balanced 7-node: diameter = 4

Headline: diameter(t1) = 4

All assertions passed.
```

## Design notes

- The "two-return" helper (depth + accumulator) is the standard
  O(n) algorithm — visits each node once.
- The diameter is in *edges*, not nodes. A single node has
  diameter 0 (no edges); a 4-node linear chain has diameter 3.
- The "diameter doesn't pass through the root" case is the
  tricky one — the longest path goes from a deep leaf in the
  left subtree, up to their LCA, down to a deep leaf in the
  right subtree. Our `through = dl + dr` at every node
  handles this correctly because we compute `through` for
  every node and take the max.
- Fully clean compile (`ok = true`).
