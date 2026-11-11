# pi_leibniz.ae

Approximate `pi` via the Leibniz series:

```
pi / 4 = 1 - 1/3 + 1/5 - 1/7 + 1/9 - ...
```

which is the Gregory series — the Taylor expansion of
`arctan(1)` since `arctan(x) = x - x^3/3 + x^5/5 - ...` and
`arctan(1) = pi/4`.

## What it does

1. **Main computation** — sum 1000 terms of the alternating
   series, accumulating into a `let mut acc` that we print
   afterward. Multiply by 4 to recover pi.
2. **Driver** — prints the partial sum, the pi approximation,
   the reference value, and the absolute error. Then runs
   the same machinery at four checkpoint sizes (10, 100,
   1000, 5000 terms) to show the slow convergence.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/pi_leibniz.ae
```

## Key language features

- **`let mut acc` referenced after the while loop** — the
  canonical accumulator pattern. Safe with `while` (no
  for-loop-scope quirk).
- **`/` is float division** — `1.0 / denom` stays float,
  even though `denom` is a float-derived value.
- **`float(i)` to coerce int → float** in the denom
  computation `2.0 * float(i) + 1.0`.
- **`abs()` builtin** to measure the absolute error
  against `pi ~ 3.141592653589793`.

## Expected output

```
== Leibniz series approximation of pi ==

terms summed:  1000
pi/4 partial:  0.785148163459948
pi approx:     3.140592653839795
reference pi:  3.141592653589793
abs error:     0.000999999749998

  after 10 terms: pi ~ 3.0418...  (err ~ 0.10)
  after 100 terms: pi ~ 3.13159...  (err ~ 0.01)
  after 1000 terms: pi ~ 3.14059...  (err ~ 0.001)
  after 5000 terms: pi ~ 3.14139...  (err ~ 0.0002)

All assertions passed.
```

## Design notes

- The Leibniz series is famously slow: error is roughly
  `~1/N`, so to get `k` correct digits you need `~10^k`
  terms. With 1000 terms we get only `~3` correct digits
  (`3.14059...` vs the true `3.14159...`).
- The alternating sign is `(i % 2) == 0 ? +1 : -1`, since
  `i = 0, 2, 4, ...` contribute positive terms and
  `i = 1, 3, 5, ...` contribute negative terms.
- For serious pi computation, Machin's formula
  (`pi/4 = 4*arctan(1/5) - arctan(1/239)`) and other
  arctangent identities converge much faster. The Leibniz
  series is kept here for pedagogical value.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
