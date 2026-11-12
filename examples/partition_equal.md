# partition_equal.ae

Partition a set of integers into two subsets of equal sum. Classic NP-complete problem; we solve it via subset-sum DP. If the total sum is odd, no partition exists. Otherwise we ask "is there a subset summing to `total / 2`?" and split into the matching subset and the rest.

## What it does

1. **`make2d(rows, cols)`** — fresh 2D array of zeros.
2. **`subset_sum_dp(nums, target)`** — same DP as `subset_sum.ae`.
3. **`can_partition(nums)`** — returns 1 if a partition exists, 0 otherwise.
4. **`partition_into_two(nums)`** — reconstructs the partition into two arrays A and B with equal sums.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/partition_equal.ae
```

## Key language features

- **`while` for every loop** — sidesteps the for-loop-scope quirk.
- **`int(total / 2)`** — integer division (Aether's `/` is float division).
- **`if cond { ... };` after if-else** — required when followed by another statement.
- **`fn sum_of(arr)`** is declared *after* its first use — Aether v1 hoists top-level `fn` declarations.

## Expected output

```
== Partition equal subset sum ==

  [1, 5, 11, 5] -> yes
    A: [11] (sum = 11)
    B: [1, 5, 5] (sum = 11)
  [1, 2, 3, 4, 5, 6, 7] -> yes
    A: [2, 3, 4, 5] (sum = 14)
    B: [1, 6, 7] (sum = 14)
  [2, 2, 3, 5] -> no
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] -> yes
    A: [1, 1, 1, 1, 1, 1, 1, 1] (sum = 8)
    B: [1, 1, 1, 1, 1, 1, 1, 1] (sum = 8)

All assertions passed.
```

## Design notes

- The partition is non-deterministic in choice of subset; we pick the first valid one returned by the DP walk-back.
- For `[2, 2, 3, 5]` the total is 12 (even), but no subset sums to 6 (the only subsets summing to 6 would be {3, 3?} no, only one 3, or {2, 5} = 7 or {2, 3} = 5 or {2, 2} = 4 or {3, 2} = 5). So `can_partition` returns 0.
- `O(n * total)` time, `O(n * total)` space (pseudo-polynomial).
- For 3-way or k-way partition, the problem becomes much harder; k-way partition is NP-hard in the strong sense.
