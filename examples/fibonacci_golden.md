# fibonacci_golden.ae

Fibonacci numbers via Binet's closed-form formula:

```
F(n) = (phi^n - psi^n) / sqrt(5)
```

where `phi = (1 + sqrt(5)) / 2` (the golden ratio) and
`psi = (1 - sqrt(5)) / 2` (its conjugate). Since `|psi| < 1`,
`psi^n -> 0` as `n` grows, so for large `n` the formula
simplifies to `F(n) ~ round(phi^n / sqrt(5))`.

## What it does

1. **`round_pos(x)`** — round a non-negative float to the
   nearest integer via `int(x + 0.5)` (the builtin `int`
   truncates toward zero, so adding 0.5 first).
2. **`pow_pos(base, n)`** — float `^` int via repeated
   squaring (Aether v1 has no `**` operator).
3. **`fib_binet(n)`** — Binet's formula directly: compute
   `phi^n` and `psi^n`, subtract, divide by `sqrt(5)`,
   round.
4. **`fib_iter(n)`** — iterative Fibonacci via two-variable
   rolling, for cross-checking the Binet result.
5. **Driver** — prints `phi`, `psi`, `sqrt(5)`, then a
   table comparing Binet vs iterative for `n = 10..15`,
   plus the small-`n` values.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/fibonacci_golden.ae
```

## Key language features

- **`sqrt` builtin** to get `sqrt(5.0)`.
- **`pow_pos` implemented via repeated squaring** — the
  canonical binary exponentiation pattern; Aether v1 has
  no `**` operator so we roll our own.
- **`int(k / 2)` for integer halving** in the squaring
  loop (since `/` is float division).
- **`round_pos` helper** because Aether's `int` truncates
  toward zero, which would round 0.5 to 0 instead of 1.

## Expected output

```
== Fibonacci via Binet's formula ==

phi = (1+sqrt(5))/2 = 1.618033988749895
psi = (1-sqrt(5))/2 = -0.6180339887498949
sqrt(5) = 2.23606797749979

n | F(n) Binet | F(n) iter
  n=10:  Binet=55, iter=55  [ok]
  n=11:  Binet=89, iter=89  [ok]
  n=12:  Binet=144, iter=144  [ok]
  n=13:  Binet=233, iter=233  [ok]
  n=14:  Binet=377, iter=377  [ok]
  n=15:  Binet=610, iter=610  [ok]

All assertions passed.
```

## Design notes

- Float-precision note: at `n ~= 70` the float64 mantissa
  runs out of bits and Binet's formula starts to drift from
  the true Fibonacci values. We stay well below that
  boundary here (`n <= 15`).
- The `psi^n` term is tiny for `n >= 10` (`|psi|^10 ~
  0.008`), so it contributes very little — but keeping it
  in the formula makes the result exact up to the float64
  precision limit.
- The iterative `fib_iter` is the "ground truth" reference
  against which we verify the Binet result. Both versions
  agree perfectly for `n <= 15`.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
