# string_match_kmp.ae

KMP (Knuth–Morris–Pratt) string matching. We precompute the LPS
(longest proper prefix which is also suffix) table for the
pattern, then scan the text in a single pass, using the table to
skip ahead on mismatches. We print every starting index at which
the pattern occurs in the text.

## What it does

1. **`charAt(s, i)`** — return the single-character string at
   index `i` of `s` (wraps `str(s[i])`).
2. **`build_lps(pattern)`** — compute the LPS table.
   `lps[i]` is the length of the longest proper prefix of
   `pattern[0..=i]` that is also a suffix of `pattern[0..=i]`.
   Standard two-pointer construction: walk `i` from 1, compare
   `pattern[i]` with `pattern[length]`; on match, extend; on
   mismatch, fall back via `lps[length - 1]`.
3. **`kmp(text, pattern)`** — scan the text in a single pass.
   Maintain `i` (text index) and `j` (pattern index). On match,
   advance both. If `j == m`, record a match at `i - j` and
   reset `j = lps[j - 1]`. On mismatch, fall back via `lps` or
   advance `i`.
4. **`show(arr)`** — pretty-print an int array.
5. **Driver** — runs KMP on 7 (text, pattern) pairs and prints
   the LPS table and match list for each.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/string_match_kmp.ae
```

## Key language features

- **`str(s[i])`** — extract a single character as a string for
  comparison. Aether has no char type; chars are 1-char strings.
- **Mutable array element assignment** (`lps[i] = length`) —
  Aether lets you mutate array elements in place.
- **`if c1 == c2 { ... } else { ... };`** — chained if/else with
  `;` before another statement (required by the parser).
- **`while` loops** for the LPS construction and the text scan —
  sidesteps the for-loop-scope quirk.

## Expected output

```
== KMP string matching ==

  text:    abcabcabcababc
  pattern: abc
  lps:     [0, 0, 0]
  matches: [0, 3, 6, 11]

  text:    aaaaaaa
  pattern: aaa
  lps:     [0, 1, 2]
  matches: [0, 1, 2, 3, 4]

  text:    hello world
  pattern: o
  lps:     [0]
  matches: [4, 7]

  text:    mississippi
  pattern: issi
  lps:     [0, 0, 0, 1]
  matches: [1, 4]

  text:    abababab
  pattern: abab
  lps:     [0, 0, 1, 2]
  matches: [0, 2, 4]

All assertions passed.
```

## Design notes

- KMP is `O(n + m)` — single pass through the text, with the LPS
  table letting us skip backtracking. Compare to naive matching,
  which is `O(n * m)` in the worst case (e.g., text `"aaaaaaa"`
  with pattern `"aaa"`).
- The LPS table tells you the longest prefix of the pattern that
  is also a suffix of the pattern up to position `i`. When a
  mismatch occurs at pattern position `j`, you can skip back to
  `lps[j - 1]` rather than restarting from 0.
- The "aaaaaaa" / "aaa" case shows overlapping matches: every
  position from 0 to 4 is a match (since "aaa" overlaps with
  itself by 2 chars). Naive matching would also find these but
  with `O(n*m)` comparisons.
- Compare to `kmp_search.ae` (already in the repo) which uses
  the same algorithm but a slightly different code layout.
