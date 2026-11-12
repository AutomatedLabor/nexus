# interpolation_search.ae

A demo of interpolation search — a variant of binary search that probes by linear interpolation rather than always at the midpoint. On uniformly distributed sorted data, it finds the target in O(log log n) iterations on average, which is sub-logarithmic.

## What it does

Interpolation search maintains a range `[lo, hi]` like binary search, but estimates the probe position by assuming the array values are linearly distributed:

```
pos = lo + (target - arr[lo]) * (hi - lo) / (arr[hi] - arr[lo])
```

This is the same formula as linear interpolation in elementary math: if `arr` were a straight line from `(lo, arr[lo])` to `(hi, arr[hi])`, the `x` value where the line hits `y = target` is `pos`. The algorithm then checks `arr[pos]` and recurses on the appropriate half.

The demo searches for 50 in the uniformly distributed array `[10, 20, 30, 40, 50, 60, 70, 80, 90, 100]`. The first probe lands exactly at index 4 (the answer), so the search terminates in one step. For comparison, binary search would have taken 3-4 steps on the same input.

## Complexity

- **Average time:** O(log log n) — the probe sequence converges to the target doubly-logarithmically on uniformly distributed data.
- **Worst-case time:** O(n) — when the data is highly skewed (e.g. exponentially distributed), the probe can advance by only one position per iteration.
- **Space:** O(1).

## Why it's interesting

Interpolation search is the "smarter than binary search" example that comes up in every algorithms textbook. It's a great teaching tool because:

1. The probe formula is just the linear-interpolation formula from high school math.
2. The average-case complexity (O(log log n)) is asymptotically faster than binary search (O(log n)) — the only commonly-taught algorithm with this property.
3. The worst case (O(n)) shows that "smarter" isn't always better — you have to know your data distribution.

In practice, interpolation search is used in database indexes on numeric columns where the data is known to be approximately uniform (e.g. timestamps, sequential IDs).

## Output

```
== Interpolation search demo ==

arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
target = 50
index = 4

probing several targets:
  arr[0] = 10 -> index 0
  arr[1] = 20 -> index 1
  arr[2] = 30 -> index 2
  ...
  arr[9] = 100 -> index 9
55 (missing) -> -1

Interpolation search complete.
```

## Notes

- The `target >= arr[lo] && target <= arr[hi]` guard is essential: it prevents `num / den` from producing out-of-range probes when the target isn't in the array at all.
- The `pos < lo` and `pos > hi` clamps are defensive: even with the range guard, integer truncation can occasionally produce a `pos` outside `[lo, hi]`.
- For the production-grade version, see `aether-algorithms.interpolationSearch`.
