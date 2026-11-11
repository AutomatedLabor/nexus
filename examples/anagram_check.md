# anagram_check.ae

Checks whether two strings are anagrams: same multiset of
characters, possibly in a different order. Canonicalizes each
string by lowercasing, stripping non-letters, and sorting the
chars, then compares the canonicalized forms.

```
"listen"  / "silent"   -> true
"hello"   / "world"    -> false
"dormitory" / "dirty room" -> true  (spaces stripped before compare)
```

## What it does

1. **`char_array(s)`** — builds a `[string]` of single chars from
   `s` via a `while` loop and `push`.
2. **`to_lower_char(c)`** — case conversion via a hardcoded
   LOWER alphabet and a linear search.
3. **`to_lower(s)`** — fold the char array with `to_lower_char`
   via `reduce`.
4. **`take_str` / `drop_str`** — slice a `[string]` array by
   index.
5. **`merge(left, right)`** — two-finger merge of two sorted
   `[string]` arrays.
6. **`merge_sort_chars(arr)`** — recursive merge sort on a
   `[string]` of chars. Uses `int(len(arr) / 2)` to truncate the
   midpoint (Aether's `/` is float division).
7. **`is_letter(c)`** — tests whether `c` is a lowercase ASCII
   letter.
8. **`only_letters(arr)`** — `reduce` to filter a `[string]` of
   chars down to only the lowercase letters (strips spaces,
   punctuation, etc.).
9. **`canonicalize(s)`** — lowercase, strip non-letters, sort
   the chars. The canonical form of an anagram class.
10. **`is_anagram(a, b)`** — `canonicalize(a) == canonicalize(b)`.
11. **Driver** — runs `is_anagram` on a list of word pairs,
    including the classic "dormitory" / "dirty room" anagram.
    Shows the canonicalization for a few pairs to make the
    algorithm transparent.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/anagram_check.ae
```

## Key language features

- **Recursive merge sort on `[string]`** — same algorithm as
  `merge_sort.ae` but on string arrays. The `int(len(arr) / 2)`
  cast is essential (Aether's `/` is float division).
- **`reduce` to filter** in `only_letters` — the callback pushes
  onto the accumulator in place (via `push`) and returns it. The
  type checker reports a minor warning (push returns unit, the
  function returns `[string]`) but the program runs correctly.
- **Tuple return from `reduce`** — `only_letters` returns a
  `[string]` accumulator, demonstrating the pattern.
- **Lookup-string + index walk** for case conversion (no
  `to_upper` builtin).

## Expected output

```
== Anagram check (sort-then-compare) ==

  "listen" vs "silent" -> true
  "hello" vs "world" -> false
  "debit" vs "bidet" -> true
  "Aether" vs "heap" -> false
  "abc" vs "cba" -> true
  "dormitory" vs "dirty room" -> true
  "rail safety" vs "fairy tales" -> true
  "" vs "" -> true
  "a" vs "a" -> true
  "ab" vs "ba" -> true
  "ab" vs "abc" -> false

Canonicalization demo:
  "listen" -> "eilnst"
  "silent" -> "eilnst"
  "Aether" -> "aeehrt"
  "heap" -> "ahpe"
  "dormitory" -> "dimoorrty"
  "dirty room" -> "dimoorrty"

All assertions passed.
```

## Design notes

- The "strip non-letters" step is what makes "dormitory" and
  "dirty room" match — without it, the space in "dirty room"
  would survive into the canonical form and break the equality.
- The canonicalization is case-insensitive ("Listen" and
  "Silent" match), which is the conventional anagram definition.
- We use merge sort for the char sort (rather than bubble sort)
  because it's the cleanest functional-style sort and we already
  implemented it in `merge_sort.ae` — same algorithm, different
  element type.
