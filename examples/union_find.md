# union_find.ae

Union-Find (disjoint set) with path compression and union-by-rank.
We build a disjoint-set forest, support `find(x)` (return the root
of the tree containing x) and `union(a, b)` (merge the two sets),
and use it to detect cycles in an undirected graph.

## What it does

1. **`make_set(n)`** — returns `(parent, rank)` parallel arrays;
   every node starts as its own root with rank 0.
2. **`find(parent, x)`** — returns the root of the set containing
   `x`. Implements **iterative path compression**: walk up to the
   root, then walk again pointing every node along the path
   directly at the root.
3. **`union(parent, rank, a, b)`** — finds the roots of `a` and
   `b`. If they're different, attaches the shorter tree under the
   taller one (union by rank); increments rank when merging
   equal-rank trees. Returns `true` if a merge happened, `false`
   if they were already in the same set.
4. **`has_cycle(n, edges)`** — process every edge; if `find(u) ==
   find(v)` for an undirected edge, the two endpoints are already
   connected and the edge would close a cycle.
5. **Driver** — builds a set of 8 elements, performs several
   unions, prints the resulting roots, merges the last two sets,
   and runs cycle detection on two example graphs.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/union_find.ae
```

## Key language features

- **Mutating parallel arrays** — `parent` and `rank` are passed
  as parameters and modified in place. Aether lets you mutate
  array elements via `arr[i] = v`.
- **`find` returns the root** as an `int` and mutates `parent`
  for path compression as a side effect — Aether supports
  mixed side-effecting + value-returning functions.
- **Tuple-typed return**: `make_set` returns `([int], [int])`.
- **`while` loops** for the iterative find — sidesteps the
  for-loop-scope quirk.

## Expected output

```
== Union-Find with path compression ==

union operations:
  union(0, 1) -> merged=true
  ...
  union(4, 5) -> merged=true

find(0) = 0
...
find(7) = 3

union(2, 7) -> merged=true  (all 8 elements now in one set)
find(0) = 0  (same root as find(7) = 0)

graph 1 has cycle: true
graph 2 has cycle: false

All assertions passed.
```

## Design notes

- Path compression is amortized nearly-constant, so `find` is
  fast in practice. We use the iterative version because the
  recursive version would only return the root, not compress
  the path on the way back.
- Union by rank keeps the tree shallow. When two equal-rank
  trees merge, the resulting root's rank grows by 1; otherwise
  the taller tree absorbs the shorter one without changing
  its rank.
- The cycle-detection demo confirms that a 4-cycle graph
  (`0-1-2-3-0`) is flagged, while a simple path
  (`0-1-2-3-4`) is not.
