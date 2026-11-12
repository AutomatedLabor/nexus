# subset_sum.ae

Subset sum via DP. Given a set of non-negative integers and a target `T`, decide whether some subset sums to `T`. We build a boolean DP table `dp[i][s]` meaning "can the first `i` numbers sum to `s`?", then reconstruct the chosen subset.

## What it does

1. **`make2d_bool(rows, cols)`** — fresh 2D array of zeros.
2. **`subset_sum(nums, target)`** — DP fill:
   - `dp[0][0] = 1` (empty subset sums to 0).
   - For each `i ∈ [1, n]` and `s ∈ [0, target]`:
     - If `dp[i-1][s] == 1`: `dp[i][s] = 1` (skip nums[i-1]).
     - If `s + nums[i-1] ≤ target`: `dp[i][s + nums[i-1]] = 1` (take nums[i-1]).
3. **`reconstruct(dp, nums, target)`** — walk back from `dp[n][target]`:
   - If `dp[i-1][s] == 1`: skip item `i-1`.
   - Else: item `i-1` was used; record it and reduce `s`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/subset_sum.ae
```

## Key language features

- **`while` for every loop** — sidesteps the for-loop-scope quirk.
- **Boolean-as-int** — Aether v1 doesn't have a built-in bool type we use here; we use 0/1 ints.
- **`if cond { ... };` after if** — required when followed by another statement.

## Expected output

```
== Subset sum ==

  nums=[3, 34, 4, 12, 5, 2] target=9 -> yes, subset=[2, 4]
  nums=[1, 2, 3, 7] target=6 -> yes, subset=[0, 1, 2]
  nums=[1, 2, 3, 7] target=13 -> yes, subset=[0, 1, 2, 3]
  nums=[1, 2, 5] target=4 -> no
  nums=[] target=0 -> yes, subset=[]

All assertions passed.
```

## Design notes

- For `nums = [3, 34, 4, 12, 5, 2]` and target 9, the subset `{4, 5}` (indices 2, 4) sums to 9.
- The empty subset (`nums = []`, target 0) is a "yes" — the trivial case.
- Complexity: `O(n * target)` time and space — pseudo-polynomial.
- For target sums much larger than `n`, the algorithm becomes slow; for very large targets, meet-in-the-middle is faster (`O(2^(n/2))`).
- The reconstruction walks the table from `dp[n][target]` back to `dp[0][0]`, choosing each item if it was used to reach the current sum.
