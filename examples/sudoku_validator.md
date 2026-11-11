# sudoku_validator.ae

Validates a 9×9 Sudoku grid by checking that each row, each
column, and each 3×3 box contains the digits 1–9 exactly once.
The validator doesn't solve the puzzle — it just determines
whether a completed grid is a valid solution.

## What it does

1. **`flatten(grid)`** — converts a 9×9 grid (a list of 9 row
   lists, each of 9 integers) into a flat `[int]` for easier
   linear access.
2. **`row_valid(grid, r)`**, **`col_valid(grid, c)`**,
   **`box_valid(grid, br, bc)`** — each builds a 9-element
   "seen" array by walking the cells in that group (row,
   column, or 3×3 box). A group is valid iff every digit
   1..9 appears exactly once.
3. **`is_valid(grid)`** — checks all 9 rows, 9 columns, 9
   boxes; returns `true` iff all are valid.
4. **`show_grid(grid)`** — renders the grid with box separators
   (`------+-------+------`) for pretty printing.
5. **Driver** — validates three samples: a complete valid
   solution, an invalid grid with a row conflict, and a grid
   with a box conflict.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/sudoku_validator.ae
```

## Key language features

- **Nested arrays** — `[[int]]` (list of row lists) is the
  natural Sudoku representation.
- **Inner helper functions** — `seen_count` is a local `fn`
  that captures the grid parameter via closure.
- **Boolean accumulator pattern** — `ok = ok && row_valid(...)`
  folds all checks with short-circuit-free conjunction.
- **Nested `while` loops** to walk rows × columns and boxes.
- **`reduce`** to flatten the grid for box-style access.

## Expected output

```
== Sudoku validator ==

Sample 1 (complete valid solution):
5 3 4 | 6 7 8 | 9 1 2
6 7 2 | 1 9 5 | 3 4 8
...
Sample 2 (invalid — duplicate 5 in row 0):
  valid? false (expected false)
Sample 3 (invalid — bad 3x3 box):
  valid? false (expected false)
All assertions passed.
```

## Design notes

The validator uses a **9-element "seen" array** as a manual
counting sort: for each group, walk the cells, increment
`seen[digit-1]`, then check all entries are exactly 1. This
avoids needing a hash set (which v1 doesn't expose) and is
O(9) per group — total O(81) work, constant in puzzle size.
