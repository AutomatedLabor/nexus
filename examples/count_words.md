# count_words.ae

Word count for a string. Implements `split` on whitespace via
`reduce`, then reports `len(words)`. Multiple consecutive spaces
collapse; leading/trailing spaces are ignored.

## What it does

1. **`char_array(s)`** — builds a `[string]` of single chars from
   `s` via a `while` loop and `push`.
2. **`append_word(arr, w)`** — small helper that pushes a word
   onto the array and returns the array (since `push` itself
   returns unit).
3. **`split_words(s)`** — the heart of the program. Uses `reduce`
   over the char array with a `(string, [string])` tuple
   accumulator: the current word being built, and the list of
   completed words. On a space we flush the current word to the
   list (if it's non-empty); on a non-space we append to the
   current word. After `reduce`, we flush any final word.
4. **`word_count(s)`** — `len(split_words(s))`.
5. **`show_words(arr)`** — renders the word list as
   `["a", "b", "c"]` via `reduce`.
6. **Driver** — runs split_words on a handful of sample sentences
   and prints the word list plus count.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/count_words.ae
```

## Key language features

- **`reduce` with a tuple accumulator** — `(string, [string])`.
  Tuple access uses `state.0` and `state.1`. This is the canonical
  pattern for stateful iteration when you can't use `for` (the
  for-loop-scope quirk) and want a single-pass walk.
- **`push` to append to a `[string]`** — `append_word` wraps
  `push` to return the array (push returns unit).
- **`while` loop with `push`** in `char_array`.
- **`len(s)` and `str(s[i])`** to walk a string char by char.
- **Empty-string handling** — if `cur == ""` when we hit a space,
  we don't push an empty word; this collapses multiple
  consecutive spaces.

## Expected output

```
== Word count (split via reduce) ==

  ["the", "quick", "brown", "fox"]
    -> word count = 4
  ["one", "two", "three"]
    -> word count = 3
  []
    -> word count = 0
  ["solo"]
    -> word count = 1
  ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
    -> word count = 10
  ["hello", "world", "foo"]
    -> word count = 3

All assertions passed.
```

## Design notes

- The `(current_word, words_so_far)` tuple accumulator is a
  common Aether idiom for split-like operations: it lets you
  carry state through a `reduce` without falling back to `let
  mut`. The `current_word` is the "in-progress" word; the
  `words_so_far` is the "completed" list.
- We handle whitespace other than `' '` (`\t`, `\n`) by treating
  them as word separators too, so "hello\tworld\nfoo" splits
  correctly into three words.
- The post-`reduce` flush (`if final_cur == "" { final_words }
  else { append_word(final_words, final_cur) }`) is essential —
  without it, the last word of every input would be dropped.
