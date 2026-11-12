# floyd_warshall.ae

Floyd-Warshall all-pairs shortest paths. We build a `dist[i][j]` matrix initialized to `INF` (with `dist[i][i] = 0`), populate it with direct edge weights, then relax through every intermediate vertex `k`: `dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j])`.

## What it does

1. **`repeat(n, v)`** and **`make2d(rows, cols, init)`** — fresh 1D / 2D arrays.
2. **`floyd_warshall(n, edges)`** — the algorithm:
   - Initialize the dist matrix with `INF` everywhere and `0` on the diagonal.
   - Populate direct edges (taking the min if multiple edges exist between two nodes).
   - Triple-nested `while` loop over `k`, `i`, `j`: relax `dist[i][j]` through `dist[i][k] + dist[k][j]`.
3. **`show_matrix(m)`** — renders the matrix as multi-line string with `INF` substituted for unreachable pairs.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/floyd_warshall.ae
```

## Key language features

- **2D arrays via `make2d`** — `[[int]]` works in Aether v1 with `let mut row = [];` then `push(out, row);`.
- **`INF` sentinel = 1 000 000** — large enough to dwarf any real path but small enough not to overflow on addition.
- **`while` for every loop** — sidesteps the for-loop-scope quirk.
- **`if cond { ... };` after if blocks** — required when followed by another statement.

## Expected output

```
== Floyd-Warshall all-pairs shortest paths ==

edges:
  0 -> 1  w = 3
  ...
dist matrix (row = from, col = to):
[0, 3, 4, 6]
[10, 0, 1, 3]
[9, 12, 0, 2]
[7, 10, 11, 0]

All assertions passed.
```

## Design notes

- `O(V³)` time, `O(V²)` space. Best for dense graphs where we want all-pairs shortest paths and don't want to run Dijkstra V times.
- Handles negative edge weights as long as there's no negative cycle. The INF check `dist[i][k] != INF && dist[k][j] != INF` prevents integer underflow from `INF + w`.
- Detecting negative cycles is one more line: after the main loop, check if any `dist[i][i] < 0`. We don't do that here for brevity, but `bellman_ford_neg.ae` shows the single-source variant with detection.
