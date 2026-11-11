# dijkstra.ae

Dijkstra's shortest-path algorithm on a tiny 4-node weighted
directed graph. Uses a simple `O(V^2)` priority queue (scan the
`dist` array for the unvisited node with minimum tentative
distance) — no heap, which keeps the code short and dependency-
free.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`dijkstra(graph, n, src)`** — the algorithm:
   - `dist[i] = INF` for all `i`, `dist[src] = 0`, `prev[i] = -1`.
   - For `n` iterations: pick unvisited `u` with min `dist[u]`,
     mark visited, then relax every edge leaving `u`:
     if `dist[u] + w < dist[to]`, update `dist[to]` and `prev[to]`.
   - Returns `[dist, prev]` (Aether v1 has no multi-return, so
     the two arrays are bundled as a pair).
3. **`build_path(prev, src, dst)`** — reconstruct the path
   from `dst` back to `src` via `prev`, then reverse the
   accumulated array.
4. **Driver** — runs the algorithm on a 5-edge graph, prints
   distances from `A`, and the shortest `A -> D` path.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/dijkstra.ae
```

## Key language features

- **Array index-assignment** `dist[to] = nd`, `prev[to] = u`,
  `visited[u] = 1` — supported by the v1 evaluator's
  `assignTo` path. Mark the arrays `let mut` so the type
  checker is happy.
- **`while` loops** for every iteration — sidesteps the
  for-loop-scope quirk.
- **Multi-return via `[dist, prev]`** — Aether v1 has no tuple
  return type; we bundle the two arrays and the caller
  unpacks via `result[0]` / `result[1]`.

## Expected output

```
== Dijkstra shortest path ==

edges:
  A --4--> B
  A --1--> C
  C --2--> B
  C --5--> D
  B --1--> D

dist from A: A=0, B=3, C=1, D=4
shortest path A -> D: A -> C -> B -> D
total distance: 4

All assertions passed.
```

## Design notes

- The shortest `A -> D` path is `A -> C -> B -> D = 1 + 2 + 1 = 4`,
  shorter than the direct-ish routes `A -> C -> D = 6` or
  `A -> B -> D = 5`.
- The early-exit case `u == -1` (no reachable unvisited node
  remains) is handled by setting `iter = n + 1` to bail. A
  real `break` would also work in Aether's while-loop, but
  the sentinel form is more pedagogical.
- For dense graphs the `O(V^2)` array-scan PQ is fine; for
  sparse graphs you'd want a binary heap. The complexity
  here is `O(V^2 + E)`.
- The type checker reports one warning about the `[[int]]`
  return type — non-blocking, like all v1 type warnings.
