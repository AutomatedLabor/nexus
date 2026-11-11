# euclid_extended.ae

Extended Euclidean algorithm: given two non-negative integers
`a, b`, compute `gcd(a, b)` and the Bezout coefficients `x, y`
such that `a*x + b*y = gcd(a, b)`.

## What it does

1. **`ext_gcd(a, b)`** — iterative extended Euclidean:
   - Maintain pairs `(a, b)` and the corresponding Bezout
     coefficients `(x1, y1)` and `(x2, y2)` tracking how
     the previous remainders decompose.
   - At each step: `q = a / b`, `r = a - q*b`. Then
     `(a, b) = (b, r)`, and we shift the Bezout rows:
     `(x1, x2) = (x2, x1 - q*x2)`, similarly for `y`.
   - Returns `[gcd, x, y]`.
2. **`gcd(a, b)`** — plain Euclidean for cross-checking the
   first return value.
3. **Driver** — runs the algorithm on `(240, 46)`, `(1071, 462)`,
   `(17, 5)`, `(100, 75)`, `(13, 0)`, `(0, 7)`, printing each
   and verifying the Bezout identity.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/euclid_extended.ae
```

## Key language features

- **`let mut` for every variable in the loop** — they're all
  reassigned each iteration. The Bezout rows in particular
  require simultaneous update, which we fake via temp
  variables `nx, ny` to avoid losing the old `x1, y1` before
  we use them.
- **`int(a / b)` for integer quotient** since `/` is float
  division.
- **`while b != 0`** — no upper bound needed; Euclid
  terminates because `b` strictly decreases each iteration.

## Expected output

```
== Extended Euclidean algorithm ==

  gcd(240, 46) = 2, x = -9, y = 47
    240*(-9) + 46*(47) = 2  [ok]  (gcd match: [ok])
  gcd(1071, 462) = 21, x = -3, y = 7
    ...
  gcd(17, 5) = 1, x = -2, y = 7
    17*(-2) + 5*(7) = 1  [ok]
  ...

Headline: 240*(-9) + 46*47 = 2

All assertions passed.
```

## Design notes

- The Bezout identity for `(240, 46)` is
  `240*(-9) + 46*47 = -2160 + 2162 = 2 = gcd`. The driver
  verifies this identity for every test case.
- The iterative form is faster than the recursive form on
  long inputs (no stack buildup), and easier to make
  tail-recursive in languages with TCO. The recursive form
  is more pedagogical but functionally equivalent.
- The `(13, 0)` edge case: `gcd(a, 0) = a`, and the Bezout
  identity is `13*1 + 0*0 = 13`. The `(0, 7)` case is
  symmetric: `gcd(0, b) = b`, `0*0 + 7*1 = 7`.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
