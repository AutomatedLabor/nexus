# prim_mst.ae

Prim's Minimum Spanning Tree. Starting from node 0, we grow the tree one node at a time by always adding the cheapest edge that crosses the cut (one endpoint in the tree, the other not). Uses an O(V²) scan over the edge list to find the cheapest cut edge at each step — no heap.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`prim(edges, n)`** — the algorithm:
   - Mark node 0 as in-tree, count = 1.
   - While count < n: scan the edge list for the edge with `in_tree[from] == 1 && in_tree[to] == 0` and minimum weight. Mark `to` as in-tree, push `[from, to, weight]` to MST, increment count.
   - Returns `[]` if the graph is disconnected.
3. **Driver** — prints each undirected edge (only once per pair), the MST edges, and the total weight.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/prim_mst.ae
```

## Key language features

- **`while` for iteration** — sidesteps the for-loop-scope quirk.
- **Edge list with both directions** — `[u, v, w]` and `[v, u, w]` so we can scan once and pick the right direction; the `e[0] < e[1]` filter avoids duplicate display.
- **Sentinel return value** — when no cut edge exists, the algorithm returns the partial MST rather than blocking.

## Expected output

```
== Prim's MST ==

edges:
  A -- B  w = 2
  A -- C  w = 3
  B -- C  w = 1
  B -- D  w = 4
  C -- D  w = 5
  C -- E  w = 6
  D -- E  w = 7

MST (4 edges):
  A -- B  w = 2
  B -- C  w = 1
  B -- D  w = 4
  C -- E  w = 6
total weight: 13

All assertions passed.
```

## Design notes

- The MST (weight 13) connects all 5 nodes through the cheapest 4 edges, one per new node. Note that `C-D (5)` is skipped because D joins via the cheaper `B-D (4)` cut.
- For dense graphs the linear scan is fine; for sparse graphs a binary-heap PQ cuts the complexity from `O(V * E)` to `O(E log V)`.
- The undirected representation (every edge stored both ways) is wasteful in memory but trivial to scan.
