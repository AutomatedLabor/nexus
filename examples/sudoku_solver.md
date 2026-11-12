# sudoku_solver.ae

A from-scratch 4x4 Sudoku solver via backtracking. The puzzle has block size 2x2 (each row, column, and 2x2 block must contain the digits 1..4 exactly once). The demo prints the puzzle, solves it, and prints the solution.

## The puzzle

```
1 . . .
. . 3 .
. 2 . .
. . . 4
```

## The solution

```
1 3 4 2
2 4 3 1
4 2 1 3
3 1 2 4
```

## What it does

The algorithm is the canonical backtracking approach for constraint satisfaction:

1. Find the next empty cell (in row-major order).
2. Try each digit 1..4 in turn.
3. For each digit, check whether it's *consistent* with the current partial assignment — meaning no other cell in the same row, column, or 2x2 block already has that digit.
4. If consistent, place the digit and recurse on the next empty cell.
5. If recursion succeeds, return true (solved).
6. If recursion fails (no digit works for a later cell), undo the placement (set the cell back to 0) and try the next digit — this is the "backtrack".
7. If no digit works, return false (no solution exists from this partial assignment).

When `find_empty` returns -1 (no empty cells), the grid is complete and the algorithm returns true.

## Complexity

- **Time:** O(n^(n*n)) in the worst case — every cell could potentially try every digit. For 4x4 Sudoku (n=4), this is at most `4^16 ≈ 4 billion` assignments, but with constraint propagation the actual search tree is much smaller (the demo runs essentially instantaneously).
- **Space:** O(n*n) for the grid plus the recursion stack.

## Why it's interesting

Sudoku is the most-widely-recognized constraint satisfaction problem. The 4x4 variant is small enough to solve by hand (and to run in a few thousand operations), but it exhibits all the structural features of the 9x9 version:

- **Variables:** the empty cells.
- **Domains:** the digits 1..n.
- **Constraints:** each row, column, and block must contain each digit exactly once.

Real Sudoku solvers add **constraint propagation** (e.g. "naked singles" — if a cell has only one possible value, fill it in immediately) to prune the search tree before backtracking. The demo uses pure backtracking, which is enough for 4x4 puzzles but would be slow on hard 9x9 puzzles.

## Output

```
== 4x4 Sudoku solver demo ==

puzzle:
1 0 0 0
0 0 3 0
0 2 0 0
0 0 0 4

solution:
1 3 4 2
2 4 3 1
4 2 1 3
3 1 2 4

Sudoku solver complete.
```

## Notes

- The grid is stored as a flat array of 16 ints; the index is `row * n + col`. This is simpler than a 2D array of arrays for this small size.
- The block-bounds computation `int(row / block) * block` gives the top-left corner of the block containing `(row, col)`.
- For 9x9 Sudoku, the algorithm is the same but the puzzle definition and the `n` constant change. A 9x9 puzzle typically takes a few thousand backtracks.
