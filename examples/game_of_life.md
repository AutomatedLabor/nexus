# game_of_life.ae

Conway's Game of Life on an 8x8 grid, evolved for 5 generations and printed as `#` (live) and `.` (dead). The simulation is a classic cellular automaton that exercises Aether's nested arrays, mutability, and `while` loops side by side.

## What it does

1. Builds an 8x8 grid of zeros with `zeros(rows, cols)` using nested `for i in range(...)` loops and `push`.
2. Seeds the grid with an R-pentomino placed in the middle (5 cells in rows 3-5, columns 3-5).
3. For each generation, builds a fresh grid using `step(g)`:
   - Counts each cell's 8 neighbors via `count_neighbors`, which delegates to `get_cell` for boundary-safe reads (out-of-bounds returns 0).
   - Applies the standard rules: live cells with 2 or 3 neighbors survive, dead cells with exactly 3 neighbors are born, everything else dies or stays dead.
4. Prints each generation with `print_grid`, which renders live cells as `#` and dead cells as `.` in a monospaced grid.
5. At generation 5, counts the live cells and asserts the count is non-zero.

## Key language features

- **Nested arrays**: `[[int]]` is the matrix type. Index access `g[i][j]` and index assignment `g[i][j] = 1` both work, including through two levels of indexing.
- **Mutable bindings**: `let mut next = zeros(...)` is required for any local that will be assigned. Index-assignment into an immutable local also trips the checker, so the array itself needs `mut`.
- **`while` for tight loops**: `count_neighbors` uses two nested `while` loops over the offsets `{-1, 0, 1}` to visit the 8 surrounding cells — denser than 8 explicit calls.
- **Boundary safety as a helper**: `get_cell(g, i, j)` returns 0 outside the grid, which is simpler than wrapping or extending the grid with a halo row.
- **3-argument `range`**: `range(0, rows, 1)` keeps the type checker happy; the 2-argument form also runs but the v1 type signature registers `range` as three ints.
- **Pure step**: each generation builds a new grid rather than mutating the current one, so neighbor counts always reflect the previous state.

## Notes on style

- The R-pentomino is small-but-active: 5 cells, but it drifts and fragments visibly across generations before stabilizing. Five generations is enough to show motion without blowing the step budget.
- The live-cell count at the end doubles as a smoke test: if `step` ever produced an all-dead grid, the assertion would fire.
