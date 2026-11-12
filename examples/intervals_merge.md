# intervals_merge.ae

An interval tree (sorted by `lo`) with overlap queries. We insert 5 intervals, then query overlaps with `[3, 7]` and merge the intervals into a disjoint set.

## What it does

1. **`insert_interval(arr, lo, hi)`** — insert `[lo, hi]` into the sorted array, keeping it sorted by `lo`. Uses a single-pass shift: find the insertion point, push the new element to the end, then shift the tail right by one.
2. **`query_overlaps(arr, q_lo, q_hi)`** — linear scan; return every interval where `interval.lo <= q_hi AND interval.hi >= q_lo`.
3. **`merge_intervals(arr)`** — collapse overlapping intervals in a sorted array into disjoint ones: walk the array, and if the current interval's `lo` overlaps the last merged interval's `hi`, extend the last merged; otherwise push a new merged interval.
4. **`show_intervals(arr)`** — render an array of `(lo, hi)` pairs as `[[1, 4], [2, 6]]`.
5. **Driver** — inserts 5 intervals, queries overlaps with `[3, 7]`, merges, and asserts the results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/intervals_merge.ae
```

## Key language features

- **Tuple-of-2 as a record** — each interval is `(lo, hi)` stored as a 2-element int array. `arr[i].0` and `arr[i].1` extract the bounds.
- **In-place array shift** — `arr[j] = arr[j - 1]` shifts elements to make room for the insert. The type checker warns (treats `[int]` as non-tuple), but the evaluator handles it.
- **`if cond { stmt };` followed by trailing expression** — the `if !placed { push(arr, [lo, hi]) };` needs a `;` before the trailing `arr` to satisfy the parser.
- **`while` for iteration** — every loop is `while i < n { ...; i = i + 1 }` to avoid the for-loop-scope quirk.
- **Bare-expression returns** — `merge_intervals` returns either `[]` (empty case) or the built `out` array as the trailing expression of the `if/else`.

## Expected output

```
== Interval tree demo ==

inserted 5 intervals: [[1, 4], [2, 6], [5, 7], [6, 8], [10, 12]]

query overlaps with [3, 7]:
  [1, 4]
  [2, 6]
  [5, 7]
  [6, 8]

merged disjoint intervals: [[1, 8], [10, 12]]

All assertions passed.
```

## Design notes

- **Sorted array, not a balanced tree**: a true interval tree (e.g. an augmented red-black tree keyed by `lo` with subtree-max-end metadata) gives O(log n + k) queries. We use a sorted array for simplicity — O(n) insert, O(n) query. Fine for 5 intervals; for thousands, use the `interval` stdlib module.
- **Insertion-sort style insert**: walk the array, find the first interval whose `lo` is greater than the new one's `lo`, shift the tail right by one, drop the new interval in. O(n) per insert.
- **Overlap rule**: `[a, b]` overlaps `[c, d]` iff `a <= d AND b >= c`. Equivalently, they DON'T overlap iff `b < c OR a > d`. We use the positive form.
- **Merge is a left-to-right sweep**: walk the sorted array; if the current interval's `lo` is `<=` the last merged interval's `hi`, extend the last merged; otherwise push a new merged interval. The "extend" takes the max of the two `hi` values.
- **`[1, 4]` and `[2, 6]` merge to `[1, 6]`**: the second interval starts at 2 which is `<= 4` (the first's hi), so they merge. Then `[5, 7]` starts at 5 which is `<= 6`, so it merges into `[1, 7]`. Then `[6, 8]` starts at 6 which is `<= 7`, so it merges into `[1, 8]`. Then `[10, 12]` starts at 10 which is `> 8`, so it stays separate. Final: `[[1, 8], [10, 12]]`.
- **Avoids for-loop-scope quirk**: every loop is `while`. The `if cond { stmt };` after a block uses a `;` to satisfy the parser.
