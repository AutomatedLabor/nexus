# house_robber.ae

House robber: given an array of non-negative integers
representing the cash in each house, find the maximum amount
you can rob without robbing two adjacent houses.

## What it does

1. **`rob(nums)`** — the canonical two-variable DP:
   - `prev2 = dp[i-2]`, `prev1 = dp[i-1]`.
   - For each `nums[i]`, `next = max(prev1, prev2 + nums[i])`.
   - Slide the pair forward. Return `prev1` at the end.
   - Handles the three base cases: empty array → 0, single
     element → `nums[0]`, two elements → `max(nums[0], nums[1])`.
2. **Driver** — runs the solver on seven cases including the
   LeetCode headline pair, then asserts seven sub-results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/house_robber.ae
```

## Key language features

- **`let mut next = take; if skip > take { next = skip; };`** —
  Aether's way of writing `next = max(take, skip)` without the
  builtin, so the algorithm reads like pseudocode and the JIT
  can inline the comparison.
- **`while i < len(nums)` loop** — sidesteps the for-loop-scope
  quirk.
- **`reduce` to render the input array** as `1, 2, 3, 1` for
  the output.
- **`let mut prev1`** for the rolling accumulator (immutable
  `let` would fail at `prev1 = nums[1]`).

## Expected output

```
== House robber ==

  [1, 2, 3, 1]  ->  4
  [2, 7, 9, 3, 1]  ->  12
  [2, 1, 1, 2]  ->  4
  [5, 5, 10, 100, 10, 5]  ->  110
  [10]  ->  10
  []  ->  0
  [1, 2, 3, 4, 5, 6, 7, 8]  ->  20

Headline: rob([1,2,3,1]) = 4

All assertions passed.
```

## Design notes

- The two-element base case sets `prev1 = max(nums[0], nums[1])`
  before the loop starts at `i = 2`.
- The recurrence `dp[i] = max(dp[i-1], dp[i-2] + nums[i])` is
  classic; the rolling pair is the O(1)-space form.
- For `[5, 5, 10, 100, 10, 5]` the optimal is `5 + 10 + 100 + 5
  = ...`? Actually the answer is `5 + 100 + 5 = 110` (rob house
  0, house 3, house 5), which matches.
- Fully clean compile (`ok = true`).
