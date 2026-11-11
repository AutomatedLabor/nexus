# nqueens.ae

The N-queens puzzle via recursive backtracking. Place N
queens on an N×N chessboard so no two share a row, column,
or diagonal. For N=6, there are exactly 4 solutions; this
program counts them and prints the first one.

## What it does

1. **`is_safe(board, row, col)`** — checks whether placing a
   queen at `(row, col)` conflicts with the queens already in
   `board[0..row)`. Uses the 1D array representation
   (`board[r] = c`) so conflict checks are O(row): same column
   (`board[r] == col`) or same diagonal
   (`abs(board[r] - col) == abs(row - r)`).
2. **`solve(board, row, n, first)`** — recursive backtracker.
   Tries each column in `row`; if safe, places the queen and
   recurses to `row+1`. Counts solutions and remembers the
   first one found.
3. **`show_board(board, n)`** — renders the board as an N×N
   grid of `.` (empty) and `Q` (queen), row by row.
4. **Driver** — runs `solve` for N=6, prints the count (4) and
   the first solution as a grid. Then runs the same algorithm
   for N=4 (2 solutions), N=3 (0), N=1 (1) and asserts.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/nqueens.ae
```

## Key language features

- **Recursion with multiple return values** — `solve` returns
  `(count, first_solution)` as a tuple.
- **Tuple destructuring** — `let count = result.0; let first = result.1;`.
- **Array concatenation** — `board + []` clones the board before
  appending the next queen column (avoids shared mutable state).
- **Conditional expression assignment** — `let recorded = if len(first) == 0 { board } else { first };`.
- **Nested `while` loops** for the all-pairs safety check on the
  final solution.

## Expected output

```
== N-queens via recursive backtracking ==

Solving 6-queens...

Number of solutions: 4

First solution found:
. Q . . . .
. . . Q . .
. . . . . Q
Q . . . . .
. . Q . . .
. . . . Q .
All assertions passed.
```

## Design notes

The backtracking is exhaustive but prunes as soon as a placement
is unsafe. The `first` accumulator is threaded through the
recursion so the first solution found (depth-first, left-to-right)
is preserved across all branches. The 4-solution count for
6-queens matches the OEIS sequence A000170 (1, 1, 0, 0, 2, 10, 4,
40, 92, ...).
