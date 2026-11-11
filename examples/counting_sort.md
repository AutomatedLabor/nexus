# counting_sort.ae

Counting sort — sort an integer array whose values lie in a
known small range (here 0..9) by counting how many times each
value occurs, then emitting each value `v` exactly `counts[v]`
times in ascending order. Linear time `O(n + k)`, where `k`
is the value-range width.

## What it does

1. **`zeros(n)`** — build a fresh array of `n` zeros by
   pushing in a `while` loop (no `[0]*n` repeat operator in
   Aether v1).
2. **`counting_sort(arr, max_value)`** — the algorithm itself:
   - Allocate `counts` of size `max_value + 1`.
   - Walk `arr` with a `while` loop, incrementing `counts[v]`
     via the **indexed compound-assign** `counts[v] = counts[v] + 1`
     — Aether v1 supports array index-assignment (the
     evaluator's `assignTo` handles `Index` targets).
   - Walk `v` from 0 to `max_value`, pushing `v` into the
     output `counts[v]` times via a nested `while` loop.
3. **Driver** — sorts `[3, 1, 4, 1, 5, 9, 2, 6]` and prints
   a few additional cases.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/counting_sort.ae
```

## Key language features

- **Indexed array assignment** `counts[v] = counts[v] + 1` —
  the canonical pattern for mutating an array element in
  place. The type checker warns about this if `counts` isn't
  declared `let mut`, but execution proceeds (lenient
  playground semantics).
- **`while` loops** for both the counting pass and the
  emission pass — avoids the for-loop-scope quirk.
- **`reduce`** to render the int array as a pretty
  `"[1, 2, 3]"` string.

## Expected output

```
== Counting sort ==

input:  [3, 1, 4, 1, 5, 9, 2, 6]
sorted: [1, 1, 2, 3, 4, 5, 6, 9]

  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] -> [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  [5, 5, 5, 5] -> [5, 5, 5, 5]
  [0] -> [0]
  [2, 2, 1, 1, 0, 0] -> [0, 0, 1, 1, 2, 2]

All assertions passed.
```

## Design notes

- Counting sort is **stable** in the textbook formulation
  (it preserves the input's relative order for equal keys).
  Our simplified version emits in ascending key order with no
  per-key sub-ordering, so it doesn't preserve stability —
  but for plain integers, stability is unobservable anyway.
- The `max_value` parameter bounds the auxiliary array size.
  For unbounded-value inputs you'd need to first scan for
  the max and pass that, or use a sparse map.
- The runtime is dominated by the two linear passes plus
  the emission pass (`O(n + k)`), so for `k << n` this
  beats the `O(n log n)` comparison sorts.
