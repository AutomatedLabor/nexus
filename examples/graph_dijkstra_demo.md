# graph_dijkstra_demo.ae

Dijkstra's shortest-path algorithm on a 5-node weighted directed graph. Uses a simple O(V²) priority queue (scan the `dist` array for the unvisited node with minimum tentative distance) — no heap, which keeps the code short and dependency-free. Tracks a `prev` array during relaxation so the shortest path can be reconstructed by walking back from the destination.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`node_name(i)`** — 0 → "A", 1 → "B", …, 4 → "E" (chained `if/else` expressions).
3. **`show_path(arr)`** — render a node-index array as "A -> B -> C" using `reduce`.
4. **`dijkstra(graph, n, src)`** — run the algorithm:
   - Initialize `dist[src] = 0`, others `INF`.
   - For `n` iterations: pick the unvisited `u` with min `dist[u]`, mark visited, relax every edge leaving `u`.
   - Returns `[dist, prev]`.
5. **`build_path(prev, src, dst)`** — walk `prev` from `dst` back to `src`, build in reverse, then reverse the result.
6. **Driver** — builds the 5-node graph, runs Dijkstra from A, prints the dist array, prints the shortest path from A to every other node, and asserts the expected distances.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/graph_dijkstra_demo.ae
```

## Key language features

- **`reduce(arr, fn(acc, x) -> T, init)`** — the canonical "fold over array" builtin; used here to build the path string.
- **Chained `if/else` expressions** — Aether's `if` is an expression, so `node_name` reads as a ladder of `if i == 0 { "A" } else { if i == 1 { "B" } else { ... } }`.
- **Bare-expression returns** — `build_path` uses `[]` as the empty-path return value (no `return [];` statement); the `if cond { [] } else { ... }` is the function's trailing expression.
- **`while`-only loops** — no `for i = 0; i < n; i = i + 1` (avoids the for-loop-scope quirk).
- **`int` arithmetic, no `/`** — the algorithm uses only `+` and `<`; no integer-division needed.
- **`assert_eq`** — builtin equality assertion that panics if the two sides differ.

## Expected output

```
== Dijkstra shortest path (5-node graph) ==

edges:
  A --2--> B
  A --5--> C
  B --1--> C
  B --2--> D
  C --3--> D
  C --1--> E
  D --4--> E
  E --2--> A

dist from A: A=0, B=2, C=3, D=4, E=4

shortest paths from A:
  A -> A: A  (total 0)
  A -> B: A -> B  (total 2)
  A -> C: A -> B -> C  (total 3)
  A -> D: A -> B -> D  (total 4)
  A -> E: A -> B -> C -> E  (total 4)

All assertions passed.
```

## Design notes

- **O(V²) priority queue**: the inner "find min unvisited" scan is O(V), done V times → O(V²). For 5 nodes this is trivially fast; for larger graphs, swap in the binary-heap priority queue from `priority_queue_demo.ae` to get O((V + E) log V).
- **Edge list, not adjacency matrix**: the graph is stored as `[from, to, weight]` triples. The relax pass scans every edge each iteration — O(E) per outer iteration, so the whole algorithm is O(V · E). For dense graphs an adjacency matrix would be faster; for sparse graphs an adjacency list keyed by `u` would be faster. We pick the simplest representation.
- **Back edge `E --2--> A`**: makes the graph cyclic. Dijkstra handles cycles correctly as long as all weights are non-negative (which they are here). The back edge doesn't change any shortest path because A's distance is already 0 by the time E is processed.
- **Unreachable nodes**: `build_path` returns `[]` when `prev[dst] == -1 && src != dst`. The driver prints "unreachable" in that case.
- **`safety < 1000` guard in `build_path`**: a defensive counter to prevent infinite loops if `prev` has a cycle (which it shouldn't, but the guard is cheap insurance).
- **Avoids for-loop-scope quirk**: every loop is `while i < n { ...; i = i + 1 }`. The `reduce` in `show_path` is a single expression, not a loop, so it doesn't trigger the quirk either.
