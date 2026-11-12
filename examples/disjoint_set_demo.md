# disjoint_set_demo.ae

A disjoint-set (a.k.a. union-find) with path compression and union-by-rank. We create 5 singletons `{0}, {1}, {2}, {3}, {4}`, then union them into 2 sets (`{0, 1, 2}` and `{3, 4}`) via three `union` calls. We then run `find` on every node to confirm which component it belongs to.

## What it does

1. **`make_dset(n)`** — fresh disjoint-set with `n` singletons: `parent[i] = i`, `rank[i] = 0`.
2. **`find(parent, x)`** — walk `parent` pointers to the root, then compress the path so every node on it points directly at the root.
3. **`union(parent, rank, x, y)`** — find both roots; if different, attach the smaller-rank tree under the larger-rank tree (union-by-rank). If equal rank, attach `y`'s root under `x`'s root and bump `x`'s rank.
4. **`count_components(parent)`** — count nodes whose `parent[i] == i` (the roots).
5. **Driver** — builds a 5-element disjoint-set, runs three unions, prints the component count after each, then prints every `find` result.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/disjoint_set_demo.ae
```

## Key language features

- **Tuple-of-arrays as a struct** — the disjoint-set is the 2-tuple `(parent, rank)`, threaded through every function. Aether has no record type at the stdlib level, so we use tuples.
- **In-place mutation via index assignment** — `parent[i] = i`, `parent[rx] = ry`, etc. mutate the array. Aether supports this; the type checker warns (treats arrays as immutable by default) but doesn't block.
- **`while` for iteration** — every loop is `while i < n { ...; i = i + 1 }` to avoid the for-loop-scope quirk.
- **Two `while` loops in `find`** — one to walk to the root, one to compress the path. Path compression makes subsequent `find` calls O(α(n)) (amortised near-constant).

## Expected output

```
== Disjoint-set (union-find) demo ==

created 5 singletons: 0, 1, 2, 3, 4
initial components: 5

union(0, 1):
  components: 4
union(1, 2):
  components: 3
union(3, 4):
  components: 2

find each node, report its root:
  find(0) = 0
  find(1) = 0
  find(2) = 0
  find(3) = 3
  find(4) = 3

final component count: 2

All assertions passed.
```

## Design notes

- **Two components after three unions**: `union(0, 1)` makes `{0, 1}`; `union(1, 2)` adds 2 to the same component (since 1 is in {0, 1}); `union(3, 4)` makes a separate `{3, 4}`. So we end with `{0, 1, 2}` and `{3, 4}` — 2 components.
- **Path compression**: after `find(parent, 2)`, the path `2 → 1 → 0` is compressed to `2 → 0` and `1 → 0`. The next `find(2)` is O(1).
- **Union-by-rank**: when two trees have different ranks, the smaller-rank tree is attached under the larger-rank tree (no rank change). When they have the same rank, the second root is attached under the first and the first's rank bumps by 1. This guarantees O(log n) tree depth, which combined with path compression gives O(α(n)) amortised time per operation (α is the inverse Ackermann function — at most 4 for any practical n).
- **`parent[i] == i` indicates a root**: that's how `count_components` identifies roots.
- **Avoids for-loop-scope quirk**: every loop is `while`. The `if rank[rx] < rank[ry]` ladder uses `if/else if/else` chains (the chained `else { if ... }` form) to avoid the early-return-after-block quirk.
- **Type-checker caveat**: `parent[i] = i` produces a non-blocking warning because `parent` is typed `[int]` and `i` is an int (which the type checker considers a mismatch on assignability in some contexts). The evaluator runs correctly.
