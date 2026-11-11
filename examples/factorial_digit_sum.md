# factorial_digit_sum.ae

Computes `factorial(10) = 3628800` and then sums its digits:
`3 + 6 + 2 + 8 + 8 + 0 + 0 = 27`. The factorial is computed
iteratively; the digit sum is computed by converting the integer
to a string and folding each character back to its integer value
with `reduce`.

## What it does

1. **`factorial(n)`** — iterative factorial with a `while` loop.
   `0! = 1` and `1! = 1` fall out of the loop naturally (the loop
   starts at `i = 2`).
2. **`digit_value(c)`** — single digit char to int (chained `if`
   rather than `switch`, since Aether v1 has no `switch`/`case`).
3. **`char_array(s)`** — builds a `[string]` of single chars from
   `s` via a `while` loop. We need this because `reduce` only
   folds over arrays, not strings.
4. **`digit_sum(n)`** — `str(n)` → `char_array` → `reduce` with
   `acc + digit_value(c)`.
5. **Driver** — prints the headline result and a small table of
   additional factorials with their digit sums.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/factorial_digit_sum.ae
```

## Key language features

- **`while` loop with `let mut result`** for the iterative
  factorial.
- **`str(n)` builtin** to convert an integer to its decimal string.
- **`reduce` over a `[string]`** to fold the chars into a sum.
- **Chained `if c == "0" { 0 } else { if c == "1" { 1 } else { ... } }`**
  — the canonical Aether pattern for digit-char-to-int conversion
  (no `switch` in v1).
- **`push` to build the char array** — the canonical way to build
  a fixed-size array from an index walk.

## Expected output

```
== Factorial digit sum ==

factorial(10) = 3628800
sum of digits of 3628800 = 27

  0! = 1, digit sum = 1
  1! = 1, digit sum = 1
  5! = 120, digit sum = 3
  7! = 5040, digit sum = 9
  10! = 3628800, digit sum = 27

All assertions passed.
```

## Design notes

- We pick `n = 10` deliberately — `factorial(10) = 3628800`, which
  has 7 digits with sum 27. A larger `n` (say 20) would overflow
  Aether's float-as-int representation once it exceeds
  `2^53 ≈ 9e15`, so we stay in the safe range.
- The `char_array` intermediate is a small wart: Aether's `reduce`
  folds arrays, not strings, so we have to convert the string to a
  char array first. A future Aether could provide a
  `string_chars(s) -> [string]` builtin to eliminate this step.
- The iterative factorial keeps step count low — for `n = 10`
  the loop runs 9 iterations. A naive recursive factorial would
  work but is harder to read for the digit-sum demonstration.
