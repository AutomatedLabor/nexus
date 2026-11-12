# bfs_grid_shortest.ae

Breadth-first search on a 5x5 grid with hardcoded walls. Finds the
shortest path length (in steps) from `(0, 0)` to `(4, 4)` and prints
it. We flatten `(r, c)` to `r*5+c` and use a FIFO queue with a `head`
pointer (no `deque` needed).

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`bfs_shortest(grid, rows, cols, src, dst)`** — the algorithm:
   - `dist[i] = -1` means "unvisited".
   - Initialize the queue with `src`, `dist[src] = 0`.
   - Pop from the front via a `head` index (we don't shrink the
     queue; we just advance `head`).
   - For each popped cell, push its 4 open neighbors to the back
     and record their distance = parent distance + 1.
   - When `dst` is popped, return `dist[dst]`. If the queue is
     exhausted first, return `-1` (unreachable).
3. **Driver** — prints the grid as ASCII, runs BFS on two grids,
   and asserts the path lengths.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/bfs_grid_shortest.ae
```

## Key language features

- **`int(cur / cols)` and `cur % cols`** — Aether's `/` is float
  division, so we wrap with `int(...)` for the row index.
- **`while` loops** for the queue and neighbor scan — sidesteps
  the for-loop-scope quirk.
- **`let mut head` pointer** for popping from the front of the
  queue (the canonical pattern; avoids `O(n^2)` rebuilds).
- **Early exit via `found` flag** inside the loop condition so we
  stop as soon as `dst` is popped.

## Expected output

```
== BFS grid shortest path ==

grid (# = wall, . = open):
  . . . # .
  # # . # .
  . . . . .
  . # # # #
  . . . . .

shortest path length from (0,0) to (4,4): 12 steps
unreachable case path length: -1 (-1 = no path)

All assertions passed.
```

## Design notes

- The grid is laid out so the only path from `(0, 0)` to `(4, 4)`
  snakes down through the middle and along the bottom — a direct
  top-row path is blocked by walls at `(0, 3)` and `(1, 3)`.
- BFS is optimal on unweighted graphs: the first time a node is
  popped, its distance is final. We could compute path *length*
  even without storing a `parent` array; we keep `parent` here
  only for a potential future extension to also reconstruct the
  path (the existing `bfs_maze.ae` example shows path
  reconstruction; this file focuses on the length only).
- The unreachable-case assertion (`-1`) confirms the function
  handles "destination walled off" cleanly.
