# Aether stdlib — `list`

The `list` module is a comprehensive toolkit for working with sequential data — anything you'd reach for when reaching for Python's `itertools`, Haskell's `Data.List`, or Lodash's chunk/zip family. Every function is a pure TypeScript implementation that operates on plain JavaScript arrays (the Aether evaluator hands arrays straight through to builtins), so a call like `list.window([1,2,3,4], 2)` in Aether is literally `window([1,2,3,4], 2)` in the host. Throwing a plain `Error` from a builtin becomes an Aether panic, which is why the functions below panic (rather than silently return a sentinel) when given invalid arguments.

## Conventions

- **Index arguments are integers** — pass `3.5` or `NaN` and you get a `panic: take: expected number, got number`-style message. Negative `n` means "from the end" for `take`/`drop`/`rotate`, but means "error" for `cycle`/`replicate`/`unfold`/`rangeBy`/`iterate` (where the result length cannot be negative).
- **Callbacks receive `(value, index)`** in that order. We deliberately expose the index because so many real uses of `takeWhile`/`partition`/`groupBy` need position-awareness (e.g. `groupBy` over time series where the first element after a gap starts a new group).
- **Stability**: `partition`, `span`, `break_`, `groupBy` preserve the relative order of elements within each output chunk.
- **Combinatorics**: `permutations` and `combinations` produce results in lexicographic order on *indices*, not values — so `permutations([1,1])` gives two distinct results (the two 1's are treated as distinct positions). This matches the mathematical convention and is what you want when generating index permutations.
- **Allocations**: scanning/windowing functions allocate a fresh output array; they never mutate their input. `rotate`, `take`, `drop` use `slice` so the input is never touched.

## Zipping and interleaving

`zip(a, b)` produces pairs, stopping at the shorter array; `zip3(a, b, c)` does the same for triples. `unzip` is the inverse — an array of 2-tuples becomes a 2-tuple of arrays. `interleave(a, b)` alternates elements from `a` and `b`, appending the remainder of whichever is longer. `cycle(arr, n)` walks `arr` round-robin to produce exactly `n` elements — handy for round-robin scheduling or generating periodic test data.

```aether
list.zip([1,2,3], ["a","b","c"])         // [[1,"a"],[2,"b"],[3,"c"]]
list.zip3([1,2], ["a","b"], [true,false]) // [[1,"a",true],[2,"b",false]]
list.unzip([[1,"a"],[2,"b"]])            // [[1,2],["a","b"]]
list.interleave([1,3,5], [2,4])          // [1,2,3,4,5]
list.cycle([true,false], 5)              // [true,false,true,false,true]
```

## Taking and dropping

`take(arr, n)` returns the first `n` elements (or last `|n|` when `n` is negative). `drop` is its dual. `takeWhile`/`dropWhile` use a predicate to delimit the prefix — `takeWhile` keeps the satisfying prefix, `dropWhile` discards it. `span` and `break_` split an array at the predicate's first failure (Haskell's `span` and `break`); `partition` separates elements that satisfy the predicate from those that don't, preserving order within each group.

```aether
list.take([1,2,3,4], 2)        // [1,2]
list.take([1,2,3,4], -2)       // [3,4]
list.drop([1,2,3,4], 2)        // [3,4]
list.takeWhile([1,2,3,1], x -> x < 3) // [1,2]
list.span([1,2,3,4], x -> x < 3)     // [[1,2],[3,4]]
list.partition([1,2,3,4,5], x -> x % 2 == 0) // [[2,4],[1,3,5]]
```

## Grouping and windowing

`group(arr, n)` chunks the array into pieces of length `n` (the last chunk may be shorter). `groupBy(arr, fn)` groups *consecutive* elements that share the same key — perfect for collapsing runs in sorted data. `window(arr, n)` produces every contiguous subarray of length `n` (a sliding window), and `intersperse(arr, sep)` inserts `sep` between every pair of adjacent elements — useful for joining with separators that need to be a separate token rather than a string.

```aether
list.group([1,2,3,4,5], 2)            // [[1,2],[3,4],[5]]
list.groupBy([1,1,2,2,2,3], x -> x)   // [[1,1],[2,2,2],[3]]
list.window([1,2,3,4], 2)              // [[1,2],[2,3],[3,4]]
list.intersperse([1,2,3], 0)          // [1,0,2,0,3]
```

## Scanning and unfolding

`scan(arr, fn, init)` is `reduce` that keeps every intermediate accumulator — it returns `n+1` results, starting with `init`. `scanr` is the right-to-left version, useful for suffix-style reductions (e.g. building a suffix-sum array). `unfold(init, fn, n)` builds an array of length `n` by repeatedly applying `fn` to the previous value; `iterate(fn, n, seed)` is the same but with the function receiving the iteration index. `rangeBy(start, step, n)` is the numeric specialization — a C-style `for` loop collapsed into a single expression.

```aether
list.scan([1,2,3], (a, x) -> a + x, 0)         // [0,1,3,6]
list.scanr([1,2,3], (x, acc) -> x + acc, 0)   // [6,5,3,0]
list.unfold(1, x -> x * 2, 4)                  // [1,2,4,8]
list.iterate((x, i) -> x + i, 5, 0)            // [0,1,3,6,10]
list.rangeBy(0, 5, 4)                          // [0,5,10,15]
list.rangeBy(10, -2, 3)                         // [10,8,6]
```

