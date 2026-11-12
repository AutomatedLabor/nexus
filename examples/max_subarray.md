# max_subarray.ae

Maximum subarray sum (Kadane's algorithm): given an array of
integers, find the contiguous subarray with the largest sum.

## What it does

1. **`max_subarray(arr)`** — Kadane's algorithm in one pass:
   - Track `cur` — the best sum ending at the current position.
   - Track `best` — the global best.
   - For each element `x`, the new `cur` is `max(x, cur + x)`;
     the new `best` is `max(best, cur)`.
   - Return `best` at the end. Empty arrays return 0.
2. **Driver** — runs the solver on six cases including the
   classic LeetCode example and a couple of all-negative
   cases, then asserts eight sub-results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/max_subarray.ae
```

## Key language features

- **`if cur + x > x` then `cur = cur + x` else `cur = x`** — the
  Aether translation of `cur = max(x, cur + x)`. We use the explicit
  `if` rather than the `max` builtin so the algorithm is fully
  inlined (and the JIT, when applied, can specialize the branch).
- **`while i < len(arr)` loop** — sidesteps the for-loop-scope
  quirk in the v1 evaluator.
- **`reduce` to render the array** as `"-2, 1, -3, 4, ..."` for
  the output.

## Expected output

```
== Maximum subarray (Kadane) ==

  [-2, 1, -3, 4, -1, 2, 1, -5, 4]  ->  6
  [1]  ->  1
  [-1, -2, -3]  ->  -1
  [5, 4, -1, 7, 8]  ->  23
  [1, 2, 3, 4, 5]  ->  15
  [-2, -1]  ->  -1

Headline: max_subarray([-2,1,-3,4,-1,2,1,-5,4]) = 6

All assertions passed.
```

## Design notes

- The empty-array case returns 0 (a defensible default —
  equivalent to the sum of the empty subarray).
- The all-negative case returns the largest single element,
  because `cur = max(x, cur + x)` always resets to `x` when
  `cur` is negative.
- Kadane's is one of the classic algorithms that's easy to
  JIT-compile: the inner loop is straight-line arithmetic with
  two comparisons. The v3.1 JIT should specialize this down to
  a tight JS `while` loop with no dispatch overhead.
- This is a fully clean compile (`ok = true`).
