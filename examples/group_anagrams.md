# group_anagrams.ae

Group anagrams: given a list of strings, group them by their
sorted-letter signature.

## What it does

1. **`sig(s)`** — compute the letter-count signature of `s` as
   a 26-int array (one count per letter a..z). We use `charCode`
   to get the ASCII code of each char.
2. **`arr_eq(a, b)`** — element-wise int-array equality.
3. **`group_anagrams(words)`** — walk the input list, maintain a
   table of `(signature, words_in_group)` pairs in two parallel
   arrays (`group_sigs`, `group_words`). For each word, find an
   existing group with matching signature or create a new one.
   Returns a flat `[size0, w0_0, w0_1, ..., size1, w1_0, ...]`
   layout for easy printing.
4. **`show_groups(flat)`** — pretty-printer that walks the flat
   layout and renders it as `[[eat, tea, ate], [tan, nat], [bat]]`.
5. **Driver** — groups three input lists (the canonical LeetCode
   example, a custom set, and a single-char set), then asserts
   that signatures match and the total word count is preserved.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/group_anagrams.ae
```

## Key language features

- **Nested arrays `[[int]]` and `[[string]]`** — Aether's nested
  array typing is finicky in the v1 evaluator (type warnings about
  the empty `[]` literal not unifying with `[[int]]`), so the
  type warnings are non-blocking.
- **`charCode(s, i)` builtin** — get the ASCII code of the char
  at position `i` in `s` (a working builtin in the v1 evaluator).
- **Parallel-array group table** — rather than a `Map<sig, words>`,
  we use two aligned arrays (`group_sigs` and `group_words`) so
  the type-checker doesn't need to model `Map<[int], [string]>`.
- **`int(flat[i])`** — string-to-int conversion to read the size
  header at the start of each group in the flat layout.

## Expected output

```
== Group anagrams ==

  [[eat, tea, ate], [tan, nat], [bat]]

  [[hello, olleh], [world, ldrow], [abc, cab, bac]]

  [[a, a], [b], [c]]

All assertions passed.
```

## Design notes

- The signature-based approach is O(N*K) where N is the number
  of words and K is the max word length — better than the
  O(N * K log K) sort-each-word approach for very long words.
- The flat output layout `[size0, w0_0, ...]` lets the
  pretty-printer walk it with a single index without needing to
  parse nested-array literals back into Aether values.
- The runtime is correct; the v1 evaluator emits non-blocking
  type warnings for the nested-array literals which don't
  affect execution.
