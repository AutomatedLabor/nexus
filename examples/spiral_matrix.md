# spiral_matrix.ae

Traverse an N x M matrix in spiral order, starting from the
top-left corner and going right, down, left, up, and so on.

## What it does

1. **`get(m, cols, r, c)`** — index helper for a flat row-major
   matrix layout.
2. **`spiral(m, rows, cols)`** — the classic four-pointer
   algorithm:
   - Maintain `top`, `bot`, `left`, `right` as the live boundary
     of the unvisited sub-rectangle.
   - Walk the top row left-to-right, then increment `top`.
   - Walk the right column top-to-bottom, then decrement `right`.
   - Walk the bottom row right-to-left, then decrement `bot`.
   - Walk the left column bottom-to-top, then increment `left`.
   - Stop when `top > bot` or `left > right` (the unvisited
     rectangle is empty).
3. **`show_arr(arr)`** — render an int array as `[1, 2, 3]`.
4. **Driver** — runs the traversal on seven matrix shapes (3x3,
   4x4, 2x3, 3x2, 1x5, 5x1, 1x1), then asserts eight sub-results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/spiral_matrix.ae
```

## Key language features

- **`while done == 0` outer loop with a `done` flag** — sidesteps
  the early-`break` quirk. Each "arm" of the spiral sets `done = 1`
  if the boundary collapses.
- **`if done == 0 { ... }` guards** before each arm — we don't
  push anything if the boundary already collapsed from the
  previous arm.
- **`while c <= right` (with `<=`)** — the inner arms use inclusive
  bounds because `right` is the last valid column index, not a
  one-past-the-end.
- **`while c >= left` for the reverse arms** — counting down with
  the `>=` comparator.

## Expected output

```
== Spiral matrix traversal ==

3x3: [1, 2, 3, 6, 9, 8, 7, 4, 5]
4x4: [1, 2, 3, 4, 8, 12, 16, 15, 14, 13, 9, 5, 6, 7, 11, 10]
2x3: [1, 2, 3, 6, 5, 4]
3x2: [1, 2, 4, 6, 5, 3]
1x5: [1, 2, 3, 4, 5]
5x1: [1, 2, 3, 4, 5]
1x1: [42]

Headline: spiral(3x3) = [1, 2, 3, 6, 9, 8, 7, 4, 5]

All assertions passed.
```

## Design notes

- The `done` flag is set after each arm if the boundary collapses,
  and checked before each subsequent arm — this prevents
  double-pushing when an arm wipes out the last row/column.
- For 2xN and Nx2 cases, the algorithm naturally produces the
  expected spiral — no special-case branches needed.
- The 1xN and Nx1 cases degenerate to a single arm (top row or
  right column) followed by `done = 1`.
- The empty 0x0 case returns an empty array.
- Fully clean compile (`ok = true`).
