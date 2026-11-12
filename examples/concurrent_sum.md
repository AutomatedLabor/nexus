# concurrent_sum.ae

Compute the sum of 1..1000 using a divide-and-conquer recursion.
The problem is split in half at each level: `sum_range(lo, hi) =
sum_range(lo, mid) + sum_range(mid+1, hi)`, with a base case when
`lo == hi`. This is the same shape as a fork/join parallel sum —
the work at each level could be dispatched to separate workers.

## What it does

1. **`sum_range(lo, hi)`** — recursive divide-and-conquer. Base
   case: `lo == hi` returns `lo`. Recursive case: split in half
   and add the two halves.
2. **Driver** — runs `sum_range(1, 1000)` and asserts the result
   is 500500 (the closed form N(N+1)/2 for N=1000).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/concurrent_sum.ae
```

## Key language features

- **Recursion** for the divide-and-conquer shape; no loops needed.
- **`int(a / b)`** for integer division — Aether's `/` is float
  division, so we use the `int` builtin to truncate to integer.
- **`assert_eq`** for sanity checks against the closed form.

## Why this matters

The recursion tree has depth O(log n). Each level does O(1)
work for the addition and O(1) for the recursive descent, so
the whole sum is O(n) total work but with a "wide" shape that
parallelises trivially: at each level, the two recursive calls
are independent and could be dispatched to separate worker
threads (Rayon, TBB, OpenMP tasks, etc.).

The sequential version still computes the right answer; the
parallelism is a property of the recursion shape, not the
implementation. A real parallel runtime would dispatch the two
calls on separate cores and join on the addition.

## Expected output

```
== Concurrent sum 1..1000 via divide-and-conquer ==

sum 1..1000 = 500500
(expected: 500500)

Smaller cases:
sum 1..10  = 55 (expected 55)
sum 1..100 = 5050 (expected 5050)

All assertions passed.
```

## Design notes

- We use `int((hi - lo) / 2)` for the midpoint to avoid floating
  point — `hi - lo` is even-safe with this formula. A more
  careful implementation would use `(hi - lo) >> 1` if Aether
  had a bitwise-shift builtin.
- The base case is `lo == hi` (single-element range). An
  alternative is `hi - lo == 1` (two-element range), which
  shaves one level of recursion but doesn't change the
  asymptotic shape.
