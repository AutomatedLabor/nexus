# Aether stdlib — `sort-extra`

The `sort-extra` module is the second sorting suite: 10 algorithms that go beyond the basic `sort` module. Where `sort` covers the textbook comparison sorts (bubble, insertion, selection, merge, quick, heap, shell, cocktail, comb, gnome) and the non-comparison sorts (counting, radix, bucket), `sort-extra` covers the more interesting or exotic sorts that show up in algorithms courses and CS trivia — and a few that are genuinely useful.

## What's here

| Function | Family | Complexity | Notes |
|---|---|---|---|
| `sortTim` | hybrid merge + insertion | O(n log n) | real-world Python/Java sort |
| `sortIntro` | quick + heap fallback | O(n log n) | C++ `std::sort` algorithm |
| `sortBitonic` | parallel network | O(n log² n) | requires power-of-2 length (pads) |
| `sortPancake` | prefix reversals | O(n²) | famous pancake-flipping problem |
| `sortStooge` | recursive thirds | O(n^2.71) | a joke sort that still sorts |
| `sortBogo` | randomised, capped | O(n!) avg | terminates via cap → merge fallback |
| `sortSleep` | simulated by grouping | O(n²) | the sleep-sort idea, no threads |
| `sortSmooth` | Leonardo heaps | O(n log n) worst, O(n) best | Dijkstra's sort |
| `sortCycle` | minimum writes | O(n²) | each element written exactly once |
| `sortLibrary` | gapped insertion | O(n log n) avg | like librarians shelving books |

Plus an `isSorted` oracle (the same one shipped in `sort`, re-exported here for convenience).

## Conventions

