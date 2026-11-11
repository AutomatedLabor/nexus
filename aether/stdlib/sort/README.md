# Aether stdlib — `sort`

The `sort` module is a teaching-grade sorting suite: 14 algorithms plus an `isSorted` oracle. Every `sortXxx(arr, cmp?)` function returns a NEW sorted array — the input is never mutated. The default comparator is ascending numeric. All functions are pure TypeScript; throwing an `Error` from a builtin surfaces as an Aether panic.

## Why 14 sorts?

There is no "best" sort. Different sorts win on different shapes of data: insertion sort is fastest on nearly-sorted input, merge sort is stable and predictable, quick sort has the best cache behaviour on random data, counting and radix sorts can run in O(n) when the keys are small integers, shell sort beats quick sort on small-to-medium real data, cocktail sort handles the "small element near the end" case better than bubble, comb sort is bubble sort with a wider view that escapes the O(n²) trap. We ship all 14 so you can pick the right tool, and so that the suite is a complete teaching reference for an algorithms course. (We deliberately omit the pathological sorts — bogosort is in `examples/bogosort.ae` instead.)

## Conventions

- **Every sort returns a new array.** The input is never mutated. If you want an in-place sort, you can write `let a = arr; a = sort.sortQuick(a)` (or just call the function and rebind).
- **Default comparator: ascending numeric**. Pass your own `cmp(a, b) => number` (negative when `a < b`, zero on equality, positive when `a > b`) for other orders.
- **Comparison sorts are total**: they work on any array of comparable values, including strings and tuples, as long as your `cmp` can compare them.
- **Non-comparison sorts (`sortCounting`, `sortRadix`, `sortBucket`) require numbers** — they panic on non-integer or out-of-range input.
- **Stability**: `sortBubble`, `sortInsertion`, `sortMerge`, and `sortStable` (alias for `sortMerge`) are stable — equal elements retain their input order. The others are not guaranteed stable.

## Comparison sorts

### `sortBubble(arr, cmp?)` — O(n²)

Bubble sort walks the array swapping adjacent out-of-order pairs until no swap occurs in a pass. Stable, in-place (well, on a copy). The "early stop when no swap" optimisation makes it O(n) on already-sorted input — still O(n²) worst case. Reach for it as a baseline or when you genuinely expect the array to be nearly sorted.

### `sortInsertion(arr, cmp?)` — O(n²)

Insertion sort pulls each element from right to left into its proper place. Stable, in-place. O(n) on nearly-sorted input, O(n²) worst case. The fastest of the O(n²) sorts in practice because the inner loop has very low constant factors. Reach for it on arrays up to ~50 elements.

### `sortSelection(arr, cmp?)` — O(n²)

Selection sort finds the minimum of the unsorted portion and swaps it to the front. NOT stable (a swap can move an equal element past a later one). Always O(n²) — there is no "early stop" because you have to scan the rest to confirm minimum. Reach for it when swaps are cheap and comparisons are expensive (it minimises comparisons in some formulations).

### `sortMerge(arr, cmp?)` — O(n log n)

Merge sort splits the array in halves, recursively sorts each, then merges the two sorted halves. **Stable**. Implemented iteratively (bottom-up) to avoid recursion-stack issues on long arrays. The textbook "always O(n log n)" sort. Reach for it when you need guaranteed performance and stability.

### `sortQuick(arr, cmp?)` — O(n log n) avg

Quick sort uses a pivot to partition the array, recursively sorts each partition. Uses Lomuto partition with **median-of-three** pivot (median of the first, middle, last elements) to avoid the O(n²) trap on already-sorted input. Implemented iteratively with an explicit stack. NOT stable. Reach for it when you want the best average-case performance and don't need stability.

### `sortHeap(arr, cmp?)` — O(n log n)

Heap sort builds a max-heap from the array, then repeatedly swaps the root (the max) with the last unsorted element and re-heapifies. In-place. NOT stable. The textbook "always O(n log n) AND in-place" sort — but the constant factors are larger than quick sort's. Reach for it when memory is constrained and you need guaranteed O(n log n).

### `sortShell(arr, cmp?)` — O(n^1.3) typical

