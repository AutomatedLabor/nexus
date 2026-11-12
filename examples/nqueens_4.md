# nqueens_4.ae

Solve the 4-queens problem — place 4 chess queens on a 4x4 board such that no two queens attack each other (no two share a row, column, or diagonal). The demo counts all distinct solutions (there are exactly 2 for n = 4) and prints the first one as an ASCII board.

## What it does

We use the standard "one queen per row" formulation: `cols[r]` gives the column of the queen in row `r`. This automatically satisfies the "no two queens in the same row" constraint, leaving only the column and diagonal constraints to check.

The algorithm is recursive backtracking:

1. Try to place a queen in row 0. For each column 0..3, check if it's *safe* (no other queen in the same column or diagonal).
2. If safe, place the queen and recurse on row 1.
3. Repeat for rows 1, 2, 3.
4. When `row == n` (all queens placed), increment the solution count and (if this is the first solution) save the placement.
5. After trying all columns for a row, undo the placement (set `cols[row] = -1`) and return.

The "safe" check examines all previously placed queens:
- **Column conflict:** `cols[r] == col` — another queen is in the same column.
- **Diagonal conflict (left-leaning):** `cols[r] - r == col - row` — the slope between (r, cols[r]) and (row, col) is +1.
- **Diagonal conflict (right-leaning):** `cols[r] + r == col + row` — the slope is -1.

## Why it's interesting

The N-queens problem is the canonical "find all configurations" constraint satisfaction problem. For n = 4 there are exactly 2 solutions; for n = 8 there are 92; for n = 27 there are 234,907,967,154,122,528. The backtracking algorithm finds all of them, though the running time grows exponentially.

The 4-queens case is small enough to solve by hand but exhibits all the structural features of the larger versions: a tree-shaped search space, constraints that prune branches early, and (for some n) the surprising fact that solutions exist at all.

## Output

```
== 4-queens solver demo ==

place 4 queens on a 4x4 board with no two attacking each other

total distinct solutions: 2

first solution (Q = queen, . = empty):
. Q . .
. . . Q
Q . . .
. . Q .

4-queens solver complete.
```

The two solutions for n = 4 are mirror images of each other (reflect across the vertical center axis). They are:

1. Queens at (0, 1), (1, 3), (2, 0), (3, 2) — printed above.
2. Queens at (0, 2), (1, 0), (2, 3), (3, 1) — the mirror image.

## Notes

- The algorithm enumerates *all* solutions (it doesn't stop at the first), so we can count them. The `_ = solve(...)` pattern discards the boolean return — we want the side effect of incrementing `solutions_count` and saving `first_solution`.
- The `let mut cell = ""` declaration is necessary because we reassign `cell` based on whether a queen is present. (Plain `let cell = ""` would be immutable.)
- For n = 8, the same code with `n = 8` would find 92 solutions in milliseconds. For n = 12, it finds 14,200 solutions in a few seconds. Beyond that, the search tree grows too large for naive backtracking; constraint propagation becomes essential.
