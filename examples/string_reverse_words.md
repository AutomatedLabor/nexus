# string_reverse_words.ae

Reverses the WORDS in a sentence — keeps each word's characters in
their original order, but reverses the order of the words.

```
"hello world foo"  -> "foo world hello"
"the quick brown fox" -> "fox brown quick the"
```

## What it does

Pipeline:

1. **`char_array(s)`** — builds a `[string]` of single chars from
   `s` via a `while` loop and `push`.
2. **`append_word(arr, w)`** — small helper that pushes a word
   onto the array and returns the array.
3. **`split_words(s)`** — uses `reduce` over the char array with
   a `(string, [string])` tuple accumulator. On a space we flush
   the current word to the list (if non-empty); on a non-space we
   append to the current word. After `reduce`, flushes any final
   word.
4. **`prepend(arr, x)`** — builds a new array with `x` at the
   front and `arr` after. Used for the reverse step (since `push`
   appends, not prepends).
5. **`reverse_words_array(words)`** — `reduce` with `prepend`
   to reverse the word array.
6. **`join_with_space(arr)`** — `reduce` to join the reversed
   words with single spaces.
7. **`reverse_words(s)`** — the public API: split, reverse, join.
8. **Driver** — runs `reverse_words` on a list of sample
   sentences, plus a pipeline demo that shows the intermediate
   split and reverse steps for one example.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/string_reverse_words.ae
```

## Key language features

- **`reduce` with a tuple accumulator** `(string, [string])` for
  the split step — same pattern as `count_words.ae`, but with
  different output (we want the word list, not just its length).
- **`reduce` with `prepend` to reverse an array** — the canonical
  pattern for reversing an array without mutation. The
  `prepend` helper builds a new array each call; the cost is
  O(n²), but it's clean and correct.
- **`reduce` to join with a separator** — `if acc == "" { w }
  else { acc + " " + w }` is the standard idiom for "join with
  space, no leading/trailing space".
- **`while` loop with `push`** in `char_array` and `prepend`.

## Expected output

```
== Reverse words in a sentence ==

  "hello world foo" -> "foo world hello"
  "the quick brown fox" -> "fox brown quick the"
  "  one  two   three " -> "three two one"
  "solo" -> "solo"
  "" -> ""
  "a b c d e" -> "e d c b a"
  "first last" -> "last first"

Pipeline demo for "hello world foo":
  split into words: ["hello", "world", "foo"]
  reversed:         ["foo", "world", "hello"]
  joined:           "foo world hello"

All assertions passed.
```

## Design notes

- The `prepend` helper is O(n) per call (it builds a new array by
  walking the existing one and pushing each element after the new
  one), so `reverse_words_array` is O(n²) overall. For small
  word lists (which is what we have) this is fine; for large lists
  a two-pointer in-place reverse would be better, but that
  requires mutation and is less idiomatic.
- The `split_words` step collapses multiple consecutive spaces
  (via the `if cur == "" { state } else { ... }` check), so
  "  one  two   three " splits into exactly 3 words.
- The empty-string case returns `""` (split gives `[]`, reverse
  gives `[]`, join gives `""`), which is what we want.
