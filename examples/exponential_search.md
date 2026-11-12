# exponential_search.ae

A demo of exponential search (also called "galloping search") — find a target in a sorted array by exponentially expanding the search range (1, 2, 4, 8, ...) until the boundary contains the target, then binary-searching the small identified range. The demo searches for 47 in a sorted array of 50 elements.

## What it does

Exponential search works in two phases:

1. **Galloping phase.** Start at `i = 1` and double `i` while `arr[i] <= target` and `i < n`. This finds the smallest power of 2 such that `arr[i] > target` (or `i >= n`), which means the target — if it exists — lies in the half-open range `[i/2, min(i, n - 1)]`.
2. **Binary search phase.** Binary search the small range `[i/2, min(i, n - 1)]` for the target.

For target 47 in the demo array, the galloping phase visits `i = 1, 2, 4, 8, 16, 32`, where `arr[32] = 65 > 47` stops the loop. The binary search then runs over `[16, 32]` and finds 47 at index 23.

## Complexity

- **Time:** O(log i) where `i` is the index of the target. If the target is near the start, this is much faster than binary search (which is always O(log n) regardless of where the target is). If the target is near the end, both are O(log n).
- **Space:** O(1).

## Why it's interesting

Exponential search shines when the array is *unbounded* — e.g. a stream of sorted data where you don't know the length in advance. The galloping phase naturally stops when it either passes the target or hits the end; you don't need a precomputed `n`. Even on bounded arrays, exponential search is asymptotically better than binary search when the target is at a small index.

The algorithm also shows up in the merge step of Timsort (Python's sort), where it's used to find the position of one sorted run's first element in another sorted run — the "galloping mode" that kicks in when one side is consistently producing smaller elements.

## Output

```
== Exponential search demo ==

arr has 50 elements (odd numbers 1..99)
target = 47
index = 23

early target (close to start, O(log i) fast):
  target 7  -> index 3
late target (still O(log n) because expansion stops at n):
  target 97 -> index 48
  target 100 (missing) -> -1

Exponential search complete.
```

## Notes

- The galloping phase uses `i = i * 2`, which is equivalent to `i << 1` but doesn't require the bit-shift operator.
- The `hi = min(i, n - 1)` clamp handles the case where `i` overshoots `n`.
- For the production-grade version, see `aether-algorithms.exponentialSearch`.
