# insertion_sort.ae

In-place insertion sort using `while` loops and array element
assignment. The companion to `bubble_sort.ae` — both implement
textbook O(n²) sorting but with different in-place strategies.

## What it does

For each `i` from 1 to `len-1`, take the element `arr[i]` (the
"key") and insert it into the already-sorted prefix `arr[0..i]` by
repeatedly shifting larger elements one position to the right.
After the inner loop, the key is placed at `arr[j + 1]`.

1. **`copy_of(arr)`** — defensive copy of the input (same as
   `bubble_sort.ae`).
2. **`insertion_sort(arr)`** — the textbook algorithm. Outer `while
   i < n` walks `i` from 1 to n-1. Inner `while j >= 0 && a[j] >
   key` shifts larger elements right. After the shift, `a[j + 1] =
   key` places the key in its sorted position.
3. **Driver** — sorts the canonical
   `[5, 2, 8, 1, 9, 3, 7, 4, 6, 0]` plus edge cases including
   negative numbers (`[10, -3, 7, 0, -1, 4]`).

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/insertion_sort.ae
```

## Key language features

- **Array element assignment** `a[j + 1] = a[j]` and `a[j + 1] =
  key` — same `arr[i] = x` mutation that worked in `bubble_sort.ae`.
- **Compound `while` condition** `j >= 0 && a[j] > key` — Aether
  supports short-circuit `&&` in loop conditions.
- **Negative indices are fine in comparisons** (the inner loop
  terminates when `j < 0`, before we'd access `a[-1]`).
- **`reduce` for string rendering** — same pattern as
  `bubble_sort.ae`.

## Expected output

```
== Insertion sort (while + array assignment) ==

input:  [5, 2, 8, 1, 9, 3, 7, 4, 6, 0]
sorted: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

  [3, 1, 2] -> [1, 2, 3]
  [42] -> [42]
  [] -> []
  [9, 8, 7, 6, 5, 4, 3, 2, 1] -> [1, 2, 3, 4, 5, 6, 7, 8, 9]
  ...
  [10, -3, 7, 0, -1, 4] -> [-3, -1, 0, 4, 7, 10]

All assertions passed.
```

## Design notes

- Insertion sort is O(n) on already-sorted input — the inner
  `while j >= 0 && a[j] > key` loop never executes a single
  iteration when the array is already sorted. We exploit this for
  the `[1, 1, 1, 1]` test case (no swaps needed).
- We deliberately include negative numbers in one of the test
  cases (`[10, -3, 7, 0, -1, 4]`) to verify that the comparison
  operators and array values handle them correctly.
- The `key = a[i]` binding is preserved across the inner loop
  because `key` is an immutable `let` — no `mut` needed since we
  never reassign it.
