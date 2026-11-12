# z_algorithm — Z-Array Computation

Computes the Z array of `"aabcaabxaaaz"` using the Z-algorithm
in `O(n)` time.

## What it does

The Z array `Z[i]` is the length of the longest substring
starting at index `i` that is also a prefix of the whole
string. `Z[0]` is conventionally 0 (or `n`; we use 0 here — the
trivial self-match isn't interesting).

## Why Z?

The Z array is the foundation of many string-search
algorithms. The canonical pattern-matching use: concatenate
`P + "#" + T` and compute its Z array; any `Z[i] = |P|`
indicates a match of `P` in `T` at position `i - |P| - 1`.
This gives an `O(|P| + |T|)` pattern matcher.

The Z array is also useful for finding the longest prefix that
is also a suffix (relevant for KMP border computation), for
 detecting
periodicities in strings, and for finding palindromes.

## The algorithm

Maintains a "Z-box" `[L, R]` — the rightmost interval that is
also a prefix of the string. For each index `k`:

- If `k > R` (outside the Z-box), compare directly: extend
  `R` forward as long as `s[R] == s[R - k]`, then set
  `Z[k] = R - L` and `R = R - 1`.
- If `k <= R` (inside the Z-box), the mirror position
  `k - L` has already been computed. If `Z[k - L] < R - k + 1`,
  copy it (`Z[k] = Z[k - L]`). Otherwise, extend by direct
  comparison from `R` forward.

This is `O(n)` because each successful comparison advances
`R`, and `R` is bounded by `n`.

## Output

For `"aabcaabxaaaz"` (length 12):

```
Z array:
  Z[0] = 0  (s[0] = 'a')
  Z[1] = 1  (s[1] = 'a')
  Z[2] = 0  (s[2] = 'b')
  Z[3] = 0  (s[3] = 'c')
  Z[4] = 3  (s[4] = 'a')
  Z[5] = 1  (s[5] = 'a')
  Z[6] = 0  (s[6] = 'b')
  Z[7] = 0  (s[7] = 'x')
  Z[8] = 2  (s[8] = 'a')
  Z[9] = 2  (s[9] = 'a')
  Z[10] = 1  (s[10] = 'a')
  Z[11] = 0  (s[11] = 'z')

Z = [0, 1, 0, 0, 3, 1, 0, 0, 2, 2, 1, 0]
```

Notable values:

- `Z[4] = 3` because `s[4..] = "aabxaaaz"` starts with `"aab"`
  (the first three chars of `"aabcaabxaaaz"`), but `s[7] = 'x'`
  != `s[3] = 'c'` so the match stops at length 3.
- `Z[8] = 2` because `s[8..] = "aaz"` starts with `"aa"` but
  `s[10] = 'a'` != `s[2] = 'b'`.

## Implementation notes

- The algorithm runs in a single `while k < n` loop.
- All character comparisons are direct (`s[i] == s[j]`).
- No `for` loops; only `while`.

## Sanity assertions

The example ends with `assert_eq(z, [0, 1, 0, 0, 3, 1, 0, 0, 2, 2, 1, 0])`
and `assert_eq(len(z), 12)`. This matches the textbook output
for `"aabcaabxaaaz"`.

## See also

- `string_match_kmp.ae` — KMP, the "border-array" sibling of
  the Z-algorithm.
