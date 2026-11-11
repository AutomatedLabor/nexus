# palindrome_check.ae

Checks whether a string reads the same forwards and backwards.
Implements string reversal two ways — recursively and via `reduce`
— and uses the `reduce` version for the palindrome check. Reports
a verdict for several test strings.

## What it does

1. **`substring(s, start, end)`** — chars of `s` from index
   `start` (inclusive) up to `end` (exclusive). Built with a
   `while` loop and string concatenation.
2. **`rev(s)`** — recursive reverse: prepend the last char to
   `rev` of the prefix. Base case: empty string reverses to
   itself.
3. **`char_array(s)`** — builds a `[string]` of single chars from
   `s`. Used by the reduce-based reverse.
4. **`rev_reduce(s)`** — fold the char array with `c + acc`
   (prepend each char to the accumulator).
5. **`is_palindrome(s)`** — `s == rev_reduce(s)`.
6. **Driver** — prints the recursive reverses for "racecar",
   "hello", "a", ""; prints the reduce-based reverses for
   "Aether" and "noon"; then prints a verdict table for nine test
   strings.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/palindrome_check.ae
```

## Key language features

- **Recursive function with `if cond { then } else { else }`** as
  the function body — `rev` is one expression, no statements.
- **`len(s) - 1` and `str(s[i])`** to index and read a single char.
  String indexing returns `char` per the type checker but a
  1-char string at runtime; the `str(...)` wrapper satisfies the
  checker.
- **`reduce` over a `[string]`** with `c + acc` to reverse a
  string — the canonical pattern for avoiding the for-loop-scope
  quirk when building a string out of an array.
- **`while` loop with string concatenation** in `substring` and
  `char_array`.
- **`assert_eq` on boolean results** for the palindrome verdicts.

## Expected output

```
== Palindrome check ==

Recursive reverse (rev):
  rev("racecar") = "racecar"
  rev("hello")   = "olleh"
  rev("a")       = "a"
  rev("")         = ""

Reduce-based reverse (rev_reduce):
  rev_reduce("Aether") = "rehteA"
  rev_reduce("noon")   = "noon"

Palindrome verdicts:
  "racecar" -> true
  "hello" -> false
  "a" -> true
  "" -> true
  "noon" -> true
  "level" -> true
  "Aether" -> false
  "12321" -> true
  "12345" -> false

All assertions passed.
```

## Design notes

- We provide two reversal implementations because they demonstrate
  two different idiomatic Aether patterns: recursion for the
  natural "walk and combine" shape, and `reduce` for the
  array-walking pattern that avoids the for-loop-scope quirk.
- The `reduce` version is preferred for the actual `is_palindrome`
  check because it doesn't recurse (no stack frames consumed for
  long strings) and uses the canonical pattern.
- The empty-string case returns `true` for palindrome, matching
  the mathematical convention "vacuously true".