Shell sort is insertion sort with diminishing gaps: do insertion sort at gap n/2, then n/4, ..., then 1. The early passes "move elements close to their final position" cheaply. NOT stable. The exact complexity depends on the gap sequence; we use the simple halving sequence. Reach for it on medium arrays where the simplicity of insertion sort plus the speedup of multiple passes is a sweet spot.

### `sortCocktail(arr, cmp?)` — O(n²)

Cocktail (a.k.a. shaker) sort is bidirectional bubble: pass left-to-right, then right-to-left, alternately. Handles the "turtle at the end" case (a small element near the end of an otherwise-sorted array) better than bubble. Stable.

### `sortComb(arr, cmp?)` — O(n log n) typical

Comb sort is bubble sort with a gap > 1: compare and swap elements `gap` apart, shrinking `gap` by 1.3 each pass until gap = 1 (a final bubble pass). The wider initial gaps destroy small "turtles" quickly, escaping the O(n²) trap of pure bubble. NOT stable.

### `sortGnome(arr, cmp?)` — O(n²)

Gnome sort is the "walking gnome": walk forward when in order, swap-and-walk-backward when not. The same idea as insertion sort but with only one index variable — it's a teaching favourite for its short code. Stable.

### `sortStable(arr, cmp?)` — alias for `sortMerge`

`sortStable` is `sortMerge` — the canonical stable sort. Reach for it whenever you need a stable sort and don't care about the algorithm.

## Non-comparison sorts

### `sortCounting(arr, max)` — O(n + max)

Counting sort counts occurrences of each value in `[0, max]`, then writes them out in order. Only works on non-negative integers; panics otherwise. Linear time when `max` is O(n). The classic "linear-time sort" — reach for it when your keys are bounded integers.

### `sortRadix(arr)` — O(n * k)

Radix sort (LSD, base 10) sorts non-negative integers by their digits, least significant first. Each pass uses counting sort on a single digit. Linear time when the number of digits `k` is constant. Panics on negative or non-integer input.

### `sortBucket(arr, n)` — O(n + n²/n) = O(n) avg

Bucket sort distributes the input into `n` buckets by value range, sorts each bucket (using JS's built-in `Array.sort`), then concatenates. Numeric only (uses the array's min and max to compute bucket ranges). Average case O(n); worst case O(n²) when all values fall into one bucket.

## Verification

### `isSorted(arr, cmp?)` — O(n)

`isSorted` returns true when the array is in sorted order according to `cmp`. Useful as a property-test oracle (e.g., `expect(isSorted(sortXxx(arr))).toBe(true)`) and as a runtime sanity check in user code.

## Choosing a sort

| Use case | Recommendation |
|----------|----------------|
| Small arrays (< 50 elements), nearly sorted | `sortInsertion` |
| Medium arrays, need stability | `sortStable` (alias for `sortMerge`) |
| Medium-to-large arrays, don't need stability | `sortQuick` |
| Large arrays, guaranteed O(n log n), no extra memory | `sortHeap` |
| Small non-negative integers in a known range | `sortCounting` |
| Larger non-negative integers | `sortRadix` |
| Floats uniformly distributed in a range | `sortBucket` |
| Teaching / exotic / curiosity | `sortBubble`, `sortSelection`, `sortShell`, `sortCocktail`, `sortComb`, `sortGnome` |

## What's NOT in here

- **Topological sort**: that's a graph algorithm, not a sort — see the `graph` module's `graphTopoSort`.
- **External sort** (for data larger than memory): out of scope for stdlib; consider a streaming-friendly merge sort with chunked I/O.
- **Parallel sort** (multi-threaded merge sort, parallel quick sort): no thread primitive in v1; would require an RFC for the parallel-runtime module.

## Performance notes

- All comparison sorts are at least O(n log n) on random input — except the O(n²) sorts, which are O(n²) on random input but O(n) on nearly-sorted input. We don't micro-optimize the constants; for the same reason we ship all 14, we ship them at "reference quality" — clear over fast.
- The non-comparison sorts are O(n + k) where k is the key space size. For `sortCounting`, k = `max`. For `sortRadix`, k = the number of digits. For `sortBucket`, k = `n` (number of buckets).
- `isSorted` is O(n) — fast enough to call after every sort in a test suite without slowing you down.

The whole module is 15 functions, ~360 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
