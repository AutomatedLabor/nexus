# topk — Top-K Elements (Min-Heap of Size K)

Finds the **k largest elements** in an array using a min-heap
of size k. We find the 3 largest in
`[3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5]`; expected: `[9, 6, 5]`.

## What it does

Iterates the input array once, maintaining a min-heap of size
at most `k`:

- If the heap has fewer than `k` elements, push the current
  element (and sift up).
- Otherwise, if the current element is larger than the heap's
  minimum (root), replace the root with the current element
  (and sift down). Otherwise, skip the element.

After the iteration, the heap contains the `k` largest
elements (in no particular order). The example then
selection-sorts them in descending order for the output.

## Why a min-heap?

A min-heap of size `k` lets you find the top-k in `O(n log k)`
time and `O(k)` auxiliary space — better than sorting the whole
array (`O(n log n)` time, `O(n)` space) when `k` is small
relative to `n`. For each of the `n` elements, the heap
operation is `O(log k)`.

The trick is that the heap's **minimum** is always the
smallest of the top-k-so-far. A new element that's smaller
than the minimum is also smaller than all of the top-k, so we
can skip it. A new element that's larger than the minimum
displaces the minimum.

## Output

```
== Top-k elements (min-heap of size k) ==

arr: [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5]
k:   3

top-3 largest: [9, 6, 5]

step-by-step (heap state after each element):
  arr[0]=3: push, heap=[3]
  arr[1]=1: push, heap=[1, 3]
  arr[2]=4: push, heap=[1, 3, 4]
  arr[3]=1: <= min 1, skip; heap=[1, 3, 4]
  arr[4]=5: replace min 1 -> 5, heap=[3, 5, 4]
  arr[5]=9: replace min 3 -> 9, heap=[4, 5, 9]
  arr[6]=2: <= min 4, skip; heap=[4, 5, 9]
  arr[7]=6: replace min 4 -> 6, heap=[5, 6, 9]
  arr[8]=5: <= min 5, skip; heap=[5, 6, 9]
  arr[9]=3: <= min 5, skip; heap=[5, 6, 9]
  arr[10]=5: <= min 5, skip; heap=[5, 6, 9]
```

The first three elements fill the heap; subsequent elements
either replace the minimum or are skipped. The final heap
`[5, 6, 9]` is a valid min-heap (the minimum, 5, is at the
root). Sorting it descending gives `[9, 6, 5]`.

## Implementation notes

- The min-heap is stored as a flat array; children of index
  `i` are at `2i+1` and `2i+2`, parent at `(i-1) / 2`.
- `sift_up` and `sift_down` are the standard heap-fix
  operations, mutating the heap in place.
- `heap_replace_min` overwrites the root and sifts down —
  more efficient than `pop + push`.
- The final descending sort is a simple selection sort
  (`O(k^2)` but `k` is small).

## Sanity assertions

The example verifies:
- `topk(arr, 3) = [9, 6, 5]` (the main case);
- `topk(arr, 1) = [9]` (k=1);
- `topk(arr, 5) = [9, 6, 5, 5, 5]` (note the three 5s);
- `topk(arr, 0) = []` (k=0);
- `topk(arr, 100) = [9, 6, 5, 5, 5, 4, 3, 3, 2, 1, 1]` (k >= n
  returns all elements sorted descending);
- `topk([7], 1) = [7]` (single-element array).

## See also

- `priority_queue_demo.ae` — a generic priority queue.
- `mergesort_iterative.ae` — full-array sort.
