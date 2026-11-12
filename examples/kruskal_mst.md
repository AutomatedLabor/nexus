# kruskal_mst.ae

Kruskal's Minimum Spanning Tree algorithm on a 6-node undirected weighted graph. We sort edges by weight, then greedily add each edge whose endpoints aren't already connected. A union-find (disjoint-set) data structure with path compression and union-by-rank tracks connectivity.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`insert_sort_edges(edges)`** — in-place insertion sort on a copy of the edge list, keyed on the first element (weight).
3. **Union-find** — `uf_new`, `uf_find` (with path compression), `uf_union` (with union-by-rank). Returns `false` from `uf_union` when both endpoints already share a root.
4. **`kruskal(edges, n)`** — sort edges, scan them, accept any whose endpoints aren't unioned, and push `[w, u, v]` onto the MST list.
5. **Driver** — prints every edge, the chosen MST edges, and the total weight.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/kruskal_mst.ae
```

## Key language features

- **`while` for everything** — no `for in` to avoid the v1 for-loop-scope quirk.
- **`[[int]]` return types** for the union-find state (parent + rank bundled as a pair of arrays).
- **Path compression in `uf_find`** — `uf[0][cur] = uf[0][uf[0][cur]]` shortens the chain on each lookup.
- **Insertion sort, not quicksort** — keeps the sort stable for the MST tie-breaking and avoids stack overflows in the v1 evaluator.

## Expected output

```
== Kruskal's MST ==

edges:
  A -- B  w = 7
  ...
MST (5 edges):
  A -- D  w = 5
  C -- E  w = 5
  D -- F  w = 6
  A -- B  w = 7
  B -- E  w = 7
total weight: 30

All assertions passed.
```

## Design notes

- The MST weight (30) is the sum of the 5 lightest edges that keep the forest acyclic. Edges `B-C (8)` and `E-F (8)` are rejected because their endpoints are already connected after earlier additions.
- The path-compressed union-find is `O(α(n))` per operation — effectively constant.
- For dense graphs, Prim with a heap can be faster; for sparse graphs, Kruskal wins because it's `O(E log E)`.
