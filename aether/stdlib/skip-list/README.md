# Aether stdlib — `skip-list`

The `skip-list` module implements a **skip list** — a
probabilistic ordered data structure supporting O(log n) average-
time search, insert, and delete on a sorted set of comparable
keys.  Skip lists are an alternative to balanced trees (AVL, red-
black): they have the same asymptotic complexity, are simpler to
implement, and are lock-free-friendly for concurrent variants.

## Why a skip list?

A skip list is a multi-level linked list.  The bottom level is a
sorted linked list of all elements.  Each higher level is an
"express lane" — a sparser linked list that skips over some
elements (each element appears in the next-higher level with
probability 1/2).  Search starts at the top, moves right while the
next key is smaller than the target, then drops down a level when
the next key is larger; eventually reaches the bottom level where
the search completes.  The expected height is O(log n), so search
is O(log n) average.

Compared to a balanced tree:

- Simpler to implement (no rotations on insert/delete).
- Same asymptotic complexity.
- Better cache behavior (linked list nodes are smaller than tree
  nodes; the top levels are sparse).
- Easier to make concurrent (lock-free skip lists are well-studied).

## Construction

`slNew(cmp?)` creates a fresh empty skip list with an optional
comparator.  The default comparator is the standard `<` / `>`
comparison (works for numbers, strings, etc.).  For custom keys,
pass a comparator: `(a, b) → int` returning negative if `a < b`,
zero if equal, positive if `a > b`.

```aether
let sl = skip.slNew()              // numbers with default comparator
let sl2 = skip.slNew((a, b) -> b - a)  // reverse comparator (descending order)
```

## Insert

`slInsert(sl, key, value)` adds a (key, value) pair.  If the key
already exists, the value is updated (and `false` is returned to
indicate "updated, not inserted"); if the key is new, a new node
is inserted (and `true` is returned).  The list remains sorted by
key.

```aether
skip.slInsert(sl, 1, "one")
skip.slInsert(sl, 2, "two")
skip.slInsert(sl, 1, "uno")  // updates the value; returns false
```

## Search and contains

`slSearch(sl, key)` returns the value for `key` (or `undefined`
if not in the list).  `slContains(sl, key)` returns a boolean.
Both are O(log n) average.

```aether
skip.slSearch(sl, 1)    // "uno" (the updated value)
skip.slSearch(sl, 99)   // undefined
skip.slContains(sl, 1)  // true
skip.slContains(sl, 99) // false
```

## Delete

`slDelete(sl, key)` removes a key.  Returns true if the key was
present (and is now removed), false if not.  After deletion, the
list's height shrinks if the top levels are now empty.

```aether
skip.slDelete(sl, 1)   // true
skip.slDelete(sl, 99)  // false
skip.slSearch(sl, 1)   // undefined
```

## Min/max and listing

`slMin(sl)` returns the smallest key (the first node) or
`undefined` if empty.  `slMax(sl)` returns the largest key (the
last node) or `undefined`.  `slToSortedArray(sl)` returns all
keys in sorted order (a linear walk along the bottom level).
`slSize(sl)` returns the count.

```aether
skip.slMin(sl)  // 1
skip.slMax(sl)  // 2
skip.slToSortedArray(sl)  // [1, 2]
skip.slSize(sl)  // 2
```

## Height

`slHeight(sl)` returns the current height of the list (the
highest level actually used).  The height grows as you insert
(with probability 1/2 per level) and shrinks as you delete.
With 1000 elements, the height is typically around 10-12; with
1 million, around 20.  The max level is 32 (allowing up to ~2^32
elements).

## Implementation notes

Each node stores a `key`, `value`, and an array of `next`
pointers (one per level the node appears in).  The head sentinel
has next pointers at every level.  Random levels are generated
with a geometric distribution (p = 0.5): `level = 1 + count of
heads before first tail`.  This gives the expected O(log n)
height.

Insertion: walk down the levels, recording the predecessor at
each level in an `update` array.  When the bottom is reached,
either update the existing value (if found) or insert a new node
with the random level.  Link the new node in at each level using
the `update` array.

Deletion: walk down to find the node, then unlink it at each
level using the `update` array.  Shrink the level if the top
levels are now empty.

## When to use a skip list vs other structures

Use a skip list when:

- You need a sorted set with O(log n) operations.
- You want simple code (vs the rotations of a balanced tree).
- You need ordered iteration (slToSortedArray).
- You might want concurrency (lock-free variants exist).

Use a `set` (hash set) when:

- You only need membership testing (no order).
- O(1) average matters more than O(log n).

Use a `trie` when:

- Your keys are strings and you want prefix queries.

Use a `heap` when:

- You need a priority queue (min or max only, not full order).

## Common patterns

- **Sorted index**: `slInsert(index, key, value)` for each
  record; `slSearch(index, key)` for lookups.  Use a custom
  comparator for case-insensitive or locale-aware ordering.
- **Leaderboard**: `slInsert(board, score, userId)`; `slMax(board)`
  for the top score; `slToSortedArray(board)` for the full
  ranking (note: ties on `score` need a tiebreaker comparator
  that includes `userId`).
- **Range queries**: walk the bottom level from a starting key
  (in v2, `slRange(sl, from, to)` will support this directly).

## Caveats

- The skip list is probabilistic — the O(log n) is an average,
  not a worst case.  In practice, the variance is small; for
  pathological inputs, the worst case is O(n) (extremely
  unlikely with a good RNG).
- The skip list doesn't support duplicate keys (inserting an
  existing key updates its value).  Use a composite key (e.g.,
  `(score, userId)` with a comparator that breaks ties) to
  store duplicates.
- The skip list doesn't persist; v2 may add serialization.
- The skip list is not thread-safe; v2 may add a concurrent
  variant.

The whole module is 10 functions, ~250 lines of TypeScript, no
dependencies.  Wired in by `registerAll` in `aether/stdlib/index.ts`.
