# bfs_shortest_path.ae

Breadth-first search for the shortest unweighted path in a directed graph represented as an adjacency list (an array of neighbor-index arrays). A FIFO queue — a flat array with a moving `head` cursor — keeps the frontier in visit order, and a `parent` array records each node's predecessor so we can reconstruct the path from `src` to `dst` after BFS finishes.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v` (used for `visited` and `parent`).
2. **`bfs_path(adj, n, src, dst)`** — the algorithm:
   - `visited[src] = 1`, `queue = [src]`, `parent` all `-1`.
   - Pop from the queue head; if it's `dst`, mark found.
   - Otherwise enqueue each unvisited neighbor and record its parent.
   - Reconstruct the path by walking `parent` from `dst` back to `src`, then reverse the accumulated array.
3. **`show_path`** — render an int array as `"0 -> 1 -> 3 -> 5"`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/bfs_shortest_path.ae
```

## Key language features

- **`while`-loop iteration** throughout (no `for in` to avoid the v1 evaluator's for-loop-scope quirk).
- **Array index-assignment** `visited[nb] = 1`, `parent[nb] = cur` — works because we mark arrays `let mut`.
- **`reduce` for string join** — a tidy way to turn an int array into a delimited string.
- **Early-exit sentinel** — instead of a `break` we use `found = true` and let the loop's predicate end iteration.

## Expected output

```
== BFS shortest path ==

graph (adjacency list):
  0: [1, 2]
  1: [3]
  2: [1, 4]
  3: [5]
  4: [5]
  5: []

shortest path 0 -> 5: 0 -> 1 -> 3 -> 5
length (edges): 3

All assertions passed.
```

## Design notes

- The graph above has two equal-length shortest paths from 0 to 5: `0 -> 1 -> 3 -> 5` and `0 -> 2 -> 4 -> 5`. BFS finds the first one to enqueue, which depends on neighbor order. With `[1, 2]` at node 0 the path through 1 wins.
- For unweighted graphs BFS gives shortest path; for weighted graphs use Dijkstra (see `dijkstra_full.ae`).
- Complexity is `O(V + E)` time and `O(V)` space.
- A `parent` table is simpler than a `dist` table for path reconstruction; the BFS queue guarantees the parent edge is part of a shortest path.
