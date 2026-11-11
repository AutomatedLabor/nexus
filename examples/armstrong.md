# armstrong.ae

Tests whether a number is an Armstrong number (also called a
narcissistic number): a number that equals the sum of its own
digits each raised to the power of the number of digits.

```
153      (3 digits): 1^3 + 5^3 + 3^3 = 1 + 125 + 27 = 153   ✓
370      (3 digits): 3^3 + 7^3 + 0^3 = 27 + 343 + 0 = 370   ✓
371      (3 digits): 3^3 + 7^3 + 1^3 = 27 + 343 + 1 = 371   ✓
9474     (4 digits): 9^4 + 4^4 + 7^4 + 4^4
                  = 6561 + 256 + 2401 + 256 = 9474           ✓
```

## What it does

1. **`digit_value(c)`** — single digit char to int (chained `if`).
2. **`char_array(s)`** — builds a `[string]` of single chars from
   `s` via a `while` loop and `push`.
3. **`int_pow(b, e)`** — iterative integer power via `while`
   loop. `b^e = b * b * ... * b` (e times).
4. **`is_armstrong(n)`** — `str(n)` → `char_array` → `reduce`
   with `acc + int_pow(digit_value(c), num_digits)`, then
   compare the sum to `n`.
5. **Driver** — runs `is_armstrong` on a list of candidate
   numbers (including some Armstrong numbers and some
   non-Armstrong numbers). Then shows the decomposition for the
   textbook examples (`153`, `370`, `371`, `9474`, `407`).

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/armstrong.ae
```

## Key language features

- **`int_pow(b, e)` via `while` loop** — iterative integer power,
  avoids recursion-depth concerns for `9^4` etc.
- **`reduce` over a `[string]` of chars** with `acc + int_pow(digit_value(c), num_digits)` — the canonical pattern for
  summing over a string's digits.
- **`str(n)` then `len(s)` to get the number of digits** —
  simple and direct. (`9474` has 4 digits because `str(9474)`
  has length 4.)
- **`reduce` with `acc + c + "^" + str(nd)` to build the
  decomposition string** — e.g., "1^3 + 5^3 + 3^3" for 153.
- **`assert_eq` on boolean results** for the Armstrong verdicts.

## Expected output

```
== Armstrong numbers ==

Single-number checks:
  153: Armstrong
  370: Armstrong
  371: Armstrong
  9474: Armstrong
  407: Armstrong
  1634: Armstrong
  8208: Armstrong
  9475: not Armstrong
  100: not Armstrong
  123: not Armstrong
  5: Armstrong

Decompositions:
  153: 1^3 + 5^3 + 3^3 = 153  [EQUAL]
  370: 3^3 + 7^3 + 0^3 = 370  [EQUAL]
  371: 3^3 + 7^3 + 1^3 = 371  [EQUAL]
  9474: 9^4 + 4^4 + 7^4 + 4^4 = 9474  [EQUAL]
  407: 4^3 + 0^3 + 7^3 = 407  [EQUAL]

All assertions passed.
```

## Design notes

- We deliberately include `5` in the test cases: it's a
  single-digit number, and `5^1 = 5`, so it IS an Armstrong
  number (every single-digit number is). This catches bugs
  where the implementation assumes `num_digits >= 2`.
- `9475` is a near-miss for `9474` — the same digits except
  for the last (5 vs 4), so `9^4 + 4^4 + 7^4 + 5^4 = 6561 +
  256 + 2401 + 625 = 9843 != 9475`. This is a nice negative
  case that's "obviously close" but still wrong.
- The decomposition printout is a nice teaching aid: it shows
  exactly what the digit-power sum looks like for each number,
  so a reader can verify the Armstrong property by hand.
