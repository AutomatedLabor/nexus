# Aether stdlib — `rbtree`

A **red-black tree**: a self-balancing binary search tree. Guarantees
O(log n) worst-case time for insert, delete, and search — unlike a
plain BST, which degrades to O(n) when keys are inserted in sorted
order.

## Why a red-black tree?

Balanced binary search trees are the canonical ordered map. Uses:

- **Ordered maps**: when you need both point lookup (`rbSearch`)
  and ordered traversal (`rbInOrder`) on the same data. Hash
  tables give O(1) lookup but no ordering; linked lists give
  ordering but O(n) lookup; balanced BSTs give both at O(log n).
- **Range queries**: find every key in `[lo, hi]` via
  `rbSuccessor` walking from `lo`.
- **Database indexes**: many databases (PostgreSQL's btree, MySQL
  InnoDB) use B+trees, which generalise the red-black idea to
  disk-friendly multiway trees.
- **Scheduler run-queue**: Linux's CFS (completely fair
  scheduler) uses a red-black tree keyed by virtual runtime to
  find the next task in O(log n).
- **Memory allocator**: tracking free regions of memory ordered
  by address.
- **Symbol tables in compilers**: scope chains often use a
  balanced BST per scope for fast lookup + ordered dump.
- **Linguistic concordances**: store word -> occurrences; the
  in-order traversal gives a sorted concordance for free.

## The red-black invariants

A red-black tree is a BST where every node is coloured RED or
BLACK and the following hold:

1. The root is BLACK.
2. Every leaf (NIL) is BLACK.
3. RED nodes have BLACK children (no two reds in a row).
4. Every path from a node to its descendant leaves contains the
   same number of BLACK nodes (the "black-height").

Together these guarantee the height is at most 2 log(n+1) — i.e.,
O(log n). Insert and delete restore the invariants via local
rotations and colour flips (amortised O(1) per operation).

This implementation follows the classic CLRS (Cormen, Leiserson,
Rivest, Stein) textbook design — `insertFixup` and `deleteFixup`
are direct transliterations of the CLRS pseudocode.

## Construction

```typescript
import * as RB from "aether/stdlib/rbtree";

const t = RB.rbNew<number, string>();
RB.rbInsert(t, 5, "five");
RB.rbInsert(t, 2, "two");
RB.rbInsert(t, 8, "eight");
RB.rbInsert(t, 1, "one");
RB.rbInsert(t, 9, "nine");
// In-order traversal yields sorted keys.
RB.rbInOrder(t);   // -> [[1, "one"], [2, "two"], [5, "five"], [8, "eight"], [9, "nine"]]
RB.rbMin(t);       // -> 1
RB.rbMax(t);       // -> 9
RB.rbSearch(t, 5); // -> "five"
```

`rbNew` accepts an optional comparator for non-default key
orderings. The comparator returns negative if `a < b`, zero if
equal, positive if `a > b` — the standard `<=>` convention. The
default uses `<`/`>` directly, which works for numbers and
strings.

## Core operations

- `rbInsert(t, key, value)` — insert (or update). Returns `true`
  if a new node was created, `false` if the key already existed
  and the value was updated. O(log n).
- `rbDelete(t, key)` — remove by key. Returns `true` if a node
  was removed, `false` if the key was not present. O(log n).
- `rbSearch(t, key)` — point lookup. Returns the value, or
  `undefined` if not present. O(log n).
- `rbMin(t)` / `rbMax(t)` — extremes. O(log n) (walk to the
  leftmost / rightmost node).
- `rbSuccessor(t, key)` / `rbPredecessor(t, key)` — the
  next-larger / next-smaller key in the tree. O(log n).
- `rbInOrder(t)` — a fresh array of `[key, value]` pairs in
  sorted order. O(n).
- `rbSize(t)` — number of elements. O(1).

`rbSuccessor` / `rbPredecessor` return `undefined` if the key
is not present (or has no successor / predecessor). For a
range-scan starting at a key that might not be present, use
`rbMin` and walk via `rbSuccessor`.

## Worked example: range scan

To find every key in the half-open interval `[lo, hi)`:

```typescript
const t = RB.rbNew<number, number>();
// ... insert keys ...
const lo = 10;
const hi = 50;
const result: Array<[number, number]> = [];
// Find the first key >= lo.  We use rbMin and walk via rbSuccessor,
// skipping keys < lo.  A real implementation would provide a
// dedicated lowerBound method; this is the obvious workaround.
let cur = RB.rbMin(t);
while (cur !== undefined && cur < hi) {
  if (cur >= lo) {
    result.push([cur, RB.rbSearch(t, cur)!]);
  }
  cur = RB.rbSuccessor(t, cur);
}
```

This is O(k + log n) where k is the result size — each successor
step is O(log n) but the walk amortises to O(1) per step over
the in-order chain.

## Performance

| Operation | Time |
|-----------|------|
| `rbNew` | O(1) |
| `rbInsert` | O(log n) |
| `rbDelete` | O(log n) |
| `rbSearch` | O(log n) |
| `rbMin` / `rbMax` | O(log n) |
| `rbSuccessor` / `rbPredecessor` | O(log n) |
| `rbInOrder` | O(n) |
| `rbSize` | O(1) |

The height of a red-black tree on n nodes is at most
`2 * floor(log2(n+1))` — i.e., O(log n) with a constant factor
of 2. For a million nodes, that's at most 40 levels deep — every
operation visits at most ~40 nodes.

## API

| Function | Signature | Description |
|----------|-----------|-------------|
| `rbNew` | `(cmp?) -> RBTree` | Create a fresh empty red-black tree. |
| `rbInsert` | `(t, key, value) -> bool` | Insert or update; true if new, false if updated. |
| `rbDelete` | `(t, key) -> bool` | Remove by key; true if removed, false if absent. |
| `rbSearch` | `(t, key) -> any?` | Look up value by key; undefined if not present. |
| `rbMin` | `(t) -> any?` | Smallest key, or undefined. |
| `rbMax` | `(t) -> any?` | Largest key, or undefined. |
| `rbSuccessor` | `(t, key) -> any?` | Next-larger key in the tree, or undefined. |
| `rbPredecessor` | `(t, key) -> any?` | Next-smaller key in the tree, or undefined. |
| `rbInOrder` | `(t) -> [[any, any]]` | Sorted array of [key, value] pairs. |
| `rbSize` | `(t) -> int` | Number of elements. |

## Validation

All functions throw a plain `Error` on invalid input (non-tree
object, missing fields). The Aether evaluator converts thrown
errors into Aether panics.
