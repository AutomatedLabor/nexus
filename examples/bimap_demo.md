# bimap_demo.ae

A bidirectional map (bimap): 5 `(left, right)` pairs with O(n) lookups in both directions (linear search through two parallel arrays). The bimap enforces a 1-to-1 invariant: if you `put(l, r)` and `r` is already bound to a different `l'`, the old binding is dropped.

## What it does

1. **`bimap_new()`** — fresh empty bimap: `([], [])`.
2. **`bimap_put(bm, l, r)`** — add or update the binding `(l, r)`. If `l` already exists, overwrite its `r`. If `r` is already bound to a different `l'`, drop that binding (rebuild the arrays without the dropped pair, then push the new pair).
3. **`bimap_get_right(bm, l)`** — look up the `r` bound to `l`, or -1 if not bound.
4. **`bimap_get_left(bm, r)`** — look up the `l` bound to `r`, or -1 if not bound.
5. **`show_bimap(bm)`** — render as `{ 1 <-> 100, 2 <-> 200, ... }`.
6. **Driver** — inserts 5 pairs, then probes 3 left-to-right and 3 right-to-left lookups (including a miss).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/bimap_demo.ae
```

## Key language features

- **Tuple-of-arrays as a struct** — the bimap is the 2-tuple `(lefts, rights)`, threaded through every function. Aether has no record type at the stdlib level, so we use tuples.
- **`let mut` for rebinding** — `bm` needs `let mut` so the loop can reassign it after each `bimap_put`.
- **Array of tuples** — `let pairs = [(1, 100), (2, 200), ...]` builds a `[tuple]` array; `p.0` and `p.1` extract the components.
- **`while` for iteration** — every loop is `while i < n { ...; i = i + 1 }` to avoid the for-loop-scope quirk.
- **Linear search** — both `get_right` and `get_left` are O(n) scans. Fine for 5 pairs; for thousands, swap in the `bimap` stdlib module which uses hash-table-style indexing.

## Expected output

```
== Bimap demo (5 pairs, lookups both ways) ==

inserting 5 (l, r) pairs:
  put(1, 100)
  put(2, 200)
  put(3, 300)
  put(4, 400)
  put(5, 500)

bimap: { 1 <-> 100,  2 <-> 200,  3 <-> 300,  4 <-> 400,  5 <-> 500 }

rightward lookups (l -> r):
  get_right(1) = 100
  get_right(3) = 300
  get_right(5) = 500

leftward lookups (r -> l):
  get_left(200) = 2
  get_left(400) = 4
  get_left(999) = -1

All assertions passed.
```

## Design notes

- **1-to-1 invariant**: a bimap enforces that every left value maps to exactly one right value AND every right value maps to exactly one left value. `bimap_put(l, r)` checks both: if `l` is already bound (overwrite its `r`); if `r` is already bound to some other `l'` (drop that binding first, then add the new pair).
- **`get_right` vs `get_left`**: the names are intentional. `get_right(l)` returns the right side bound to left `l`. `get_left(r)` returns the left side bound to right `r`.
- **Sentinel -1 for miss**: Aether has no `Option<int>` at the stdlib level, so we use a sentinel. For real code you'd want a separate `bimap_has_left(bm, l)` predicate.
- **Linear search**: both lookups are O(n) — fine for 5 pairs. The `bimap` stdlib module uses a more efficient structure (hash-table-style indexing) for larger workloads.
- **`put` rebuilds the arrays on a dropped binding**: when `r` is already bound to a different `l'`, we rebuild the two arrays without the dropped pair (O(n)), then push the new pair. For a real bimap you'd use index manipulation to avoid the rebuild, but for 5 pairs the rebuild is trivially fast.
- **Avoids for-loop-scope quirk**: every loop is `while`. The `if found != -1 { ... } else { ... }` chains use the chained `else { if ... }` form to avoid the early-return-after-block quirk.
