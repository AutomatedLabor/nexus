# bogosort.ae

Bogosort — the "perversely awful" sort that generates random
permutations of the input until one happens to be sorted. Real
implementations use a PRNG; this one is deterministic so the run
is reproducible and the algorithm always terminates for the tiny
inputs we use.

## What it does

1. **`fact(n)`** — recursive factorial.
2. **`perm_at(n, s)`** — generate the s-th permutation of
   `[0, 1, ..., n-1]` using the factorial-number-system (Lehmer
   code). For `n = 3`, `s = 0..5` enumerates the 6 permutations in
   lexicographic order.
3. **`permute(arr, s)`** — apply the s-th permutation of indices
   to `arr`, producing a fresh permutation of its elements.
4. **`is_sorted(arr)`** — non-decreasing check via a `while` loop
   and a `mut` flag (referenced *after* the loop, which is fine
   for `while` — only `for` has the post-loop scope quirk).
5. **Bogosort loop** — at step `tries`, generate
   `permute(input, tries)`; if it's sorted, stop; otherwise
   increment and try again. Capped at 100 tries.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/bogosort.ae
```

## Key language features

- **Lehmer-code permutation enumeration** so the search is
  deterministic and exhaustive over the 6/24 permutations of a
  3/4-element array. (Pure rotation would cycle without hitting
  every permutation for some inputs.)
- **`while` loops for the main search** (not `for`) — avoids
  the for-loop-scope quirk where a pre-loop `let` referenced
  after the loop fails with "undefined name".
- **`int(k / f)` for integer division** since `/` is float
  division in Aether.
- **Array rebuild via `push`** to "remove" an index from
  `available` (no splice / filter-by-index builtin).

## Expected output

```
== Bogosort (deterministic pseudo-shuffle) ==

input:  [3, 1, 2]
sorted: [1, 2, 3]
tries:  4

  [2, 1] -> [1, 2] in 2 tries
  [1] -> [1] in 0 tries
  [4, 3, 2, 1] -> [1, 2, 3, 4] in 24 tries

All assertions passed.
```

## Design notes

- The "tries" count starts at 0 and increments after each
  attempt; the 0th attempt is the original (unsorted) array,
  so the printed `tries` is the number of *attempts made*
  (including the successful one). For `[3, 1, 2]` the 4th
  attempt (the `[1, 2, 0]` Lehmer permutation applied to
  `[3, 1, 2]`) yields `[1, 2, 3]`.
- For the `[4, 3, 2, 1]` case, the worst-case Lehmer index is
  `4! - 1 = 23` (the last permutation is the full reversal,
  which is the sorted order here). The 200-try cap covers
  this comfortably.
- The `n!` growth of permutation space means bogosort is
  unusable past about `n = 10` in practice — kept here
  purely as a pedagogical example of deterministic
  pseudo-randomness via enumeration.
