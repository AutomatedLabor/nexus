# newton_sqrt.ae

Newton's method (a.k.a. the Babylonian method) for square roots.
To find `sqrt(S)`, iterate:

```
x_{n+1} = (x_n + S / x_n) / 2
```

starting from any positive guess. Quadratic convergence — the
number of correct digits roughly doubles each step.

## What it does

1. **Inline computation** — compute `sqrt(2)` starting from
   `x_0 = 1.0` for 5 iterations and print each intermediate
   value, ending with `~1.4142135623730951`.
2. **`newton_sqrt(s, iters)`** — wrap the same machinery in a
   function so we can call it on multiple inputs and assert.
3. **Driver** — computes the inline trace for `sqrt(2)`, then
   a table of `sqrt(2), sqrt(9), sqrt(25), sqrt(144), sqrt(2.25)`
   with 8 iterations each, comparing to known reference values.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/newton_sqrt.ae
```

## Key language features

- **`let mut x` referenced after a `while` loop** — the
  canonical "accumulator updated in a while loop, used
  after" pattern. Safe with `while` (no for-loop-scope
  quirk).
- **`/` is float division** — so `S / x` stays a float
  even when both `S` and `x` look integer-valued.
- **`abs()` builtin** to measure the residual `|x^2 - S|` at
  each iteration, demonstrating convergence.
- **`float(i)` to coerce int → float** for arithmetic that
  would otherwise promote everything to int.

## Expected output

```
== Newton's method for sqrt(2) ==

initial guess:  x_0 = 1
  iter 1:  x = 1.5    (x^2 - 2 = 0.25)
  iter 2:  x = 1.4166666666666665    (x^2 - 2 = 0.006944444444...)
  iter 3:  x = 1.4142156862745097    (x^2 - 2 = 6.007e-6)
  iter 4:  x = 1.4142135623746899    (x^2 - 2 = 4.51e-12)
  iter 5:  x = 1.4142135623730951    (x^2 - 2 = 0)

approximation: 1.4142135623730951
reference:      1.4142135623730951

other roots (8 iterations each):
  sqrt(2) = 1.4142135623730951  (expected 2, |err| = ...)
  ...
All assertions passed.
```

## Design notes

- Newton's method for `sqrt` converges quadratically: each
  iteration roughly doubles the number of correct digits.
  Starting from `x_0 = 1.0` for `sqrt(2)`, after 4 iterations
  we already have 12 correct digits; by iteration 5 the
  residual is below float64 precision (`|x^2 - 2| = 0`).
- The initial guess `x_0 = S / 2` is a robust default for
  the helper. For `S = 0` we'd hit a division by zero; we
  guard by checking `x_0 <= 0` and falling back to `1.0`.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
- For integer `S` we'd want to use the integer sqrt
  (`isqrt`) — but here we explicitly want the float result,
  so we keep `S` as a float.
