# aether-string-search

> String-search algorithms for the Aether language — 10 pure functions covering the classic exact-substring-matching algorithms (naive, KMP, Boyer-Moore simplified, Rabin-Karp), their helper computations (LPS array, Z array), and the common "all matches" / "count occurrences" / "longest prefix that is also a suffix" utilities.

`aether-string-search` is a user-space Aether package collecting the canonical substring-matching algorithms that show up in every algorithms textbook. The implementations are intentionally textbook-faithful: each function is a single ~30-line block of Aether that mirrors the pseudocode in CLRS or Sedgewick — no host primitives, no FFI, no shortcuts. If you can read the algorithm in pseudocode, you can read it in Aether.

## Why a string-search package?

Aether's core doesn't ship any string-search beyond what's needed for the lexer (and even there, the lexer uses host JS `.indexOf`). For application code that needs to find a substring — log scraping, simple parsers, data extraction — the question is which algorithm to use:

- **Naive** — O(n·m) worst case but the lowest constant factor. Wins for small patterns on small texts.
- **KMP** — O(n+m) worst case. Best when the pattern has lots of internal periodicity (e.g. `"ababab..."`) that would trip up the naive matcher.
- **Boyer-Moore (simplified, bad-character)** — O(n/m) average, O(n·m) worst. Best in practice for medium-length patterns over large alphabets (English text).
- **Rabin-Karp** — O(n+m) average. Best when you want to find *multiple* patterns at once (each pattern contributes a separate hash to a set), though this package only implements the single-pattern variant.

The package lets the caller pick the right tool without writing the algorithm from scratch each time.

The package also exposes the **LPS array** (the prefix-suffix table KMP uses) and the **Z array** (a closely-related structure) as standalone exports, because they're useful well beyond KMP:

- The LPS array's last entry is the longest proper prefix of `s` that's also a suffix of `s` — useful for parsing cyclic strings and for compression.
- The Z array tells you, for every position `i`, the length of the longest substring starting at `i` that's also a prefix of `s` — useful for finding repeats and for the Z-algorithm pattern matching (concatenate `pat + "$" + text`, compute Z, look for entries equal to `len(pat)`).

## API

All 10 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they never mutate their inputs and operate on ASCII-range strings (the `charCode` builtin returns 0..65535, so non-ASCII code units work too but case-sensitivity is bytewise). Iteration uses `while` with explicit indices to avoid the v1 evaluator's for-loop-scope quirk.

### The four matchers

| Function | Signature | Description |
| --- | --- | --- |
| `naiveMatch(text, pat)` | `(string, string) -> int` | Brute-force O(n·m) search. Returns first index of `pat` in `text`, or -1 if not found. Empty `pat` always matches at 0. |
| `kmpMatch(text, pat)` | `(string, string) -> int` | KMP search using the LPS array. O(n+m) worst case. Same return semantics as `naiveMatch`. |
| `boyerMooreMatch(text, pat)` | `(string, string) -> int` | Boyer-Moore with the bad-character heuristic only (no good-suffix table). O(n/m) average, O(n·m) worst. |
| `rabinKarpMatch(text, pat)` | `(string, string) -> int` | Rabin-Karp rolling-hash search. Polynomial hash (base 256, modulus 2³¹-1) with explicit substring verification on hash hit (no false positives). |

All four matchers share the same `(text, pat) -> int` contract — they're drop-in interchangeable, and the test suite verifies that all four return the same answer on a shared set of inputs. Empty patterns match at index 0; patterns longer than the text return -1.

### The two helper computations

| Function | Signature | Description |
| --- | --- | --- |
| `computeLps(pat)` | `(string) -> [int]` | KMP's LPS array. `lps[i]` = length of the longest proper prefix of `pat[0..i+1]` that's also a suffix. `lps[0]` is always 0. |
| `zAlgorithm(s)` / `computeZ(s)` | `(string) -> [int]` | Z array. `z[i]` = length of the longest substring starting at `i` that's also a prefix of `s`. `z[0]` is 0 by convention. `computeZ` is an alias for `zAlgorithm`. |

The LPS array is built with the standard two-pointer walk: maintain `len` (the current match length) and `i` (the position being computed), and either extend, fall back to `lps[len-1]`, or reset. The Z array uses the "Z-box" optimization: maintain `[l, r]` (the rightmost Z-box), and either copy the mirror value (when `i + z[i-l] < r`) or extend manually.

### The three utilities

