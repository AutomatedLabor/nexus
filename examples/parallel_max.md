# parallel_max.ae

Find the maximum of an array via a tournament recursion: split
the array in half, find the max of each half recursively, and
return the larger of the two. This is the same shape that a
parallel max would use — at each level the two halves could be
computed in parallel.

## What it does

1. **`max2(a, b)`** — return the larger of two ints.
2. **`slice_arr(xs, lo, hi)`** — slice an array manually (the
   Aether builtin `strSlice` is for strings; for arrays we
   build a fresh list element by element).
3. **`max_range(xs, lo, hi)`** — recursive tournament max over
   the half-open subarray `xs[lo..hi)`.
4. **`tmax(xs)`** — entry point: `max_range(xs, 0, len(xs))`.
5. **Driver** — runs `tmax` on `[3, 7, 2, 9, 4, 8, 1, 5]` and
   several edge cases (single, two, negatives).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/parallel_max.ae
```

## Key language features

- **Recursion** for the tournament shape.
- **`while` loops** for the array slicing (sidesteps the
  for-loop-scope quirk in v1).
- **`int(...)`** for integer division in the midpoint.
- **`push`** to build the slice output incrementally.

## Why a tournament?

A linear scan (`for x in xs: m = max(m, x)`) is also O(n) and
simpler — but it's strictly sequential. The tournament shape
makes the parallelism explicit: at each level, the two
sub-tournaments are independent and could run on separate cores.

The "parallel" in the name refers to this shape, not to actual
parallelism in the Aether runtime. The sequential Aether code
runs the tournament depth-first, which is the same total work
as the linear scan (n - 1 comparisons).

## Expected output

```
== Parallel max via tournament recursion ==

array: [3, 7, 2, 9, 4, 8, 1, 5]
max = 9 (expected 9)

single element: 42 (expected 42)
two elements: 99 (expected 99)
two elements descending: 99 (expected 99)
negatives: -1 (expected -1)

All assertions passed.
```

## Design notes

- The `max_range` function takes `lo` and `hi` indices rather
  than slicing the array — avoids the O(n) cost of building a
  fresh slice at each level. The total work is exactly n - 1
  comparisons.
- Edge cases: a single-element array returns that element
  without further recursion; an empty array panics in
  `max_range` when `hi - lo == 1` is the base case and `hi`
  starts at 0.
