# merge_intervals.ae

Merge overlapping intervals: given a list of intervals where each
interval is `[start, end]`, merge all overlapping ones and return
the merged list.

## What it does

1. **`sort_intervals(arr)`** — insertion-sorts a flat intervals
   array (`[s0, e0, s1, e1, ...]`) by the start value. Mutates
   the input array in place (and returns it).
2. **`merge_intervals(arr)`** — walks the sorted array; if the
   next interval's start is ≤ the current end, extends the
   current interval; otherwise starts a new one.
3. **`show_intervals(arr)`** — pretty-printer that renders a
   flat array as `[[1,3],[2,6]]`.
4. **Driver** — runs the pipeline on five inputs including the
   classic LeetCode example and the `[[5,6],[1,2]]` disorder
   case, then asserts six sub-results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/merge_intervals.ae
```

## Key language features

- **Flat-array encoding `[s0,e0,s1,e1,...]`** rather than nested
  `[[s, e], ...]` arrays — Aether's nested-array typing is
  more cumbersome in the v1 evaluator, and the flat form keeps
  the type-checker happy with `[int]`.
- **`int(len(arr) / 2)`** for integer division — sidesteps the
  v1 evaluator's float-division-by-default behaviour.
- **`while j >= 0 && placed == 0`** inner loop with a `placed`
  flag — avoids the early-`break` quirk in the v1 evaluator.
- **`out[len(out) - 1] = last_end`** — index-assign to update the
  last interval's end when merging.

## Expected output

```
== Merge intervals ==

  [[1,3],[2,6],[8,10],[15,18]]  ->  [[1,6],[8,10],[15,18]]
  [[1,4],[4,5]]  ->  [[1,5]]
  [[1,4],[0,4]]  ->  [[0,4]]
  [[1,4],[2,3]]  ->  [[1,4]]
  [[5,6],[1,2]]  ->  [[1,2],[5,6]]

Headline: [[1,3],[2,6],[8,10],[15,18]]  ->  [[1,6],[8,10],[15,18]]

All assertions passed.
```

## Design notes

- Insertion sort is O(n²) but for typical interval-merge inputs
  (n ≤ 1000) it's fast enough and avoids pulling in a sort
  builtin.
- The "extend last_end if e is bigger" check handles the
  containment case `[1, 4], [2, 3]` correctly — the second
  interval's end (3) doesn't extend the first's (4).
- The disordered case `[[5,6],[1,2]]` first sorts to
  `[[1,2],[5,6]]`, then merges to itself.
- Fully clean compile (`ok = true`).