| Function | Signature | Description |
| --- | --- | --- |
| `findAll(text, pat)` | `(string, string) -> [int]` | All starting indices of **non-overlapping** matches (matches consume their characters; the next search starts after the previous match ends). Uses KMP-style scanning. |
| `countOccur(text, pat)` | `(int)` | `len(findAll(text, pat))`. Counts non-overlapping occurrences. |
| `longestPrefixSuffix(s)` | `(string) -> int` | Length of the longest proper prefix of `s` that's also a suffix of `s`. Computed as `lps[len(s)-1]`. |

`findAll` returns *non-overlapping* matches: `findAll("aaaa", "aa")` returns `[0, 2]`, not `[0, 1, 2]`. This matches Python's `str.count` semantics and is the most common interpretation. For overlapping matches, use the Z-algorithm trick (concatenate `pat + "$" + text`, compute Z, and scan for entries equal to `len(pat)`).

## How to use

### As a dependency

Add `aether-string-search` to your project's `aether.toml`:

```toml
[dependencies]
aether-string-search = "0.1.0"
```

Then in your Aether source:

```aether
import { kmpMatch, findAll, countOccur } from "aether-string-search";

let text = "the quick brown fox jumps over the lazy dog";
print(kmpMatch(text, "fox"));       // 16
print(findAll("abcabcabc", "abc")); // [0, 3, 6]
print(countOccur("aaaa", "aa"));    // 2
```

### Running the test suite

```sh
aether test aether-packages/aether-string-search/tests
# PASS aether-packages/aether-string-search/tests/tests.ae
# 1 passed, 0 failed
```

The test file (`tests/tests.ae`) contains 25+ `assert_eq` cases covering every `pub fn`. Every matcher is tested on the same inputs so the four matchers are cross-checked against each other.

### Running the example

```sh
aether run aether-packages/aether-string-search/examples/example.ae
```

The example exercises every function with a small input, producing a snapshot of expected outputs.

## Design notes

### Why "simplified" Boyer-Moore?

The full Boyer-Moore algorithm uses *two* heuristics: the bad-character rule (shift by the last occurrence of the mismatched character in the pattern) and the good-suffix rule (shift by the next occurrence of the matched suffix elsewhere in the pattern). The good-suffix rule requires a separate preprocessing pass that's roughly the same complexity as the LPS array, and the resulting code is harder to read.

The simplified variant (bad-character only) gets most of the real-world speedup (Boyer-Moore is famous for being sublinear on natural-language text, and that's almost entirely thanks to the bad-character rule), at the cost of O(n·m) worst case (the full algorithm is O(n+m) worst case via the good-suffix rule). The package ships the simplified variant for readability; callers who need the worst-case guarantee should use `kmpMatch` instead.

### Why a polynomial rolling hash for Rabin-Karp?

The polynomial hash `h(s) = sum(s[i] * base^(m-i-1)) mod modulus` is the textbook choice. Base 256 lets us treat the string as a base-256 number (one byte = one digit), and modulus 2³¹-1 (a Mersenne prime) keeps intermediate values in 31-bit range so we never overflow JavaScript's safe-integer range (2⁵³).

The roll update — `h' = ((h - out_char * base^(m-1)) * base + in_char) mod modulus` — is a single multiplication and addition per character, so Rabin-Karp's per-character cost is constant. The package verifies with `substr_eq_at` on hash match to avoid false positives.

### Why non-overlapping `findAll`?

Two interpretations of "find all matches" are reasonable:

1. **Non-overlapping** (chosen). `findAll("aaaa", "aa") = [0, 2]`. Each match consumes its characters; the next search starts after the previous match ends. Matches Python's `str.count`.
2. **Overlapping**. `findAll("aaaa", "aa") = [0, 1, 2]`. Every starting position that begins a match is returned. Matches `re.finditer` in Python with lookahead.

Non-overlapping is the more common interpretation for "count how many times this word appears" use cases (you don't want to count "aa" as appearing 3 times in "aaaa"). For overlapping matches, the Z-algorithm approach gives you a one-line alternative.

## Future work

- A `kmpSearchAll` variant that returns *overlapping* matches for callers who want that semantics.
- A `boyerMooreFull` implementation that adds the good-suffix table for the O(n+m) worst-case guarantee.
- A `multiPatternRabinKarp` that takes an array of patterns and uses a single hash set, the canonical Rabin-Karp use case (virus-scanner-style multi-pattern scanning).

## License

MIT — same as the Aether language.
