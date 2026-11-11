# bubble_sort.ae

In-place bubble sort using `while` loops, array indexing, and array
element assignment (`arr[i] = x`). Demonstrates that the v1
playground evaluator supports `arr[i] = x` mutation on `mut` arrays
(the same trick used by `matrix_ops.ae`).

## What it does

The algorithm: repeatedly pass over the array, swapping adjacent
out-of-order pairs. After pass `k`, the largest `k` elements are in
their final positions, so we could shrink the range — but the
`swapped` flag already terminates us on sorted input.

1. **`copy_of(arr)`** — defensive copy of the input array so we
   don't mutate the caller's data. Built with a `while` loop and
   `push`.
2. **`bubble_sort(arr)`** — the textbook algorithm. The outer
   `while swapped` loop continues until a full pass makes no
   swaps. The inner `while i < n - 1` walks adjacent pairs and
   swaps with a temporary variable when out of order. `arr[i] =
   arr[i + 1]` is the key mutation.
3. **Driver** — sorts the canonical `[5, 2, 8, 1, 9, 3, 7, 4, 6, 0]`
   plus a handful of edge cases (empty, singleton, already-sorted,
   reverse-sorted, duplicates, negatives).

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/bubble_sort.ae
```

## Key language features

- **Array element assignment** `a[i] = a[i + 1]` — the v1 evaluator
  supports this on `mut` int arrays. The swap pattern
  `let tmp = a[i]; a[i] = a[i+1]; a[i+1] = tmp;` is the standard
  three-step swap.
- **Nested `while` loops** with multiple `let mut` cursors.
- **Boolean `mut` flag** (`swapped`) that controls the outer loop.
- **`reduce` with `if acc == ""` separator logic** to render arrays
  as `[a, b, c]` strings — the canonical pattern for avoiding the
  for-loop-scope quirk when building a string out of an array.

## Expected output

```
== Bubble sort (while + array assignment) ==

input:  [5, 2, 8, 1, 9, 3, 7, 4, 6, 0]
sorted: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

  [3, 1, 2] -> [1, 2, 3]
  [42] -> [42]
  [] -> []
  ...
All assertions passed.
```

## Design notes

- The `copy_of` step is important: Aether passes arrays by reference
  (the same JS array is shared), so if we sorted the input array
  in place the caller's data would also be mutated. The defensive
  copy keeps the input unchanged.
- We use a `swapped` flag instead of the classic "n - 1 passes"
  outer loop — both work, but the flag version terminates early
  on already-sorted input, which is a small but real win for
  nearly-sorted inputs.
