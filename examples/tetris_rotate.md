# tetris_rotate.ae

Represent a Tetris piece as a 4x4 grid of ints (`1` for filled,
`0` for empty). Rotate the piece 90° clockwise and print the
before/after grids. Demonstrates with the L, T, and S pieces.

## Rotation formula

A 90° clockwise rotation of an NxN grid maps element
`(row, col)` to `(col, N-1-row)`. Equivalently:

```
new[i][j] = old[N-1-j][i]   for 0 <= i, j < N
```

For N=4, this is a simple nested loop.

## What it does

1. **`rotate_cw(p)`** — rotate a 4x4 grid 90° CW. Returns a
   fresh grid; does not mutate the input.
2. **`rotate_cw4(p)`** — apply `rotate_cw` four times. This
   is a round-trip identity: 4 rotations = no rotation.
3. **`print_piece(label, p)`** — render the grid as `#` /
   `.` for visual inspection.
4. **`count_filled(p)`** — count `1` cells. Used for the
   assertion that rotation preserves the count (a Tetris
   piece always has the same number of cells).
5. **Driver** — rotates the L, T, and S pieces, prints each
   rotation step, and asserts invariants.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/tetris_rotate.ae
```

## Key language features

- **2D list-of-lists** (`[[int]]`) for the grid.
- **`g[r][c]` indexing and assignment**.
- **`while` loops** to build the rotated grid row by row.
- **`assert_eq`** for the round-trip identity and per-cell
  spot checks.

## Visual demo

The L-piece (lying flat at the bottom) and its three CW
rotations:

```
. . . .     # . . .     . . . .     . . . #
. . . .     # . . .     . . . .     . . . #
. . . .     # . . .     . . . .     . . . #
# # # #     # . . .     # # # #     . . . #
(initial)   (1x CW)    (2x CW)    (3x CW)
```

After 4 rotations, the piece returns to its original
orientation.

## Expected output (truncated)

```
== Tetris piece rotation ==

L piece (initial):
  . . . .
  . . . .
  . . . .
  # # # #

L piece (after 1 rotation CW):
  # . . .
  # . . .
  # . . .
  # . . .

L piece (after 2 rotations CW):
  # # # #
  . . . .
  . . . .
  . . . .

...
All assertions passed.
```

## Design notes

- The rotation is done on a fixed 4x4 bounding box. A real
  Tetris implementation would also normalize the piece
  (shift to the top-left after each rotation) to keep the
  visual position consistent.
- The standard Tetris "SRS" (Super Rotation System) defines
  wall kicks for each piece and rotation state. The version
  here is the mathematical rotation only — no wall kicks,
  no offset table.
