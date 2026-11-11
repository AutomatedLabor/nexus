# title_case.ae

Convert a string to title case: every whitespace-separated word
starts with an uppercase letter, and the remaining letters are
lowercase. Punctuation and digits pass through; only letters are
re-cased.

## What it does

1. **`find_pos(c, alphabet)`** — linear scan of `c` in
   `alphabet`, returns the index (or -1).
2. **`to_upper_char(c)` / `to_lower_char(c)`** — case
   conversion by walking the lowercase (or uppercase) alphabet
   and substituting. Non-letters pass through unchanged.
3. **`title_case(s)`** — walk `s` with a state machine:
   - `mut at_start` flag tracks whether the next character
     is the first of a word.
   - After whitespace, set `at_start = true`; after any other
     character, set it to false.
   - If `at_start`, uppercase the character; otherwise,
     lowercase it.
4. **Driver** — runs `title_case` on a variety of samples
   including already-title-case, all-caps, snake_case, and
   leading/trailing whitespace.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/title_case.ae
```

## Key language features

- **State machine** with `let mut at_start` — the canonical
  pattern for "first letter of each word gets special
  treatment."
- **Lookup string + `str(ALPHABET[i])`** for case conversion
  (Aether v1 has no `to_upper` builtin).
- **`while` loop with a single `i` counter** — simple,
  predictable, and avoids the for-loop-scope quirk.

## Expected output

```
== Title case ==

  "hello world foo"
    -> "Hello World Foo"
  "the QUICK brown FOX"
    -> "The Quick Brown Fox"
  "a"
    -> "A"
  ""
    -> ""
  "ALLCAPS"
    -> "Allcaps"
  "snake_case_string"
    -> "Snake_case_string"
  "  leading and trailing  "
    -> "  Leading And Trailing  "
  "the quick brown fox jumps over the lazy dog"
    -> "The Quick Brown Fox Jumps Over The Lazy Dog"

All assertions passed.
```

## Design notes

- Note that `snake_case_string` becomes
  `Snake_case_string` — the underscore is not whitespace,
  so it doesn't trigger the "start of word" flag. A more
  sophisticated title-case function would treat underscores
  as word separators too, but our definition is
  intentionally narrow (whitespace-only).
- The state machine handles every character exactly once,
  so the runtime is `O(len(s))`. No regex backtracking, no
  hidden quadratic behavior.
- Whitespace is preserved exactly — leading, trailing, and
  multiple spaces all pass through unchanged. Only the
  letters' case is modified.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
