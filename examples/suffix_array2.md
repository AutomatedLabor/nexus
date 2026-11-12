# suffix_array2 — Suffix Array (Insertion Sort Variant)

Builds a suffix array for `"abracadabra"` using insertion sort,
in contrast to `suffix_array.ae` which uses merge sort on the
same input shape (with `"banana"` as the demo string).

## What it does

Enumerates every suffix of the input string, then sorts them
lexicographically by inserting each `(suffix, index)` pair into
a sorted list (insertion sort). The result is the suffix
array: the list of starting indices of all suffixes in sorted
order.

## Why insertion sort?

For small inputs (`|s|` < ~100), insertion sort is competitive
with merge sort or quicksort in practice, despite being
`O(n^2)` in the worst case. It's also the simplest correct
implementation — easy to verify by hand — which makes it a
useful oracle for testing more complex suffix-array
construction algorithms (e.g. SA-IS, prefix-doubling).

The existing `suffix_array.ae` uses merge sort (`O(n log n)`
with `O(n)` auxiliary space) and is the production version.
This variant exists as a correctness oracle and a teaching
example.

## Output

For `"abracadabra"` (length 11), the suffixes in sorted order
are:

```
sorted suffixes:
  [10] "a"
  [7] "abra"
  [0] "abracadabra"
  [3] "acadabra"
  [5] "adabra"
  [8] "bra"
  [1] "bracadabra"
  [4] "cadabra"
  [6] "dabra"
  [9] "ra"
  [2] "racadabra"

suffix array: [10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]
```

Note the symmetry: shorter suffixes sort before longer ones
that share the same prefix (e.g. `"a"` before `"abra"` before
`"abracadabra"`).

## Implementation notes

- The `insert_sorted` function builds a new sorted array by
  inserting `pair` at the right position; the input array is
  not mutated.
- `cmp_str` is a lexicographic char-code comparison that
  returns `-1`, `0`, or `1`.
- The build is `O(n^2)` in the worst case (each insertion
  walks the whole sorted list), but `O(n)` on already-sorted
  input.

## Sanity assertions

The example ends with an `assert_eq` check verifying the
suffix array is `[10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]` (length
11). The order matches the textbook output for
`"abracadabra"`.

## See also

- `suffix_array.ae` — merge-sort variant on `"banana"`.
- `suffix_tree.ae` — a Ukkonen-style suffix tree
  construction (more complex but supports O(|P|) pattern
  lookup).
