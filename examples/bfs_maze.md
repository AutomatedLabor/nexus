# bfs_maze.ae

Breadth-first search on a 5x5 grid maze. The maze is a hardcoded
2D array of `0` (open) / `1` (wall) cells. BFS finds the shortest
path (in number of steps) from `(0, 0)` to `(4, 4)`, if one
exists, and prints it as a sequence of `(row, col)` pairs.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`bfs_maze(maze, rows, cols, src, dst)`** — the algorithm:
   - Flatten 2D coords `(r, c)` to 1D index `r * cols + c` for
     the `visited` and `parent` arrays.
   - Initialize a queue with `src`, mark visited.
   - Pop from the front of the queue (via a `head` index
     pointer — we don't actually shrink the queue array).
   - For each cell, push its 4 open neighbors to the back of
     the queue and record their parent.
   - If we reach `dst`, reconstruct the path by walking back
     through `parent` and reversing the accumulator.
3. **Driver** — prints the maze as ASCII, runs BFS, and
   demonstrates an unreachable-maze case (empty path).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/bfs_maze.ae
```

## Key language features

- **Flat 1D indexing** for visited/parent tables, avoiding
  `[[int]]` typing headaches for the search state.
- **`int(idx / cols)` and `idx % cols`** to convert flat
  indices back to 2D coords for printing.
- **`while` loops** for the queue and path reconstruction —
  sidesteps the for-loop-scope quirk.
- **`let mut head` pointer** for popping from the front of
  the queue, rather than rebuilding the array each pop (the
  naive `O(n^2)` queue would still work for a 25-cell maze,
  but the pointer is the canonical pattern).

## Expected output

```
== BFS on a 5x5 maze ==

maze (# = wall, . = open):
  . . # . .
  # . # . #
  . . . . .
  . # # # .
  . . . . .

start: (0, 0), end: (4, 4)
path (8 steps): (0, 0) -> (0, 1) -> (1, 1) -> (2, 1) -> (2, 2) -> (2, 3) -> (2, 4) -> (3, 4) -> (4, 4)

All assertions passed.
```

## Design notes

- The maze is intentionally drawn with one wall blocking the
  "obvious" path along the top row (the `#` at `(0, 2)` and
  `(1, 2)`), forcing BFS to dip down through row 2 to reach
  the right side.
- BFS is *the* canonical shortest-path algorithm on an
  unweighted graph: when it pops a node, that node's distance
  is final. No need to revisit.
- The "unreachable" case shows that BFS returns an empty
  path when the destination is walled off — the driver
  prints an empty `""` and the assertion confirms `[]`.
- The `safety` counter in the reconstruction loop guards
  against cycles if `parent` ever gets corrupted — defensive
  programming that's overkill here but cheap.
