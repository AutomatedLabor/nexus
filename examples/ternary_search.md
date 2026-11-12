# ternary_search.ae

A demo of ternary search — find the integer `x` in a closed interval `[lo, hi]` that maximizes a unimodal function `f` (strictly increasing then strictly decreasing). The example uses `f(x) = -(x - 5)^2`, which has its maximum at `x = 5`, and searches the interval `[0, 10]`.

## What it does

Ternary search maintains a range `[l, r]` of candidate `x` values. At each step it splits the range into thirds at `m1 = l + (r - l) / 3` and `m2 = r - (r - l) / 3`, and evaluates `f` at both:

- If `f(m1) < f(m2)`, the maximum is in `(m1, r]` (because `f` is increasing past `m1`). Set `l = m1 + 1`.
- Else the maximum is in `[l, m2)`. Set `r = m2 - 1`.

When the range narrows to `r - l <= 2`, the loop exits and a linear scan over the small remaining range picks the exact argmax.

## Complexity

- **Time:** O(log n) on the interval length, where each iteration reduces the range by a factor of 2/3.
- **Space:** O(1).

Ternary search is the canonical "find the maximum of a unimodal function" technique. It's the discrete analogue of the golden-section search on continuous functions. The convergence rate (log_{1.5} n) is slightly slower than binary search (log_2 n) because each iteration reduces the range by 2/3 instead of 1/2, but the comparison count per iteration is the same (two function evaluations).

## Why it's interesting

Many optimization problems have a unimodal structure: minimize `(x - a)^2 + (x - b)^2` (which has its minimum at `(a + b) / 2`), find the peak of a histogram, or locate the apex of a parabolic arc. Ternary search gives a logarithmic-time solution without requiring the function to be differentiable.

The demo also runs a second search with `g(x) = -(x - 8)^2` over `[0, 20]` to show that the algorithm generalizes to any unimodal function over any range.

## Output

```
== Ternary search demo ==

f(x) = -(x - 5)^2  (max at x = 5)
search interval = [0, 10]
argmax = 5
f(argmax) = 0

g(x) = -(x - 8)^2  (max at x = 8)
search interval = [0, 20]
argmax = 8

Ternary search complete.
```

## Notes

- The implementation uses `while` with explicit `l`, `r`, `best_x`, `best_v` variables.
- The final linear scan over the 3-element remaining range guarantees exact argmax (not approximate).
- For the production-grade version, see the `aether-algorithms.ternarySearch` function.
