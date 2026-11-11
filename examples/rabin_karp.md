# rabin_karp.ae

Rabin–Karp string search using a rolling polynomial hash. Find
every occurrence of `pat` inside `text` in expected
`O(|text| + |pat|)` time. Each window's hash is updated in
`O(1)` by removing the contribution of the leftmost char and
adding the new right char.

## What it does

1. **`char_code(c)`** — map a single-char string to a
   numeric code by linear scan of the custom alphabet
   `" abcdefghijklmnopqrstuvwxyz..."`. Aether v1 has no
   `ord()` builtin, so this is the workaround.
2. **`substr_eq(text, start, pat)`** — verify a candidate
   match by comparing `pat` against the substring char-by-char.
3. **`rabin_karp(text, pat)`** — the rolling hash:
   - `pat_hash = sum_{i=0}^{n-1} pat[i] * B^(n-1-i) mod M`
   - `win_hash` for the first window of `text` (same formula)
   - Precompute `B^(n-1) mod M` once.
   - At each step, roll: `win = ((win - left*B^(n-1))*B + right) mod M`,
     fix negative mod with a `while win < 0` loop.
   - On hash match, verify with `substr_eq` before recording
     the index (cheap insurance against false positives).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/rabin_karp.ae
```

## Key language features

- **`str(text[k])` for single-char extraction** from a
  string.
- **`int(...)` and `%` modulo** to keep hashes bounded; the
  `while win_hash < 0 { win_hash += M }` loop fixes
  Aether's modulo behavior on negatives.
- **`let mut win_hash` referenced after the main while
  loop** — fine for `while`, dodges the for-loop-scope quirk.

## Expected output

```
== Rabin-Karp string search ==

text:    "hello world foo world"
pattern: "world"
matches: [6, 16]

  "abcabcabcababc" ~ "abc" -> [0, 3, 6, 11]
  "aaaaaaa" ~ "aa" -> [0, 1, 2, 3, 4, 5]
  "hello world" ~ "xyz" -> []
  "single" ~ "single" -> [0]

All assertions passed.
```

## Design notes

- The base `B = 256` and modulus `M = 1e9+7` are the
  textbook choices — large enough to make collisions
  astronomically unlikely for short patterns, small enough
  to keep the products inside float64's safe-integer range
  (`B * M = 2.56e11 < 2^53`).
- Hash collisions are *possible* (though vanishingly rare
  here); we always verify with `substr_eq` before recording
  a match. This is the standard Rabin–Karp correctness
  guarantee.
- We use a custom alphabet rather than ASCII codes because
  Aether v1 has no `ord()`/`chr()` builtins. The
  collision probability is unaffected.
- The runtime rolls in `O(m - n + 1)` after the `O(n)`
  precompute step — much better than the naive
  `O(m * n)` substring comparison.
