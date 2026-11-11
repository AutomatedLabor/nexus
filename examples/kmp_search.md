# kmp_search.ae

Knuth–Morris–Pratt string search. Finds every occurrence of a
pattern `pat` inside `text` in `O(|text| + |pat|)` time,
returning the list of starting indices.

## What it does

1. **`zeros(n)`** — fresh array of `n` zeros.
2. **`build_lps(pat)`** — the KMP prefix table (a.k.a. the
   "longest-prefix-suffix" or "failure" array). `lps[i]` =
   the length of the longest proper prefix of `pat[0..=i]`
   that is also a suffix of `pat[0..=i]`. Two-pointer
   construction: `i` walks forward through `pat`, `j` tracks
   the current matched-prefix length. On mismatch with `j > 0`,
   jump `j = lps[j-1]` (the failure link). On match, `j++`.
3. **`kmp_search(text, pat)`** — scan `text` with the same
   failure-link trick. When a full match is found, push
   `i - j + 1` and continue via `j = lps[j-1]` (so overlapping
   matches like `"aaa"` in `"aaaa"` find both occurrences).
4. **Driver** — searches `"abc"` in `"abcabcabcababc"`
   (matches at indices `[0, 3, 6, 11]`), and `"aaa"` in
   `"aaaaaaa"` (overlapping matches at `[0, 1, 2, 3, 4]`).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/kmp_search.ae
```

## Key language features

- **`str(s[i]) == str(p[j])`** for char comparison — string
  indexing returns a `char` that the type checker treats
  distinctly from a 1-char `string`; at runtime both are JS
  single-char strings, so the comparison works either way.
- **Inner `while` loop with failure-link jumps** —
  implemented with a `mut matched` flag and a `while (!matched)
  && (j > 0)` body, since Aether has no labeled break.
- **`while` loops** throughout — avoids the for-loop-scope
  quirk.

## Expected output

```
== KMP string search ==

text:      "abcabcabcababc"
pattern:    "abc"
lps table: [0, 0, 0]
matches:   [0, 3, 6, 11]

text:      "aaaaaaa"
pattern:    "aaa"
lps table: [0, 1, 2]
matches:   [0, 1, 2, 3, 4]  (overlapping)

All assertions passed.
```

## Design notes

- For the headline text `"abcabcabcababc"`, matches of
  `"abc"` occur at positions 0, 3, 6, and 11 — but NOT at
  position 9, because `text[9..11]` is `"aba"`, not `"abc"`.
- The `lps` table for `"aaa"` is `[0, 1, 2]`: the prefix
  `"a"` of length 1 is also a suffix of `"aa"`, the prefix
  `"aa"` of length 2 is also a suffix of `"aaa"`. This is
  what lets KMP find overlapping matches in `"aaaaaaa"`.
- The inner while-loop structure with `mut matched` is a
  workaround for Aether's lack of labeled break, since a
  naive `while j > 0 && text[i] != pat[j]` would short-
  circuit incorrectly when `j == 0`.
