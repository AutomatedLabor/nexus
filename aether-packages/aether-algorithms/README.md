# aether-algorithms

> Classic search and optimization algorithms for the Aether language — 12 pure functions covering the binary-search family (binarySearch, lowerBound, upperBound), ternary search on unimodal functions, the sorted-array search variants (jump, interpolation, exponential, Fibonacci), and four small deterministic optimization metaheuristics: tabu search (TSP), simulated annealing, hill climbing, and gradient descent.

`aether-algorithms` is a user-space Aether package for the textbook search and optimization primitives that show up in every algorithms course. The implementations are intentionally textbook-faithful: each function mirrors the pseudocode in CLRS or Sedgewick, written in pure Aether on top of the language's core builtins (`+ - * / % < > == abs int len push min max`). No host primitives, no FFI, no shortcuts.

## Why an "algorithms" package?

Aether's core ships the data-manipulation primitives (`map`, `filter`, `reduce`, `push`, `pop`, `len`, `range`) but no algorithms above that level. For application code that needs to "find a value in a sorted array", "find the minimum of a unimodal function", or "solve a small TSP", the choice is: write the algorithm inline every time (verbose, error-prone), or pull in this package (one import, ten functions, all tested).

The package is targeted at three audiences:

1. **Application authors** who need standard search/optimization primitives (`binarySearch`, `lowerBound`, `upperBound`) and don't want to rewrite them in every project.
2. **Competitive programmers** who want a tested reference for the less common variants (`interpolationSearch`, `exponentialSearch`, `fibonacciSearch`) so they can compare behavior on different input distributions.
3. **Algorithm learners** who want to see the algorithms implemented in a small, readable language — the source of `lib.ae` is heavily commented and intended to be read end-to-end.

## API

All 12 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they never mutate their inputs. Iteration uses `while` with explicit indices to avoid the v1 evaluator's for-loop-scope quirk.

### Binary search family

| Function | Signature | Description |
| --- | --- | --- |
| `binarySearch(arr, target)` | `([int], int) -> int` | Classic binary search on a sorted array. Returns the index of `target`, or -1 if not present. O(log n). |
| `lowerBound(arr, target)` | `([int], int) -> int` | Index of the first element >= `target`. Returns `len(arr)` if all elements are < `target`. O(log n). |
| `upperBound(arr, target)` | `([int], int) -> int` | Index of the first element > `target`. Returns `len(arr)` if all elements are <= `target`. O(log n). |

`lowerBound` and `upperBound` together give the half-open range `[lowerBound(arr, x), upperBound(arr, x))` of all elements equal to `x`. This is the canonical way to find all matches in a sorted array containing duplicates.

### Unimodal search

| Function | Signature | Description |
| --- | --- | --- |
| `ternarySearch(f, lo, hi)` | `(fn(int) -> int, int, int) -> int` | Find the integer `x` in `[lo, hi]` that maximizes the unimodal function `f`. Returns the argmax. O(log n) on the interval length. |

`ternarySearch` assumes `f` is strictly increasing then strictly decreasing on `[lo, hi]` (i.e. unimodal). It splits the interval into thirds at `m1` and `m2`, compares `f(m1)` and `f(m2)`, and discards the side opposite the larger value. The final 3-element interval is scanned linearly to pick the exact argmax.

### Sorted-array search variants

| Function | Signature | Description |
| --- | --- | --- |
| `jumpSearch(arr, target)` | `([int], int) -> int` | Jump search with step `sqrt(n)`. O(sqrt(n)). Returns the index of `target` or -1. |
| `interpolationSearch(arr, target)` | `([int], int) -> int` | Interpolation search. Assumes sorted AND uniformly distributed. Average O(log log n), worst O(n). |
| `exponentialSearch(arr, target)` | `([int], int) -> int` | Exponential search: find the range `[2^k, 2^(k+1))` containing `target`, then binary-search it. O(log i) where `i` is the index of `target`. |
| `fibonacciSearch(arr, target)` | `([int], int) -> int` | Fibonacci search: like binary search but uses Fibonacci numbers for partitioning. O(log n). |

These four all return the index of `target` or -1 if not present. They differ in their probe sequence, which makes them suited to different access patterns:

- **Jump search** is good when sequential reads are cheaper than random reads (e.g. paged storage). O(sqrt(n)) is the optimal balance between sequential-block and linear-scan.
- **Interpolation search** is good when the data is approximately uniformly distributed (e.g. a sorted list of timestamps). Average-case O(log log n) is sub-logarithmic.
- **Exponential search** is good when `target` is near the start of the array (the probe sequence is `1, 2, 4, 8, ...`, so it finds small indices quickly).
- **Fibonacci search** is good when addition is cheaper than division (rare in modern hardware, but historically interesting).