## Combinatorics and rotation

`permutations(arr)` returns all `n!` orderings in lexicographic order. For an array with duplicates the duplicates are treated as distinct positions — `permutations([1,1])` returns `[[1,1],[1,1]]` (two results that happen to look the same). If you need true unique permutations, deduplicate the output with `set.setToArray(set.setNew(...))`. `combinations(arr, k)` returns all `n!/(k!(n-k)!)` `k`-subsets, also lexicographic. `rotate(arr, n)` rotates the array: positive `n` is left rotation, negative `n` is right rotation, and `n` is taken modulo the length.

```aether
list.permutations([1,2,3])        // 6 results, lex order
list.combinations([1,2,3,4], 2)   // 6 results: [1,2]..[3,4]
list.rotate([1,2,3,4,5], 2)       // [3,4,5,1,2]
list.rotate([1,2,3,4,5], -2)      // [4,5,1,2,3]
list.rotate([1,2,3], 3)           // [1,2,3] (full wrap)
```

## Error handling

All type-check failures throw a plain `Error` with the function name prefixed (e.g. `cycle: cannot cycle an empty array`), which the evaluator turns into a runtime panic. Range errors (`combinations: k out of range`, `group: chunk size must be positive`) are surfaced the same way. Callers who want to handle these gracefully should wrap their builtin calls in `try_`/`catch` at the Aether level, or check preconditions before invoking the function.

## When to reach for `list`

- **Bulk transforms over rows**: `zip(headers, row)` then `unzip` after editing.
- **Sliding-window algorithms**: `window(arr, k)` for moving averages, k-gram counts, N-gram extraction.
- **Sorted-data compression**: `groupBy` after `sort` to deduplicate or to compute per-group aggregates.
- **Search problems**: `permutations` for brute-force orderings, `combinations` for subset enumeration.
- **Generator pipelines**: `unfold`/`iterate`/`rangeBy` to construct input streams without writing a generator function.

## Performance notes

All functions in the module are O(n) in the size of the input arrays, with three notable exceptions: `permutations` is O(n!) (intentionally — it generates n! outputs), `combinations` is O(C(n, k)) (intentionally — it generates C(n, k) outputs), and `window` is O((n - k + 1) · k) (which is unavoidable for a function that returns that many k-length subarrays). For real workloads, the rate-limiters are: don't call `permutations` on arrays larger than 9–10 elements (10! = 3.6 million, 11! = 40 million, 12! = 480 million — you'll hit memory pressure well before you finish iterating); `combinations` of 30 choose 15 produces 155 million results and will take seconds; `window` with `n = 1_000_000` and `k = 10` allocates ~1M small arrays, which is fine but not free.

The sorting-adjacent helpers (`groupBy` for non-sorted input, `partition`, `span`, `break_`) are single-pass and do not sort. If you want `groupBy` to collapse *non-consecutive* duplicates into one group, sort first (`list.groupBy(arr.sort((a, b) => a - b), x => x)`), then call `groupBy` on the sorted result.

## Composition with other modules

The `list` module is intentionally narrow: it does sequence-shape operations only. For higher-order glue (mapping, filtering, reducing over the chunks it produces), reach for `collections` (`map`, `filter`, `reduce`, `flatten`) or `functional` (`pipe`, `pipeFns`, `compose`). For statistical aggregation over a chunked numeric array, reach for `statistics` (`mean`, `sum_`, `stdDev`). For per-element validation, reach for `validate` (`isAlpha`, `matches`). The boundaries are deliberate: `list` knows about array *shape*; the other modules know about array *content*.

## Pitfalls

- **`take` with negative `n`** is from the end, not a panic. `take([1,2,3,4,5], -2)` returns `[4, 5]`. If you want "take nothing for negative n", guard with `Math.max(0, n)`.
- **`groupBy` is consecutive-only**. For an unsorted array, `[1, 2, 1, 2]` groups into four singletons, not two pairs. Sort first if you want the latter.
- **`combinations(arr, 0)` returns `[[]]`** (one empty combination), not `[]` (no combinations). This matches the standard combinatorial convention: there is exactly one way to choose zero items. If your code iterates and does work per combination, it will run once for the empty choice — guard if that's not what you want.
- **`permutations` does not deduplicate**. `permutations([1, 1])` returns two results (both `[1, 1]`). The two `1`s are treated as distinct *positions*. If you want unique permutations of a multiset, dedupe the output with `set.setToArray(set.setNew(permutations(arr).map(p => p.join(","))))` or similar.
- **`window(arr, k)` with `k > arr.length`** returns `[]` (no windows fit). This is the mathematically correct answer (you can't fit a window of size k into an array of size n < k), but if you're computing a rolling statistic and want partial windows at the start, you'll need to handle that case separately.

The whole module is 25 functions, ~280 lines of TypeScript, no dependencies, and is included by default in every Aether program via `registerAll` in `aether/stdlib/index.ts`.
