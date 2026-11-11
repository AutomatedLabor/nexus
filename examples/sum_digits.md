# sum_digits.ae

Sums the digits of a non-negative integer. Demonstrates two
strategies (arithmetic and string-based) and verifies they agree
on a small table of inputs.

## What it does

1. **`digit_value(c)`** — single digit char to int (chained `if`
   rather than `switch`, since Aether v1 has no `switch`/`case`).
2. **`sum_digits_arith(n)`** — walks the digits right-to-left by
   repeatedly taking `% 10` (lowest digit) and `/ 10` (shift
   right one place). Uses `int(cur / 10)` to truncate the float
   result of `/` back to an integer.
3. **`char_array(s)`** — builds a `[string]` of single chars from
   `s` via a `while` loop and `push`.
4. **`sum_digits_str(n)`** — converts `n` to a string, builds a
   char array, and reduces with `acc + digit_value(c)`.
5. **Driver** — runs both implementations on a table of inputs
   and reports whether they agree. Then prints the headline
   cases and runs assertions.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/sum_digits.ae
```

## Key language features

- **`int(cur / 10)` cast** in `sum_digits_arith` — Aether's `/`
  is float division (`12345 / 10 = 1234.5`), so we cast to
  truncate to `1234`. Without the cast, the loop would never
  terminate (we'd recurse on `1234.5`, then `123.45`, ...).
- **`% 10` integer modulo** for the lowest digit — works as
  expected on integers.
- **`reduce` over a `[string]` of chars** in `sum_digits_str` —
  the canonical pattern for avoiding the for-loop-scope quirk
  when building a sum out of an array.
- **Chained `if c == "0" { 0 } else { if c == "1" { 1 } ... }`**
  for digit-char-to-int (no `switch` in v1).
- **Negative-input handling** — both versions take `n < 0`
  into account (negate before processing).

## Expected output

```
== Sum of digits ==

Table (n) -> arith, string, match:
  0 -> arith = 0, string = 0  [ok]
  5 -> arith = 5, string = 5  [ok]
  12345 -> arith = 15, string = 15  [ok]
  99999 -> arith = 45, string = 45  [ok]
  1000 -> arith = 1, string = 1  [ok]
  1000000 -> arith = 1, string = 1  [ok]
  7 -> arith = 7, string = 7  [ok]

sum_digits(12345) = 15
sum_digits(99999) = 45
sum_digits(1000)  = 1

All assertions passed.
```

## Design notes

- The arithmetic version (`sum_digits_arith`) is the faster and
  more "honest" implementation: it works on the integer directly
  without going through string conversion. The cost: it needs
  the `int()` cast on the division, which is a small wart.
- The string-based version (`sum_digits_str`) is more
  pedagogical and easier to read; it also demonstrates the
  `reduce` pattern that's idiomatic for Aether.
- We provide both to verify they agree, which catches off-by-
  one errors in either implementation. The table-driven
  verification with the "match" column is a small but useful
  sanity check.
