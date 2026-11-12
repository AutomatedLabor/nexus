# astar.ae

A* search on a 6x6 grid using the Manhattan-distance heuristic.
A* combines Dijkstra's shortest-path search with a heuristic to
guide the frontier, giving optimal paths in less time than BFS when
the heuristic is informative. We use a "lazy" priority queue
(linear scan) since the grid is small.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`manhattan(a, b, cols)`** — Manhattan distance between two
   flat indices: `|ar - br| + |ac - bc|`.
3. **`astar(grid, rows, cols, src, dst)`** — the algorithm:
   - `g[i]` = best known distance from `src` to `i` (init to INF).
   - `closed[i]` = 1 if node has been expanded.
   - `open` is the frontier list (FIFO array, scanned for lowest
     `f = g + h`).
   - On each iteration, pick the lowest-f node from `open`, move
     it to `closed`, then relax its 4 neighbors: if a shorter
     `g` is found, update `g` and push to `open`.
   - Terminate when `dst` is picked (return `g[dst]`) or `open`
     is empty (return `-1`).
4. **Driver** — prints the grid, runs A* on a solvable and an
   unreachable grid, asserts the path lengths.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/astar.ae
```

## Key language features

- **`abs(ar - br) + abs(ac - bc)`** — Manhattan distance, the
  admissible heuristic for 4-connected grids.
- **Swap-pop** for removing the chosen node from `open`: copy the
  last element into the chosen slot, then `pop(open)`.
- **`let mut guard = 0`** counter to prevent infinite loops if
  the heuristic is ever made inadmissible.
- **`while` loops** for the frontier scan — sidesteps the
  for-loop-scope bug.

## Expected output

```
== A* on a grid ==

grid (# = wall, . = open):
  . . . # . .
  # # . # . .
  . . . . . .
  . # # # . #
  . . . # . .
  . # . . . .

A* path length from (0,0) to (5,5): 10 steps
unreachable case path: -1 (-1 = no path)

All assertions passed.
```

## Design notes

- The Manhattan heuristic is admissible (never overestimates) on a
  4-connected grid with unit costs, so A* returns the optimal
  path — the same length as BFS would.
- The "lazy" priority queue is `O(n)` per pop; for grids much
  bigger than ~100 cells, a binary heap would be faster. We keep
  the linear scan to keep the code short.
- The `closed` array prevents re-expanding a node, but A* may
  still update `g[ni]` if a shorter path is found later — that's
  why we check `closed[ni] == 0` rather than simply `dist == -1`.
