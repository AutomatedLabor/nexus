# set_matrix_zeroes.ae

Set Matrix Zeroes: if an element of an M x N matrix is 0,
set its entire row and column to 0. Done in place with O(1)
extra space.

## What it does

1. **`get`/`set`** — index helpers for the flat row-major layout.
2. **`set_zeroes(m, rows, cols)`** — the canonical in-place
   algorithm:
   - Scan row 0 to decide whether row 0 itself needs zeroing.
   - Scan col 0 to decide whether col 0 itself needs zeroing.
   - Use row 0 and col 0 as markers: for each cell `(i, j)` with
     `i ≥ 1, j ≥ 1`, if it's 0, mark `(i, 0) = 0` and `(0, j) = 0`.
   - Apply the markers: for each cell `(i, j)` with `i ≥ 1, j ≥ 1`,
     if `(i, 0) == 0 || (0, j) == 0`, set it to 0.
   - Finally, if `zero_row0` was set, zero row 0. If `zero_col0`
     was set, zero col 0.
3. **`show(m, rows, cols)`** — pretty-printer.
4. **Driver** — runs the algorithm on a 3x3 and a 4x5 matrix
   visibly, then asserts six sub-results including the all-zero
   and no-zero edge cases.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/set_matrix_zeroes.ae
```

## Key language features

- **`while` loops** for every scan — sidesteps the for-loop-scope
  quirk.
- **`if zero_row0 == 1 { ... };` then `if zero_col0 == 1 { ... };`** —
  two separate final passes (not chained `else if`), because both
  may need to fire.
- **`set(m, cols, r, c, v)` returns v** so the call is a valid
  expression statement (Aether treats every statement as an
  expression context).
- **In-place mutation** via index-assign on a `[int]` array —
  no extra matrix is allocated.

## Expected output

```
== Set Matrix Zeroes ==

Before:
[1, 1, 1]
[1, 0, 1]
[1, 1, 1]

After:
[1, 0, 1]
[0, 0, 0]
[1, 0, 1]

Before (4x5):
[0, 1, 2, 0, 3]
[4, 5, 2, 1, 3]
[4, 5, 0, 3, 1]
[5, 2, 0, 3, 1]

After (4x5):
[0, 0, 0, 0, 0]
[0, 5, 0, 0, 3]
[0, 0, 0, 0, 0]
[0, 0, 0, 0, 0]

All assertions passed.
```

## Design notes

- The marker-row/marker-col trick keeps extra space at O(1) —
  no second matrix needed.
- The `zero_row0` and `zero_col0` flags are required because
  row 0 and col 0 themselves serve double duty: they store
  markers AND may need to be zeroed.
- The order of the four passes matters: scan first (no mutation),
  then mark, then apply markers (no more reads of original 0s
  that would trigger fresh markers), then apply row 0 / col 0.
- Fully clean compile (`ok = true`).
