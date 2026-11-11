# merge_sort.ae

Recursive divide-and-conquer merge sort on an int array. Splits
into halves, recursively sorts each, and merges the sorted halves
with a two-finger walk. Pure functional style — no in-place
mutation.

## What it does

1. **`take(arr, n)`** — returns the first `n` elements of `arr`
   via a `while` loop with `push`.
2. **`drop_n(arr, n)`** — returns the rest of the array after the
   first `n` elements.
3. **`merge(left, right)`** — two-finger walk: compare the fronts,
   `push` the smaller, advance that finger. When one is exhausted,
   drain the other.
4. **`merge_sort(arr)`** — recursive divide-and-conquer: base
   case `len(arr) <= 1`, otherwise `mid = int(len(arr) / 2)`,
   recurse on each half, merge the results.
5. **Driver** — sorts the canonical
   `[5, 2, 8, 1, 9, 3, 7, 4, 6, 0]` plus edge cases including
   negatives.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/merge_sort.ae
```

## Key language features

- **`int(...)` cast on division** — Aether's `/` is float division
  (`7 / 2` returns `3.5`), so we use `int(len(arr) / 2)` to get
  the integer midpoint. Without the cast, slicing an array of odd
  length would pass a float bound to `take`/`drop_n`, which then
  mis-counts the elements (a bug we hit during development).
- **Recursive function with an `if cond { then } else { else }`
  expression body** — `merge_sort` is a single if-else expression.
- **Nested `while` loops** in `merge` — one for the comparison
  phase, two for the drain phases.
- **`push` builtin** — used everywhere to build arrays. The
  function returns the array by referencing it as a bare expression
  after the loops.

## Expected output

```
== Merge sort (recursive divide & conquer) ==

input:  [5, 2, 8, 1, 9, 3, 7, 4, 6, 0]
sorted: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

  [3, 1, 2] -> [1, 2, 3]
  [42] -> [42]
  [] -> []
  ...
All assertions passed.
```

## Design notes

- We deliberately avoid the array-concat operator `+` (which works
  at runtime but produces type-checker warnings) and use `push`
  instead, so the example runs cleanly with `ok = true` and zero
  type errors. The trade-off is more verbose merge code.
- The `int()` cast on `len(arr) / 2` is essential — we hit this
  bug during development. The first draft produced arrays full of
  `null` values for odd-length inputs because `take([3, 1, 2],
  1.5)` takes 2 elements instead of 1.
- The two-finger `merge` uses three sequential `while` loops
  (compare, drain-left, drain-right) rather than nested `if`s
  inside one loop. Both styles work; the three-loop version is
  easier to read.
