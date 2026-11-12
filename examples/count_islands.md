# count_islands.ae

Count islands in a 2D grid: an island is a group of `1`s
connected horizontally or vertically (4-directional). Count the
distinct islands.

## What it does

1. **`get`/`set`** — flat-row-major index helpers for the grid.
2. **`flood(g, rows, cols, r, c)`** — iterative flood-fill (DFS
   with an explicit stack) that starts at `(r, c)` and marks all
   connected `1`s as `0`. Uses a stack of `r * cols + c` indices
   to avoid recursion (and the v1 evaluator's recursion limits).
3. **`count_islands(g, rows, cols)`** — scan every cell; when we
   see a `1`, increment the count and flood-fill from there.
   Each flood-fill trigger is one island.
4. **`show(g, rows, cols)`** — pretty-printer.
5. **Driver** — runs the algorithm on four visible grids (4x5
   with 3 islands, 4x5 with 1 island, 1x1, 1x4 of zeros) and
   asserts six sub-results including a 3x3 checkerboard (5
   islands).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/count_islands.ae
```

## Key language features

- **Explicit stack of `r * cols + c` indices** — encodes 2D
  positions as 1D ints, sidestepping the need for tuple-on-stack
  support in the v1 evaluator.
- **Manual `pop` via array rebuild** — `pop` exists as a builtin
  but the explicit rebuild keeps the type-checker happy with the
  stack's element type.
- **`int(top / cols)`** — integer division (the v1 evaluator's
  `/` is float division).
- **Nested `while` loops** for the scan — sidesteps the
  for-loop-scope quirk.

## Expected output

```
== Count islands ==

Grid 4x5:
11000
11000
00100
00011

Islands: 3

Grid 4x5:
11110
11010
11000
00000

Islands: 1

Grid 1x1:
1
Islands: 1

Grid 1x4 of zeros: islands = 0

All assertions passed.
```

## Design notes

- The flood-fill mutates the grid (sets visited cells to `0`),
  which makes a separate `visited` array unnecessary.
- The `steps < 100000` safety cap on the flood-fill loop guards
  against pathological infinite loops from bugs in the index
  math; in practice the loop terminates when the stack is empty.
- The checkerboard case `[[1,0,1],[0,1,0],[1,0,1]]` has 5
  islands — the 5 isolated `1`s with no orthogonally-adjacent
  neighbors.
- Fully clean runtime (no runtime errors).
