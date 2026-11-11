# binary_tree.ae

A binary search tree built from a recursive enum, demonstrating
Aether's algebraic data types, pattern matching, and functional
(tree-persistent) operations.

## What it does

The tree type is a recursive enum:

```aether
enum Tree {
  Node(int, Tree, Tree),
  Leaf,
}
```

A `Tree` is either a `Leaf` (the empty tree) or a `Node` carrying an
integer key plus a left and right subtree. Because the `Node` variant
contains two more `Tree` values, the type is recursive — Aether's
enums support this directly, no `Box` or indirection needed at the
language level (the runtime stores the nested values as tagged JS
objects).

The program implements five pure operations on the tree, all of which
**return new trees** rather than mutating in place:

- `insert(t, v)` — BST insert. Walks down the tree comparing `v` to
  each key, recurses left or right, and constructs a fresh `Node` at
  every level on the way back up. O(log n) typical, O(n) worst case.
- `in_order(t)` — left-root-right traversal returning a sorted `int`
  array. Uses array concat (`+`) to splice the recursed sides with
  the singleton key. The type checker doesn't model `[int] + [int]`,
  so two type errors are reported but the program runs (the playground
  runs programs with type warnings rather than blocking them).
- `pre_order(t)` — root-left-right traversal, useful for visualizing
  the tree shape: each `Node` is followed by its descendants.
- `search(t, v)` — BST membership test.
- `depth(t)` — number of edges from the root to the deepest leaf.

The driver builds a tree from `[5, 3, 7, 1, 4, 6, 8]` using a
recursive `build_from` helper (NOT a `for v in vals` loop), prints the
pre-order and in-order traversals plus the tree depth, runs a few
membership tests, then builds a degenerate right-leaning tree from
`[1, 2, 3, 4, 5]` to demonstrate the worst-case O(n) shape.

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /home/z/my-project/verify_one.ts /home/z/my-project/examples/binary_tree.ae
```

## Key language features

- **Recursive enums**: `Node(int, Tree, Tree)` carries two more `Tree`
  values — a recursive ADT without explicit boxing.
- **Pattern matching** with multi-payload arms
  (`Tree::Node(k, l, r) => …`) and wildcard payloads
  (`Tree::Node(_, l, r) => …`).
- **Recursion as the default iteration style**: `build_from` uses a
  recursive helper with an index instead of a `for` loop to avoid the
  v1 evaluator's for-loop-scope quirk (a `let X` bound before a `for`
  and referenced after fails with "undefined name").
- **Array concat `+`** for splicing traversal results (`[1] + [2]`).
- **`reduce`** for building a comma-joined string out of an int array —
  the canonical pattern for avoiding the for-loop-scope quirk.
- **`assert_eq`** deep-equality checks at the end of the program.

## Expected output

```
== Binary search tree (recursive enum) ==

insert order:  [5, 3, 7, 1, 4, 6, 8]
pre-order:      [5, 3, 1, 4, 7, 6, 8]
in-order:       [1, 3, 4, 5, 6, 7, 8]  (sorted)
depth:          3

search:
  search(3) = true
  search(6) = true
  search(8) = true
  search(0) = false
  search(9) = false
  search(100) = false

sorted input:   [1, 2, 3, 4, 5]
degenerate in-order: [1, 2, 3, 4, 5]
degenerate depth:    5  (worst-case = n)

All assertions passed.
```

## Design notes

- **Functional persistence**: every `insert` returns a new tree, so
  the original `tree` value is unchanged after a subsequent insert.
  This is the natural fit for algebraic-data-type trees in a language
  like Aether and avoids aliasing surprises. The trade-off is O(log n)
  allocation per insert — fine for teaching and small programs.
- **`build_from` uses recursion, not a `for` loop**, specifically
  because of the for-loop-scope quirk in the v1 evaluator. A
  `let mut t = Tree::Leaf; for v in vals { t = insert(t, v); };`
  pattern would fail at the `print(t)` after the loop with "undefined
  name 't'". The recursive helper sidesteps that entirely.
- **Type errors for `[int] + [int]`** are accepted by the playground.
  The runtime supports array concat; the type checker just doesn't
  model it. The program is happy to run with these warnings.
- The degenerate-tree demo (`build_from([1,2,3,4,5])`) has `depth = 5`
  because every insert goes to the right — the classic worst case for
  an unbalanced BST. A real implementation would self-balance (AVL,
  red-black); this one is intentionally simple.
