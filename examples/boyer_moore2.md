# boyer_moore2 — Full Boyer-Moore (Bad-Char + Good-Suffix)

Full Boyer-Moore string search with BOTH the bad-character rule
and the good-suffix rule, in contrast to `boyer_moore.ae` which
uses only the bad-character rule (the Boyer-Moore-Horspool
variant).

## What it does

Searches for:

- `"ana"` in `"banana"` — overlapping matches at positions 1 and 3.
- `"world"` in `"hello world foo"` — single match at position 6.
- `"ab"` in `"abababab"` — overlapping matches at positions 0, 2, 4, 6.
- `"missing"` in `"hello world foo"` — no match.

## Bad-character vs good-suffix

The bad-character rule shifts the pattern so the mismatched
text char aligns with its rightmost occurrence in the pattern.
The good-suffix rule shifts the pattern so the matched suffix
aligns with another occurrence of that suffix in the pattern
(preceded by a different char). The full Boyer-Moore takes the
maximum of the two shifts.

The good-suffix rule is more expensive to compute (an `O(m^2)`
preprocessing step in our naive implementation) but enables
larger shifts on inputs with repeating patterns. For most
English text, the bad-character rule alone (Horspool) is
slightly faster in practice because of its lower preprocessing
cost; for inputs with periodic structure (e.g. DNA), the
good-suffix rule wins.

## Output

```
== Boyer-Moore (bad-char + good-suffix) ==

search "ana" in "banana" -> [1, 3]
search "world" in "hello world foo" -> [6]
search "ab" in "abababab" -> [0, 2, 4, 6]
search "missing" in "hello world foo" -> []
```

The first case is interesting: at `s=0`, the pattern is aligned
with `text[0..3] = "ban"`. Comparing right-to-left:
`pattern[2]='a'` vs `text[2]='n'` mismatches. The bad-character
shift says "shift so the 'n' in pattern (at index 1) aligns
with the 'n' in text (at index 2)" — shift by 1. The good-suffix
shift is 1 too (no matched suffix). The full shift is 1, so
`s` advances to 1 — where the match is found.

## Implementation notes

- `build_bad_char` builds a table of `(char, last_index)` pairs
  excluding the last char of the pattern.
- `build_good_suffix` is `O(m^2)` per suffix length, `O(m^3)`
  total in this naive implementation. Production implementations
  compute it in `O(m)` via Z-algorithm preprocessing on the
  reversed pattern.
- The search loop compares right-to-left, then computes both
  shifts and takes the max.
- Overlapping matches are found by shifting by 1 after a
  successful match (rather than by the good-suffix shift for
  the full-pattern-match case).

## Sanity assertions

The example ends with `assert_eq` checks verifying all four
search results.

## See also

- `boyer_moore.ae` — the Horspool variant (bad-char only).
- `string_match_kmp.ae` — Knuth-Morris-Pratt, a different
  sub-linear string search.
