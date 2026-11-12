# rabin_karp_rolling — Rabin-Karp with Rolling Hash

Rabin-Karp string search using a **rolling hash**: search for
`"abc"` in `"abcabcabc"` and report all match positions.

## What it does

Computes a polynomial hash of the pattern (`"abc"`) and slides
a window of the same length across the text (`"abcabcabc"`).
At each position, the hash is updated in `O(1)` from the
previous hash by subtracting the contribution of the outgoing
char and adding the contribution of the incoming char. When the
window hash equals the pattern hash, a character-by-character
comparison confirms the match (to rule out hash collisions).

## Why rolling?

Without the rolling update, Rabin-Karp would be `O(n*m)` —
you'd re-hash each window from scratch. With the rolling
update, it's `O(n + m)` expected time (plus the cost of the
collision-verification comparisons, which is `O(n)` amortized
under a reasonable hash function).

## The hash function

```
H(s) = sum_{i=0}^{|s|-1} s[i] * BASE^(|s|-1-i)  mod PRIME
```

with `BASE = 256` (char codes) and `PRIME = 1000000007` (a
large prime). The rolling update is:

```
H(new) = ((H(old) - out_char * BASE^(m-1)) * BASE + in_char) mod PRIME
```

where `out_char` is the char leaving the window and `in_char`
is the char entering. The `BASE^(m-1)` term is precomputed once
per search (via fast exponentiation in `mod_pow`).

## Output

```
== Rabin-Karp with rolling hash ==

pattern: "abc"
text:    "abcabcabc" (length 9)

matches at positions: [0, 3, 6]

rolling-hash trace:
  pattern hash: 6382179
  window [0, 3): hash=6382179 == pattern_hash
  window [1, 4): hash=6447969 != pattern_hash
  window [2, 5): hash=6512994 != pattern_hash
  window [3, 6): hash=6382179 == pattern_hash
  ...
```

The rolling-hash trace shows that the hash matches at
positions 0, 3, and 6 — the three occurrences of `"abc"` in
`"abcabcabc"`. Note that the window hashes 6382179, 6447969,
and 6512994 are all different (no collisions); the rolling
update correctly computes each from the previous.

## Implementation notes

- `mod_pow` uses fast exponentiation (square-and-multiply) to
  compute `BASE^(m-1) mod PRIME` in `O(log m)` time.
- All hash arithmetic is done modulo `PRIME` to keep the
  numbers small; we use the non-negative modulo (the `%`
  operator in Aether can return negative for negative
  operands; we add `PRIME` if needed).
- `eq_at` is the character-by-character comparison used to
  verify hash matches (to rule out collisions).

## Sanity assertions

The example verifies:
- the main search: `"abc"` in `"abcabcabc"` returns `[0, 3, 6]`;
- `"world"` in `"hello world"` returns `[6]`;
- `"a"` in `"aaa"` returns `[0, 1, 2]` (overlapping single-char matches);
- `"xyz"` in `"abcdef"` returns `[]` (no match);
- pattern longer than text returns `[]`.

## See also

- `rabin_karp.ae` — the basic (non-rolling) variant.
- `string_match_kmp.ae` — Knuth-Morris-Pratt, a deterministic
  `O(n+m)` string search (no hash collisions).
