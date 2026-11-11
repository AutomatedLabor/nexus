# reverse_number.ae

Reverses the decimal digits of a non-negative integer.

```
12345  -> 54321
1000   -> 1     (leading zeros dropped)
7      -> 7
0      -> 0
```

Demonstrates two strategies (arithmetic and string-based) and
verifies they agree on a table of inputs.

## What it does

1. **`digit_value(c)`** — single digit char to int (chained `if`).
2. **`reverse_arith(n)`** — walks the digits right-to-left via
   `% 10`, accumulating the reversed value as `rev = rev * 10 +
   (cur % 10)` and shifting right via `cur = int(cur / 10)`.
3. **`char_array(s)`** — builds a `[string]` of single chars from
   `s` via a `while` loop and `push`.
4. **`rev_string(s)`** — reverses a string by reducing over its
   char array and prepending each char (`c + acc`).
5. **`parse_int(s)`** — parses a decimal string back into an int
   by walking left to right with `n = n * 10 + digit_value(c)`.
6. **`reverse_str(n)`** — converts `n` to a string, reverses
   the chars via `reduce`, parses the reversed string back to an
   int.
7. **Driver** — runs both implementations on a table of inputs
   and reports whether they agree. Then prints the headline
   cases and runs assertions.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/reverse_number.ae
```

## Key language features

- **`int(cur / 10)` cast** in `reverse_arith` — Aether's `/` is
  float division (`12345 / 10 = 1234.5`), so we cast to truncate
  to `1234`. Without the cast, the loop would never terminate.
- **`% 10` integer modulo** for the lowest digit.
- **`reduce` with `c + acc` to prepend each char** in
  `rev_string` — the canonical pattern for string reversal
  without the for-loop-scope quirk.
- **`while` loop with `n = n * 10 + digit_value(c)`** in
  `parse_int` — the standard "shift-and-add" string-to-int
  conversion.
- **`if n == 0 { 0 } else { ... }`** to short-circuit the
  string-based version for `n = 0` (since `rev_string("0")` would
  parse back to `0` anyway, the short-circuit is a small
  optimization).

## Expected output

```
== Reverse digits of an integer ==

Table (n) -> arith, string, match:
  0 -> arith = 0, string = 0  [ok]
  7 -> arith = 7, string = 7  [ok]
  12 -> arith = 21, string = 21  [ok]
  100 -> arith = 1, string = 1  [ok]
  12345 -> arith = 54321, string = 54321  [ok]
  1000 -> arith = 1, string = 1  [ok]
  99999 -> arith = 99999, string = 99999  [ok]
  123456789 -> arith = 987654321, string = 987654321  [ok]
  10203 -> arith = 30201, string = 30201  [ok]

reverse(12345) = 54321
reverse(1000)  = 1
reverse(99999) = 99999
reverse(123456789) = 987654321

All assertions passed.
```

## Design notes

- Both implementations handle the leading-zeros case correctly:
  `reverse_arith(1000)` produces `1` (because the loop reads
  digits 0, 0, 0, 1 in that order and builds `rev = 0, 0, 0, 1`
  = `0001` = `1`), and `reverse_str(1000)` produces
  `parse_int("0001")` which equals `1` because `parse_int`
  ignores leading zeros naturally.
- The arithmetic version is faster and more direct; the
  string-based version is more pedagogical and demonstrates the
  `reduce` pattern.
- We include `10203` in the test cases specifically because it
  has internal zeros — this catches bugs where the
  implementation accidentally drops zeros (e.g., by treating
  them as terminators).
