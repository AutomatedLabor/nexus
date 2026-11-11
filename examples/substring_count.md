# substring_count.ae

Count occurrences of a pattern string inside a text string. We
count overlapping occurrences (every index where the pattern
matches, including overlapping ones), since that's the more
general answer and the one that naturally falls out of a naive
scan.

## What it does

1. **`substr_eq(text, i, pat)`** — compare
   `text[i..i+len(pat)]` with `pat`, char by char. Returns
   `1` if all `len(pat)` characters match, `0` otherwise.
2. **`count_substrings(text, pat)`** — at each starting
   position `i` in `[0, len(text) - len(pat) + 1)`, call
   `substr_eq` and increment the counter on a match. Empty
   pattern is the degenerate case; we define
   `count(pat == "") = 0` (one could argue it should be
   `len(text)+1`, but for our purposes 0 is cleaner).
3. **Driver** — runs the counter on a variety of samples,
   including overlapping cases (`"aaaaaaa" ~ "aa"` finds 6
   matches at `[0, 1, 2, 3, 4, 5]`).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/substring_count.ae
```

## Key language features

- **`while` loops** for both the outer starting-position
  sweep and the inner char-by-char comparison — sidesteps
  the for-loop-scope quirk.
- **`mut ok` early-exit flag** in `substr_eq` (instead of
  a `break`) — short-circuits the inner loop on the first
  mismatch. Aether's `break` would also work inside a while
  loop, but the flag form is more explicit.
- **`int` return type for `substr_eq`** (`1`/`0` rather
  than `bool`) — Aether v1's type checker is more
  comfortable with `int` returns in some patterns.

## Expected output

```
== Substring count (overlapping) ==

  "ababcabab"  ~  "ab"  ->  count = 4
  "aaaaaaa"  ~  "aa"  ->  count = 6
  "hello world"  ~  "o"  ->  count = 2
  "hello world"  ~  "xyz"  ->  count = 0
  "mississippi"  ~  "ss"  ->  count = 2
  "mississippi"  ~  "issi"  ->  count = 2
  "the quick brown fox"  ~  " "  ->  count = 3
  "abc"  ~  ""  ->  count = 0
  ""  ~  "abc"  ->  count = 0

Headline: count("ab" in "ababcabab") = 4

All assertions passed.
```

## Design notes

- The headline case `"ababcabab"` has `"ab"` matches at
  positions 0, 2, 5, 7 — total 4. Position 9 onwards
  doesn't start `"ab"` (text[9..11] would be `"ab"` but
  text has only 9 chars, so position 8 is the last
  candidate — `text[8..10]` = `"ab"` if len(text) >= 10,
  but here text has 9 chars so we stop at position 7).
  Wait — let me recount: `"ababcabab"` is 9 chars.
  Positions 0, 2, 5, 7 give `"ab"`. Position 8 would
  give `"b" + ?` which is too short. So 4 matches.
- The overlapping count for `"aaaaaaa" ~ "aa"` is 6, not
  the non-overlapping count of 3. The encoder in
  `kmp_search.ae` finds the same overlapping matches.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
