# mergesort_iterative.ae

Bottom-up (iterative) merge sort. Unlike recursive merge sort, we
start by treating every element as a sorted run of length 1, then
iteratively merge pairs of runs into runs of length 2, then 4,
then 8, etc., until the whole array is one sorted run. We use no
recursion.

## What it does

1. **`concat(a, b)`** — concatenate two int arrays (helper).
2. **`merge(left, right)`** — merge two sorted arrays into a new
   sorted array. Walks both with two indices; pushes the smaller
   element each step; appends any leftovers.
3. **`merge_pass(runs)`** — one pass of merging. Walks the list
   of runs pairwise, merging each adjacent pair. If the run count
   is odd, the last run passes through unchanged. Returns the new
   (half-as-long) list of runs.
4. **`msort(arr)`** — the entry point:
   - Build the initial list of single-element runs.
   - Repeat `merge_pass` until only one run remains.
   - Return that run (or `[]` if input was empty).
5. **Driver** — runs `msort` on 7 input arrays and prints
   before/after. Also traces the merge passes for `[4, 3, 2, 1]`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/mergesort_iterative.ae
```

## Key language features

- **Array of arrays** — `runs: [[int]]` is a list of run arrays.
  Aether supports nested array types and indexing into them.
- **`while len(runs) > 1`** — the canonical bottom-up loop. Each
  pass roughly halves the run count.
- **`push(out, merge(runs[i], runs[i + 1]))`** — push a merged
  pair; advances `i` by 2.
- **`while` loops** everywhere — sidesteps the for-loop-scope
  quirk.

## Expected output

```
== Merge sort (iterative, bottom-up) ==

  [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5] -> [1, 1, 2, 3, 3, 4, 5, 5, 5, 6, 9]
  [5, 4, 3, 2, 1] -> [1, 2, 3, 4, 5]
  [1, 2, 3, 4, 5] -> [1, 2, 3, 4, 5]
  [42] -> [42]
  [] -> []
  [7, 7, 7, 7] -> [7, 7, 7, 7]
  [3, -1, 4, -1, 5, -9, 2, 6, -5, 3] -> [-9, -5, -1, -1, 2, 3, 3, 4, 5, 6]

trace of merge passes for [4, 3, 2, 1]:
  initial runs: [[4], [3], [2], [1]]
  after pass:    [[3, 4], [1, 2]]
  after pass:    [[1, 2, 3, 4]]

All assertions passed.
```

## Design notes

- Bottom-up merge sort is `O(N log N)` always — no worst case
  like quicksort's `O(n^2)` on sorted input.
- Memory: each `merge_pass` builds a new run list; the total
  memory at any moment is `O(N)`.
- The trace for `[4, 3, 2, 1]` shows the run-list evolving:
  `[[4],[3],[2],[1]] -> [[3,4],[1,2]] -> [[1,2,3,4]]`. Each pass
  doubles the run length, halving the run count.
- The empty-input case (`[]`) is handled by checking `len(runs)
  == 0` at the end and returning `[]` explicitly (otherwise
  `runs[0]` would crash on the empty list).
- Compare to `merge_sort.ae` (already in the repo) which uses
  recursive top-down merge sort. The iterative version uses no
  recursion at all.
