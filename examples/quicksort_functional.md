# quicksort_functional.ae

Quicksort in functional style. We pick the first element as the
pivot, partition the rest into "less or equal" and "greater"
sub-arrays with `filter`, then recursively sort each and
concatenate. This is not in-place quicksort (it allocates new
arrays at every step), but it's a clean, idiomatic functional
implementation.

## What it does

1. **`concat(a, b)`** — concatenate two int arrays into a new
   array (functional; doesn't mutate either input).
2. **`qsort(arr)`** — the recursive core:
   - Base case: `len(arr) <= 1` → return `arr` (already sorted).
   - Pick `pivot = arr[0]`; build `tail = arr[1..]`.
   - `le = filter(tail, fn(x) { x <= pivot })`
   - `gt = filter(tail, fn(x) { x > pivot })`
   - Return `concat(concat(qsort(le), [pivot]), qsort(gt))`.
3. **`show(arr)`** — pretty-print an int array as
   `[a, b, c]`.
4. **Driver** — runs `qsort` on 7 input arrays (already sorted,
   reverse sorted, random, single element, empty, all-same,
   with negatives) and prints before/after.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/quicksort_functional.ae
```

## Key language features

- **Recursion** for the sort itself — natural fit for divide and
  conquer.
- **`filter(arr, fn)`** — Aether builtin: returns a new array
  of elements where `fn(element, index)` is truthy. Used twice
  to partition around the pivot.
- **`concat` helper** — Aether has no `+` operator for arrays
  (the `+` is string concat when one side is a string). We
  build a manual `concat` with `push`.
- **Lambda syntax `fn(x: int) -> bool { x <= pivot }`** — inline
  predicate for `filter`. Note that the lambda captures `pivot`
  from the enclosing scope (closure).
- **`[pivot]` literal** — single-element array, used to splice
  the pivot back in between the two sorted halves.

## Expected output

```
== Quicksort (functional) ==

  [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5] -> [1, 1, 2, 3, 3, 4, 5, 5, 5, 6, 9]
  [5, 4, 3, 2, 1] -> [1, 2, 3, 4, 5]
  [1, 2, 3, 4, 5] -> [1, 2, 3, 4, 5]
  [42] -> [42]
  [] -> []
  [7, 7, 7, 7] -> [7, 7, 7, 7]
  [3, -1, 4, -1, 5, -9, 2, 6, -5, 3] -> [-9, -5, -1, -1, 2, 3, 3, 4, 5, 6]

All assertions passed.
```

## Design notes

- Picking the first element as pivot is the textbook worst case
  (`O(n^2)`) for already-sorted or reverse-sorted input. For
  real-world use, pick a random element or use the "median of
  three" trick. Here we keep it simple.
- The `le`/`gt` partition walks the input twice (one `filter`
  call each). An imperative version walks once; the functional
  version is more readable but uses 2x the work.
- Allocation: every recursive call allocates 2-3 new arrays
  (`le`, `gt`, `concat` result). For large inputs this is wasteful;
  in-place quicksort is the standard fast implementation.
- The "all-same" case `[7, 7, 7, 7]` is interesting: every element
  goes to `le` (since `<= pivot`), so `gt` is empty. The recursion
  is still `O(n)` deep, which would overflow on large inputs but
  is fine for the demo size.
