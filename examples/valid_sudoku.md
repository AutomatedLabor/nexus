# valid_sudoku.ae

Validate a 9x9 Sudoku grid: check that each row, each column,
and each of the nine 3x3 boxes contains the digits 1-9 exactly
once. (We don't solve — only validate.)

## What it does

1. **`get(g, r, c)`** — index helper for the flat 81-element
   row-major grid.
2. **`group_valid(group)`** — checks a 9-element group: each
   element must be a digit 1-9 and each digit appears exactly
   once. Uses a 10-element `counts` array (indexed by digit 1-9).
3. **`get_row`, `get_col`, `get_box`** — extract a 9-element
   group from the grid.
4. **`valid_sudoku(g)`** — iterates i = 0..8, validating row i,
   column i, and box i in turn. Returns false on the first
   failure.
5. **Driver** — runs the validator on a valid complete solution
   plus three invalid variants (row dup, col dup, box dup), then
   asserts five sub-results including the "contains a 0" case.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/valid_sudoku.ae
```

## Key language features

- **`counts[d] = counts[d] + 1`** — index-assign on a `[int]`
  array to track digit frequencies.
- **`while i < 9 && ok == 1`** — short-circuits on first
  invalid group, sidesteps the for-loop-scope quirk.
- **`int(b / 3) * 3`** — integer division then multiply to
  compute the row offset of 3x3 box b.
- **`(b % 3) * 3`** — modular arithmetic for the column offset.

## Expected output

```
== Valid Sudoku ==

Valid grid: true

Invalid (dup in row 0): false

Invalid (dup in col 0): false

Invalid (dup in box 0): false

All assertions passed.
```

## Design notes

- This example uses a `counts`-array strategy (count each digit,
  then check all counts are exactly 1), as a variant of
  `sudoku_validator.ae` which uses an "all digits present"
  strategy. Both are O(81) and produce the same answer.
- The "contains 0" case is invalid by our strict definition: a
  valid Sudoku solution must have no empty cells. (A puzzle with
  empty cells is "solvable" but not "solved" — we'd reject it.)
- The valid grid is the canonical LeetCode sample solution.
- The three invalid variants each break one constraint class
  (row, column, box) to exercise the three validation paths.
- Fully clean runtime (no runtime errors).
