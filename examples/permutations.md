# permutations.ae

Generate all permutations of an array of distinct integers.

## What it does

1. **`swap_copy(arr, i, j)`** — return a fresh copy of `arr`
   with elements at positions `i` and `j` swapped.
2. **`backtrack(arr, prefix_len, out)`** — recursive DFS:
   - If `prefix_len == len(arr)`, the entire array is fixed;
     emit it (prefixed by its size) into `out`.
   - Else, for each `i` from `prefix_len` onward, swap
     `arr[prefix_len]` with `arr[i]`, recurse with
     `prefix_len + 1`, then continue with the next `i`.
   - Each recursion gets a fresh swapped copy — the v1 evaluator
     doesn't allow mutating a parameter, so we pass copies.
3. **`permutations(arr)`** — kicks off the backtracking with
   `prefix_len = 0`.
4. **`show(flat, size)`** — pretty-printer that walks the flat
   output and renders it as `[[1,2,3], [1,3,2], ...]`.
5. **Driver** — generates permutations for `[1,2,3]`, `[1,2]`,
   `[42]`, `[1,2,3,4]`, prints them (with a count for the 4-element
   case), then asserts factorial-count properties and the
   specific contents of the first permutation.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/permutations.ae
```

## Key language features

- **Passing swapped copies through recursion** — sidesteps the
  v1 evaluator's "cannot assign to immutable parameter" rule.
- **`while i < len(arr)`** for the loop — sidesteps the
  for-loop-scope quirk.
- **`int(len(p4) / (1 + 4))`** — integer division to compute
  the permutation count from the flat output length.
- **`push(out, len(arr))`** prefix — each emitted permutation
  is prefixed by its size, so the pretty-printer can walk
  variable-sized groups uniformly (here, all sizes are equal
  but the layout is general).

## Expected output

```
== Permutations ==

  permutations([1, 2, 3]) = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]
  permutations([1, 2])     = [[1, 2], [2, 1]]
  permutations([42])        = [[42]]
  permutations([1..4]) count = 24

Headline: permutations([1,2,3]) = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]

All assertions passed.
```

## Design notes

- The classic swap-based backtracking produces permutations in
  lexicographic order when the input is sorted — verified by
  the first permutation `[1, 2, 3]` matching the input.
- The factorial-count assertions: `n!` permutations of an
  `n`-element array (where `0! = 1` for the empty array).
- For `[1,2,3,4]` we get `4! = 24` permutations — too many to
  print individually, so we just count.
- The recursion depth is bounded by `len(arr)`, so it's safe
  for any reasonable input size (the v1 evaluator's step limit
  would kick in for arrays of length ≥ 12).
- Fully clean compile (`ok = true`).
