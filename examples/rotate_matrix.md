# rotate_matrix.ae

Rotate an N x N matrix by 90 degrees clockwise, in place.

## What it does

1. **`get`/`set`/`swap`** — index helpers for a flat row-major
   matrix layout `[m[0][0], m[0][1], ..., m[n-1][n-1]]`.
2. **`transpose(m, n)`** — swap `(i, j)` with `(j, i)` for `i < j`.
3. **`reverse_rows(m, n)`** — for each row, swap cols `k` and
   `n-1-k` for `k < n/2`.
4. **`rotate(m, n)`** — calls `transpose` then `reverse_rows`.
   This is the classic two-step decomposition of 90° clockwise
   rotation.
5. **`show_matrix(m, n)`** — pretty-printer that lays out the
   matrix as `[1, 2, 3]\n[4, 5, 6]\n...`.
6. **Driver** — rotates a 3x3 and 4x4 matrix visibly, then
   asserts five sub-results including the 4-rotations-return-
   to-original property and the 1x1 edge case.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/rotate_matrix.ae
```

## Key language features

- **Flat row-major array encoding** — Aether's nested arrays
  are JS arrays of arrays, but typing `[int]` is cleaner than
  `[[int]]` in the v1 evaluator.
- **`int(n / 2)`** — integer division (the v1 evaluator's `/`
  is float division).
- **Nested `while` loops** for the transpose and reverse-rows
  passes — sidesteps the for-loop-scope quirk.
- **In-place mutation** via `set` (index-assign) — the matrix
  is rotated without allocating a new array.

## Expected output

```
== Rotate matrix 90 deg clockwise ==

Before:
[1, 2, 3]
[4, 5, 6]
[7, 8, 9]

After:
[7, 4, 1]
[8, 5, 2]
[9, 6, 3]

4x4 before:
[1, 2, 3, 4]
[5, 6, 7, 8]
[9, 10, 11, 12]
[13, 14, 15, 16]

4x4 after:
[13, 9, 5, 1]
[14, 10, 6, 2]
[15, 11, 7, 3]
[16, 12, 8, 4]

All assertions passed.
```

## Design notes

- The two-step decomposition (transpose + reverse rows) is the
  standard in-place rotation: each step is O(N²) and the
  composition is a 90° clockwise rotation.
- The "4 rotations return to the original" property is a
  strong sanity check — rotating 4 times is the identity.
- For `n = 1`, the matrix is trivially invariant.
- The 2x2 case `[[1,2],[3,4]]` rotates to `[[3,1],[4,2]]` — the
  clockwise swap of the four corners.
- Fully clean compile (`ok = true`).
