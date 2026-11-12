# dfs_maze_solve.ae

Depth-first search maze solver on a 5x6 grid. Recursively explores
neighbors (up/down/left/right) until reaching the destination, then
returns the path as a list of flat `(r, c)` indices. DFS does not
guarantee the shortest path; it returns *a* path if one exists.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`snoc(arr, v)`** — functional append (returns a *new* array
   with `v` added to the end). Avoids in-place mutation of the
   path accumulator.
3. **`dfs(...)`** — the recursive core:
   - Base case: `cur == dst` → return `snoc(path, cur)`.
   - Recursive case: scan 4 neighbors in fixed order; for each
     unvisited open neighbor, mark it visited, recurse with the
     extended path. Return the first non-empty sub-result.
4. **`solve(...)`** — entry point: initialize `visited` and call
   `dfs` from `src` with an empty path.
5. **Driver** — prints the maze as ASCII, runs DFS on a solvable
   and an unsolvable maze, asserts results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/dfs_maze_solve.ae
```

## Key language features

- **Recursion** for the DFS visit (with the visited array passed
  as a mutable parameter to share state across recursive calls).
- **`while (d < 4) && (len(out) == 0)`** — short-circuit the
  neighbor scan as soon as a solution is found.
- **`while` loops** everywhere — sidesteps the for-loop-scope bug.
- **Functional `snoc`** keeps the path accumulator immutable; the
  visited array is mutated in place for efficiency.

## Expected output

```
== DFS maze solver ==

maze (# = wall, . = open):
  . # . . . .
  . # . # # .
  . . . # . .
  # # . # . #
  . . . . . .

path (len 16):
  (0, 0) -> (1, 0) -> (2, 0) -> (2, 1) -> (2, 2) -> ...

unsolvable maze path:  (empty = no path)

All assertions passed.
```

## Design notes

- The neighbor order (up/down/left/right) determines the path
  shape. Try changing the order and the output path will differ.
- DFS may explore long dead-ends before finding the destination.
  For a "shortest path" use `bfs_maze.ae` instead.
- The `visited[ni] = 1` mutation before recursing is essential
  to prevent revisiting cells in the same path; the recursive
  call doesn't undo it on failure because we only care about
  finding *a* path, not *all* paths.
- The unsolvable-maze case (`maze2`) returns `[]`, confirming
  the function handles the "no path" case cleanly.
