# string_utils.ae

Five small string algorithms implemented in pure Aether using only
the inline builtins (`len`, `str`, `push`, `assert_eq`, `print`):

```
reverse(s)           -> string          "hello" -> "olleh"
is_palindrome(s)     -> bool            "racecar" -> true
word_count(s)        -> int             "a b c" -> 3
capitalize(s)        -> string          "hello" -> "Hello"
run_length_encode(s) -> string          "aaabb" -> "a3b2"
```

## What it does

1. **`reverse(s)`** — walks the string from the back to the front,
   appending each char to an accumulator string. O(n) time, O(n)
   space (every append re-allocates).
2. **`is_palindrome(s)`** — a string is a palindrome iff it equals
   its reverse. One-liner delegating to `reverse`.
3. **`word_count(s)`** — counts runs of non-whitespace chars. A `mut
   in_word` flag tracks whether we're inside a word; on the first
   non-space char after a space, we bump the count. Multiple
   consecutive spaces don't count as extra words.
4. **`capitalize(s)`** — uppercases the first ASCII a-z character,
   leaves the rest unchanged. We use a lookup-table approach: a
   `LOWER` string of all 26 lowercase letters and an `UPPER` string
   of all 26 uppercase letters, indexed by position. `to_upper_char`
   scans `LOWER` for the char and returns `UPPER[i]` on a match; non-
   letters pass through.
5. **`run_length_encode(s)`** — collapses runs of identical chars
   into `"cN"` pairs (`"aaabb" → "a3b2"`). Walks the string tracking
   the current run char and run length; when the char changes, we
   flush `"cN"` to the output and start a new run.

The driver prints a small test table for each function and runs
`assert_eq` checks on the most important cases.

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /home/z/my-project/verify_one.ts /home/z/my-project/examples/string_utils.ae
```

## Key language features

- **`str(s[i])`** — string indexing. The type checker reports `char`
  but the runtime value is a 1-char string; we wrap with `str(...)`
  to satisfy the type system and to be explicit about the conversion.
- **`while i < len(s)` loops** — the canonical iteration pattern
  when we need an index alongside the value (or in `reverse`, when we
  need to walk backwards).
- **`let mut out = ""`** for string accumulation — strings in Aether
  are immutable JS strings, so `out = out + c` re-allocates each
  time. For these short examples the cost is negligible; a production
  version would use a string builder if Aether grew one.
- **Lookup tables** — `LOWER` and `UPPER` are top-level `let`
  bindings holding the 26-letter alphabets. `to_upper_char` scans
  `LOWER` for the input char and returns `UPPER[i]` at the matching
  index. This is the v1-friendly substitute for a `case` statement or
  a `+ 'A' - 'a'` arithmetic-on-chars trick (Aether doesn't have
  `char` arithmetic).
- **`assert_eq` on strings** — the inline builtin deep-compares two
  values, panicking on mismatch. Used at the bottom of the program
  to lock in the contracts.

## Expected output

```
== String utilities in pure Aether ==

reverse:
  reverse("hello")       = "olleh"
  reverse("Aether")      = "rehetA"
  ...
is_palindrome:
  "racecar" -> true
  "noon"    -> true
  "hello"   -> false
word_count:
  "the quick brown fox" -> 4
  "  one  two   three "  -> 3
capitalize (ASCII a-z only):
  capitalize("hello")   = "Hello"
run_length_encode:
  "aaabb"    -> "a3b2"
  "aabbbaa"  -> "a2b3a2"

All assertions passed.
```

## Design notes

- **No `char` type, no `case` statement** — Aether v1 has neither.
  We work around with `str(s[i])` (which gives a 1-char string at
  runtime) and nested `if/else if` chains for dispatch.
- **The lookup-table trick for case conversion** is the v1-friendly
  approach to "do an operation per character of the alphabet". It's
  verbose but unambiguous and easy to extend.
- **`run_length_encode` flushes the final run** after the while loop
  exits — the trailing `out + run_char + str(run_len)` is a tail
  expression returning the accumulated result, not a `push` mutation.
- **Multiple consecutive spaces don't create phantom words** because
  `in_word` only flips `false → true` once per word. This matches the
  common `wc -w` shell utility.
- The whole program is **pure** — no mutation of input data, no
  global state beyond the two lookup-table constants. Each function
  returns a fresh value, which is the canonical Aether style for
  string algorithms.
