# combination_sum.ae

Combination sum: given an array of distinct candidate integers
and a target, find all unique combinations of candidates that
sum to target. Candidates can be reused; order doesn't matter.

## What it does

1. **`copy_ints(arr)`** — copy an int array (since the v1 evaluator
   doesn't allow mutating a parameter in place).
2. **`with_elem(arr, x)`** — return a fresh copy of `arr` with
   `x` appended. Used to pass an updated `path` through the
   recursion without mutation.
3. **`backtrack(cands, target, start, path, out)`** — recursive
   DFS:
   - If `target == 0`, emit `path` (prefixed by its size) into
     `out`.
   - If `target < 0`, return (this branch is exhausted).
   - Else, for each candidate from `start` onward, recurse with
     `target - c`, keeping `start = i` so the same candidate can
     be reused but later candidates only come after.
4. **`combination_sum(cands, target)`** — kicks off the
   backtracking with an empty `path`.
5. **`show(flat)`** — pretty-printer that walks the flat
   `[size0, c0_0, c0_1, ..., size1, ...]` layout and renders it
   as `[[2, 2, 3], [7]]`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/combination_sum.ae
```

## Key language features

- **Passing copies through recursion** instead of mutating a
  shared `path` array — sidesteps the v1 evaluator's "cannot
  assign to immutable parameter" rule for function parameters.
- **`while i < len(cands)`** for the candidate loop — sidesteps
  the for-loop-scope quirk.
- **`reduce` to render the candidates** as `2, 3, 6, 7` for the
  output.
- **`out` accumulator (mutable)** collects the flat output
  across recursion levels via `push`.

## Expected output

```
== Combination sum ==

  cands=[2, 3, 6, 7], target=7  ->  [[2, 2, 3], [7]]
  cands=[2, 3, 5], target=8  ->  [[2, 2, 2, 2], [2, 3, 3], [3, 5]]
  cands=[2], target=1  ->  []
  cands=[1], target=3  ->  [[1, 1, 1]]
  cands=[7, 3, 2], target=7  ->  [[7], [3, 2, 2]]

Headline: combination_sum([2,3,6,7], 7) = [[2, 2, 3], [7]]

All assertions passed.
```

## Design notes

- The "start index" trick (recursing with `start = i` rather
  than `start = i + 1`) lets each candidate be reused, while
  preventing permutations of the same combination (so we
  don't emit both `[2, 3, 2]` and `[2, 2, 3]`).
- The unsorted case `[7, 3, 2]` produces `[[7], [3, 2, 2]]` —
  the order of the combinations matches the order of the
  candidates in the input array.
- The `cands=[2], target=1` case returns `[]` because no
  combination of `2`s sums to `1`.
- The `cands=[1], target=3` case returns `[[1, 1, 1]]` —
  exactly one combination (reuse the only candidate three times).
- Fully clean compile (`ok = true`).
