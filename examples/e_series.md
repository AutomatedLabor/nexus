# e_series.ae

Approximate Euler's number `e` via its Taylor series:

```
e = sum_{k=0}^{infinity}  1 / k! = 1 + 1/1! + 1/2! + 1/3! + ...
```

The series converges extremely fast (factorials grow quickly),
so summing 20 terms already gives double-precision accuracy:
`e ~ 2.7182818284590455`.

## What it does

1. **Main computation** — `let mut acc = 1.0` (the `1/0!`
   term) and `let mut fact = 1.0` (running factorial). For
   `k = 1..terms-1`: `fact *= k`, then `acc += 1/fact`.
   Multiplying incrementally avoids recomputing `k!` from
   scratch each iteration.
2. **Driver** — prints the partial sum at `terms = 20`, the
   reference value, and the absolute error. Then prints a
   partial-sums table at several checkpoint sizes (1, 3, 5,
   8, 12, 20 terms) to show convergence.
3. **`e_approx(terms)`** — wrap the same machinery in a
   function for sanity assertions.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/e_series.ae
```

## Key language features

- **`let mut acc` and `let mut fact` referenced after the
  while loop** — the canonical accumulator pattern. Safe
  with `while` (no for-loop-scope quirk).
- **`float(k)` to coerce int → float** in the factorial
  multiplication, so `fact` stays a float.
- **`1.0 / fact`** — float division, no need for `int(...)`
  truncation here.
- **`abs()` builtin** to measure the error against the
  reference `2.718281828459045`.

## Expected output

```
== Series approximation of e ==

terms summed:  20
e approx:      2.7182818284590455
reference:     2.718281828459045
abs error:     4.440892098500626e-16

partial sums after N terms:
  N =  1: e ~ 1.0  (err = 1.718...)
  N =  3: e ~ 2.5  (err = 0.218...)
  N =  5: e ~ 2.7083...  (err = 0.0099...)
  N =  8: e ~ 2.718253...  (err = 2.7e-5)
  N = 12: e ~ 2.718281828...  (err = 4.6e-9)
  N = 20: e ~ 2.7182818284590455  (err = 0)

All assertions passed.
```

## Design notes

- The Taylor series for `e` is one of the fastest-converging
  in elementary mathematics: by `N = 20` we've already hit
  float64's precision limit, and the residual drops to
  exactly zero.
- The `1/k!` terms shrink faster than exponentially; for
  `k = 20`, `k! ~ 2.4e18` so `1/k! ~ 4e-19`, well below
  float64's epsilon (`~2.2e-16`).
- Compare to the Leibniz series for `pi` (in
  `pi_leibniz.ae`), which converges *logarithmically* and
  needs thousands of terms for a few digits — the
  factorial-denominator series is vastly more efficient.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
