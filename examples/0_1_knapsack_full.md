# 0_1_knapsack_full.ae

0/1 knapsack via DP with item reconstruction. Given weights `w`, values `v`, capacity `W`, and item count `n`, find the subset of items that maximizes total value while total weight ≤ W. We build a 2D DP table and reconstruct the chosen items.

## What it does

1. **`make2d(rows, cols, init)`** — fresh 2D array.
2. **`knapsack(w, v, n, cap)`** — DP fill:
   - `dp[i][c]` = best value using the first `i` items with capacity `c`.
   - For each `i ∈ [1, n]` and `c ∈ [0, cap]`:
     - If `w[i-1] > c`: `dp[i][c] = dp[i-1][c]` (can't take item i).
     - Else: `dp[i][c] = max(dp[i-1][c], dp[i-1][c - w[i-1]] + v[i-1])`.
3. **`reconstruct(dp, w, n, cap)`** — walk back from `dp[n][cap]`:
   - If `dp[i][c] != dp[i-1][c]`, item `i-1` was taken; record it and reduce `c` by `w[i-1]`.
   - Otherwise, skip item `i-1`.
   - Reverse the chosen list.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/0_1_knapsack_full.ae
```

## Key language features

- **`while` for every loop** — outer over items, inner over capacities.
- **`if cond { ... };` after if-else** — required when followed by another statement.
- **Reverse in place** — accumulate chosen items in reverse, then reverse the array.

## Expected output

```
== 0/1 knapsack (with item reconstruction) ==

  items:    4
  weights:  [2, 3, 4, 5]
  values:   [3, 4, 5, 6]
  capacity: 5

  best value: 7
  chosen items (0-indexed): [0, 1]
  total weight of chosen: 5
  total value of chosen:  7

All assertions passed.
```

## Design notes

- For weights `[2, 3, 4, 5]`, values `[3, 4, 5, 6]`, capacity 5, the optimal subset is items 0 and 1 (weight 5, value 7). Item 3 alone has value 6 (worse); item 2 alone has value 5 (worse).
- `O(n * W)` time and space where `W` is the capacity. The space can be reduced to `O(W)` if you don't need reconstruction.
- 0/1 knapsack means each item can be taken at most once. For "unbounded knapsack" (each item can be taken any number of times), change the recurrence to `dp[i][c] = max(dp[i-1][c], dp[i][c - w[i-1]] + v[i-1])`.
- The reconstruct walk uses the `dp` table to recover the actual subset; the chosen items are reported 0-indexed.