- **Every sort returns a new array.** The input is never mutated.
- **Default comparator: ascending numeric.** Pass your own `cmp(a, b) => number` for other orders.
- **Comparison sorts are total**: they work on any array of comparable values, including strings and tuples, as long as your `cmp` can compare them.
- **Stability**: `sortTim` is stable (it inherits merge sort's stability). The others are not guaranteed stable.
- **Errors are panics** — invalid input (non-array) throws a plain `Error` that the evaluator surfaces as an Aether panic.

## The functions

### `sortTim(arr, cmp?)` — O(n log n)

Tim sort is the hybrid merge + insertion sort that powers Python's `sorted()` and Java's `Arrays.sort()` for objects. We sort small runs of length ~32 with insertion sort (low constant factor, near-linear on short runs), then bottom-up merge them. This is the realistic "use this one in production" sort — fast on real data, stable, O(n log n) worst case, O(n) on already-sorted input. Reach for it when you want the same algorithm Python uses.

### `sortIntro(arr, cmp?)` — O(n log n)

Introsort (intro sort) is the algorithm behind C++ `std::sort`: quicksort with median-of-three pivots, falling back to heap sort when the recursion depth exceeds `2 log₂ n`. The fallback guarantees O(n log n) worst-case even on pathological inputs (sorted, reverse-sorted, many duplicates) that would degenerate naive quicksort to O(n²). Reach for it when you want quicksort's average speed with a worst-case guarantee.

### `sortBitonic(arr, cmp?)` — O(n log² n)

Bitonic sort is a parallel sorting network — it sorts by comparing elements at fixed positions determined by a bitonic-merge network. The classical algorithm requires a power-of-2 length; we pad to the next power of 2 with the comparator-maximum (which bubbles to the end and is sliced off), so any-length input works. The big advantage of bitonic sort is parallelism: every comparison in a pass is independent, so it can be implemented with O(log² n) depth on a parallel machine. Reach for it when you're teaching parallel algorithms or want a sort with predictable compare patterns.

### `sortPancake(arr, cmp?)` — O(n²)

Pancake sort is the famous "pancake flipping" problem: you can only reverse prefixes of the array. The algorithm finds the largest unsorted element, flips it to the front, then flips it to its final position. Repeat for the rest. O(n²) but with at most 2n − 3 flips. Reach for it for teaching or for problems where the only allowed operation is prefix reversal (yes, this comes up in genomics).

### `sortStooge(arr, cmp?)` — O(n^2.71)

Stooge sort is the canonical "exotic" sort: sort the first 2/3, then the last 2/3, then the first 2/3 again. Recurrence T(n) = 3 T(2n/3), giving O(n^log_{1.5} 3) ≈ O(n^2.71). Inefficient but correct — every comparison-based sort has the same lower bound of O(n log n), so stooge sort is a teaching example of how NOT to recurse. Reach for it for amusement or for an algorithms-trivia answer.

### `sortBogo(arr, cmp?, maxIter?)` — O(n!) avg

Bogosort is the joke sort: randomly permute the array until it's sorted. The expected number of iterations is n! (factorial in the array length), so this is exponentially slow — a 10-element array takes ~3.6M iterations on average. We cap the iteration count to `maxIter` (default 1000) to guarantee termination; if the cap is hit without sorting, we fall back to a deterministic merge sort so the function always returns a correctly sorted array. The cap means you can safely call `sortBogo` from user code without hanging the evaluator. Reach for it for demos, jokes, or for testing the runtime's randomisation primitives.

### `sortSleep(arr, cmp?)` — O(n²) simulated

"Sleep sort" is the joke that became a teaching example: spawn one timer per element, where each timer's delay is the element's value; the timers fire in sorted order. Aether doesn't expose threads, so we simulate the behaviour by grouping elements by key (using `cmp`-equality), sorting the distinct keys, then emitting the groups in key order. The result is identical to a stable bucket sort. Reach for it when you want to demonstrate the sleep-sort idea without actual concurrency.

### `sortSmooth(arr, cmp?)` — O(n log n) worst, O(n) best

Smooth sort is Dijkstra's Leonardo-heap-based sort. It maintains a forest of Leonardo heaps (each of size L(k), where L is the Leonardo number sequence 1, 1, 3, 5, 9, 15, ...). Build phase extends the forest; shrink phase removes roots one at a time, splitting Leonardo heaps back into their two sub-heaps. Best-case O(n) on already-sorted input (no swaps needed in the build phase), worst-case O(n log n). Our implementation uses a simplified single-pass sift; the algorithm's full trampolined version is intricate and we don't ship the galloping optimisation. Reach for it when you want an O(n) best case (e.g., when you mostly sort nearly-sorted input) or for an algorithms-course reference.

### `sortCycle(arr, cmp?)` — O(n²)

Cycle sort is the minimum-write sort: every element is written exactly once to its final position. The algorithm walks the array, and for each unsorted element, counts how many elements are smaller to find its target position, then rotates the cycle until it returns to the start. Historically useful for write-once media (EPROMs, write-once tapes) where minimising writes matters more than minimising time. Reach for it when write count is the constraint — flash memory, optical media, etc. Not stable.

### `sortLibrary(arr, cmp?)` — O(n log n) avg

Library sort (a.k.a. gapped insertion sort) is insertion sort with gaps — like librarians shelving books with spaces for new arrivals. Each insertion uses binary search to find the position, then shifts elements into the gap rather than the whole tail. Average case O(n log n), worst case O(n²). Our implementation uses a 2n-sized buffer with binary-search-based insertion and a defensive final sort when the buffer fills up — the spec (always return a sorted array) is preserved. Reach for it when your data is mostly sorted with occasional insertions.

### `isSorted(arr, cmp?)` — O(n)

`isSorted` returns true when the array is in sorted order according to `cmp`. Useful as a property-test oracle and as a runtime sanity check. Same semantics as the `isSorted` re-exported from the `sort` module.

## Choosing a sort

| Use case | Recommendation |
|----------|----------------|
| Production sort, stable, fast on real data | `sortTim` |
| Production sort, no stability requirement, worst-case guarantee | `sortIntro` |
| Nearly-sorted input, want O(n) best case | `sortSmooth` |
| Teaching parallelism | `sortBitonic` |
| Minimum writes (write-once media) | `sortCycle` |
| Mostly-sorted with occasional insertions | `sortLibrary` |
| Jokes / demos / algorithms trivia | `sortBogo`, `sortPancake`, `sortStooge`, `sortSleep` |

## What's NOT here

- **Parallel sorts in the runtime sense**: Aether doesn't expose threads, so `sortBitonic` runs sequentially. The compare pattern is parallel; the execution isn't.
- **External sort**: out of scope for stdlib.
- **Topological sort**: see `graph.graphTopoSort` in the `graph` module.

The whole module is 10 functions, ~450 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
