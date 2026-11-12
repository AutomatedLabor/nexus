# dijkstra_full.ae

Dijkstra's shortest-path algorithm on a 7-node directed weighted graph, with full path reconstruction from the source to every other node. Uses an `O(V^2)` priority queue (linear scan of the `dist` array for the unvisited minimum) so the code is heap-free. The `prev` array records the predecessor used to reach each node, and `build_path` walks `prev` back from any `dst` to `src` then reverses the result.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`dijkstra(edges, n, src)`** — the algorithm:
   - `dist[src] = 0`, all other `dist = INF`, `prev = -1`.
   - For each of `n` rounds: pick unvisited `u` with min `dist`, mark visited, relax every edge leaving `u`.
   - Early-exit when no reachable unvisited node remains.
   - Returns `[dist, prev]`.
3. **`build_path(prev, src, dst)`** — walk back from `dst` through `prev`, accumulate into a reverse array, then flip it.
4. **Driver** — prints every node's distance and reconstructed path.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/dijkstra_full.ae
```

## Key language features

- **`while` for everything** — no `for in` loops (avoids the v1 for-loop-scope quirk).
- **Multi-return via `[dist, prev]`** — Aether v1 lacks tuple returns, so the caller unpacks via `result[0]` / `result[1]`.
- **Edge list as `[[from, to, weight]]`** — easy to iterate with `while` and read by `edge[0]`, `edge[1]`, `edge[2]`.
- **A module-level `let n_safety = 1000`** — used to bound the path-reconstruction loop.

## Expected output

```
== Dijkstra with full path reconstruction ==

edges:
  A --3--> B
  A --1--> D
  ...
distances and paths from A:
  A: dist=0  path=A
  B: dist=3  path=A -> B
  C: dist=4  path=A -> B -> C
  D: dist=1  path=A -> D
  E: dist=6  path=A -> B -> C -> E
  F: dist=9  path=A -> B -> C -> E -> G -> F
  G: dist=7  path=A -> B -> C -> E -> G

All assertions passed.
```

## Design notes

- The shortest `A -> G` path is `A -> B -> C -> E -> G = 3 + 1 + 2 + 1 = 7`, beating the more direct `A -> D -> G = 1 + 7 = 8`.
- For sparse graphs, swapping the linear-scan PQ for a binary heap (`aether-heap-extra`) drops the cost from `O(V^2)` to `O((V + E) log V)`.
- `prev` works for both Dijkstra and BFS; the only difference is the order in which nodes are popped from the queue.