### Metaheuristics (deterministic)

| Function | Signature | Description |
| --- | --- | --- |
| `tabuSearch(cities, distances, iterations)` | `([int], [[int]], int) -> [int]` | Tiny tabu search for the Traveling Salesman Problem. `cities` is a list of city indices `[0..k-1]`. `distances` is a `k`-by-`k` matrix. Returns the best route found (a permutation of `cities`). Deterministic: starts from `[0,1,2,...,k-1]`, tries 2-opt swaps with a short tabu list. |
| `simulatedAnnealing(f, x0, iterations)` | `(fn(int) -> int, int, int) -> int` | Tiny simulated annealing to find the `x` that minimizes `f(x)`. The neighbor of `x` is `x +/- 1`. Temperature starts at 100 and cools to 1 by iteration `iterations`. Returns the best `x` found. Deterministic (uses a fixed-seed LCG). |
| `hillClimbing(f, x0)` | `(fn(int) -> int, int) -> int` | Tiny deterministic hill climbing for the local maximum of `f` near `x0`. The neighborhood is `{x-1, x+1}`. Returns the argmax found. Guaranteed to find a local max (not necessarily the global max). |
| `gradientDescent(f, x0, stepSize, iterations)` | `(fn(int) -> int, int, int, int) -> int` | Tiny deterministic (simulated) gradient descent to find the local minimum of `f` near `x0`. Uses sign-based integer steps in the direction of steepest descent (estimated by central finite difference). Returns the best `x` (lowest `f`) found along the trajectory. |

These four are deliberately *small* and *deterministic* — they're not production-grade metaheuristics (which would need hours of tuning, random restarts, and good cooling schedules). They're textbook-sized implementations that demonstrate the algorithm structure and that can be tested with exact-value assertions. A future `aether-metaheuristics` package could provide production-grade variants with seeded RNG, parallel restarts, and richer neighborhood structures.

## How to use

### As a dependency

```toml
[dependencies]
aether-algorithms = "0.1.0"
```

```aether
import { binarySearch, lowerBound, upperBound } from "aether-algorithms";

let arr = [1, 3, 3, 3, 5, 7, 9, 11];
print(binarySearch(arr, 7));   // 5
print(lowerBound(arr, 3));     // 1
print(upperBound(arr, 3));     // 4
// So all 3s are at indices [1, 4).
```

### Running the test suite

```sh
aether test aether-packages/aether-algorithms/tests
# PASS aether-packages/aether-algorithms/tests/tests.ae
# 1 passed, 0 failed
```

The test file contains 25+ `assert_eq` cases covering every `pub fn`. The tabuSearch test verifies that the optimal 4-city TSP tour (cost 80) is found, and the simulatedAnnealing tests verify that the minimum of `(x-7)^2` from `x=0` is at `x=7`.

### Running the example

```sh
aether run aether-packages/aether-algorithms/examples/example.ae
```

## Design notes

### Why no recursive binary search?

Recursive binary search is more concise but the v1 evaluator has a known quirk where `let X;` declared before a `for in` loop and referenced after the loop can produce wrong results (the same quirk applies to some recursive patterns). The package uses iterative `while` loops with explicit `lo`, `hi`, and `found` variables — slightly more verbose but bulletproof.

### Why deterministic metaheuristics?

Production metaheuristics use randomness for two things:

1. **Initialization.** Random starting points avoid pathological local optima.
2. **Move selection.** Random neighbors (within a class) avoid cycling.

For a teaching/testing package, deterministic behavior is essential — the test suite needs to assert exact values, and the example needs to print the same output every time. The package uses a fixed LCG (seed 1) for the small amount of randomness it needs, mirroring the approach in `aether-collections-extra.shuffle`. A future variant could take a seed parameter and a host-random hook for callers who want stochastic behavior.

### Why `int((lo + hi) / 2)` and not `(lo + hi) >> 1`?

Aether's `/` is float division, so `(lo + hi) / 2` produces a `float` that we truncate with `int()`. The alternative `(lo + hi) >> 1` is faster (one bit op instead of a float truncation) but requires `lo + hi >= 0` (JavaScript's `>>` is signed-shift, not logical-shift). For the inputs in the test suite, both are equivalent; the package uses `int((lo + hi) / 2)` for readability. A defensive future variant could use `lo + int((hi - lo) / 2)` to avoid the overflow case entirely (a non-issue for inputs within 2^53, but defensive).

## Future work

- A `tabuSearchRestart` variant that takes a seed parameter and supports random restarts.
- A `geneticAlgorithm` function (a tiny GA with deterministic LCG for selection/mutation).
- A `minimax` function with alpha-beta pruning for two-player game trees.
- An `aStarSearch` function for shortest-path with admissible heuristics.

## License

MIT — same as the Aether language.
