# bst_demo2 — Iterative Binary Search Tree

A binary search tree demo using an iterative (explicit-stack)
in-order traversal, in contrast to the recursive `bst_demo.ae`
which uses an enum-based tree and recursive traversal.

## What it does

Inserts the keys 7, 3, 9, 1, 5, 8, 10 into a BST represented as
an array of `Node { key, left, right }` structs (with `left` and
`right` storing array indices, not pointers). Then runs:

- a **pre-order traversal** (root, left, right) using an explicit
  stack of node indices;
- an **in-order traversal** (left, root, right) using an explicit
  stack and a "go left until you can't, then pop, visit, go right"
  loop — the canonical iterative in-order pattern;
- an iterative **membership test** that walks the tree without
  recursion;
- an iterative **depth** computation that uses a stack of
  `(node_idx, depth)` pairs.

Prints the insert order, the pre-order and in-order traversals,
the tree depth, and runs four membership hits + four misses.

## Why iterative?

The recursive `bst_demo.ae` is simpler, but the v1 Aether
evaluator caps call depth, so deep trees (e.g. a degenerate
"inserted in sorted order" tree with 1000 nodes) blow the stack.
The iterative version has no recursion, so it scales to any
tree depth the step limit allows.

## Output

```
== Iterative BST (struct + explicit stack) ==

insert order: [7, 3, 9, 1, 5, 8, 10]
node count:   7
pre-order:    [7, 3, 1, 5, 9, 8, 10]
in-order:     [1, 3, 5, 7, 8, 9, 10]  (sorted)
depth:        3

membership tests:
  search(7) = true
  search(1) = true
  ...
```

The in-order output is the sorted sequence — proof the tree
preserves the BST invariant. The pre-order matches the
recursive `bst_demo.ae`'s output (modulo representation), so
the two are equivalent.

## Implementation notes

- No `enum` — just `struct Node { key, left, right }` with
  `left`/`right` as array indices (or `-1` for "no child").
- All traversal functions return a fresh `[int]` array; the input
  tree is never mutated.
- Every `if ... { ... }` block (without else) used as a statement
  is followed by `;` — the v1 parser is strict about this when
  the if/else isn't the last expression of a function.
- No `for` loops (defensive against the v1 evaluator's
  for-loop-scope quirk); only `while`.
- The pop operation rebuilds the stack array (no in-place pop on
  arrays in Aether v1).

## Sanity assertions

The example ends with `assert_eq` checks verifying the
in-order, pre-order, search, depth, and empty-tree behaviours.
