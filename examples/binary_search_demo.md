# binary_search_demo.ae

A from-scratch demo of the classic binary-search algorithm. Searches for the value 7 in the sorted array `[1, 3, 5, 7, 9, 11, 13]` and prints the index where it's found (3 in this case), along with a few negative and boundary cases.

## What it does

Binary search maintains a half-open range `[lo, hi]` of candidate positions in the array. At each step it looks at the middle element:

- If it equals the target, return the middle index.
- If it's less than the target, the target must be in the upper half — advance `lo` past the middle.
- If it's greater, the target must be in the lower half — pull back `hi` before the middle.

The loop terminates when `lo > hi`, which means the target isn't in the array (the function returns -1 in that case).

## Complexity

- **Time:** O(log n) — each iteration halves the search range.
- **Space:** O(1) — only `lo`, `hi`, `m`, `found` are kept live.

## Why it's interesting

Binary search is the canonical example of a "divide-and-conquer in the iterator pattern" algorithm. Unlike quicksort (which divides the data and recurses), binary search divides the *search space* and iterates. The simplicity of the loop — five lines of body — makes it a great first read for someone learning the pattern.

The demo also includes a few boundary cases (first element, last element, missing element) to show that the loop termination condition `lo <= hi` is correct on both ends.

## Output

```
== Binary search demo ==

arr = [1, 3, 5, 7, 9, 11, 13]
target = 7
index = 3
index of 8 (missing) = -1
index of 1 (first)   = 0
index of 13 (last)   = 6

Binary search complete.
```

## Notes

- The implementation uses `while` with explicit `lo`/`hi`/`found` variables, defensively avoiding the v1 evaluator's for-loop-scope quirk.
- `int((lo + hi) / 2)` truncates the float result of `/` to an integer (Aether's `/` is float division).
- For the production-grade version with `lowerBound` / `upperBound` / `ternarySearch` etc., see the `aether-algorithms` package.
