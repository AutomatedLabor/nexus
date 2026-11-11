# modular_exp.ae

Modular exponentiation: compute `a^b mod m` efficiently using
the square-and-multiply algorithm. Naively, computing `2^100`
directly would overflow any reasonable integer type; we keep
every intermediate reduced mod `m`, so the answer is exact.

## What it does

1. **`mod_mul(a, b, m)`** — russian-peasant (binary)
   multiplication mod `m`. Why a separate helper? Because
   `(base * base) mod m` with `m` up to `1e9` would yield a
   product up to `1e18`, which exceeds float64's safe-integer
   range (`2^53 ≈ 9.0e15`) and would silently lose precision.
   `mod_mul` keeps every addition under `2m`, so nothing
   overflows.
2. **`mod_pow(a, b, m)`** — square-and-multiply. Standard
   right-to-left binary method: at each step, if the lowest
   bit of `b` is 1, fold `base` into `result`; square `base`
   regardless; halve `b`.
3. **Driver** — computes `2^100 mod 1000000007 = 976371285`
   (a common modulus in programming contests), plus a
   trace of `3^13 mod 7 = 3` and a table of other cases.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/modular_exp.ae
```

## Key language features

- **`mod_mul` helper** — the key insight for getting exact
  results with large `m`. Without it, `(result * base) % m`
  would overflow `2^53` for `m >= ~94_906_266`.
- **`int(k / 2)` for integer halving** (since `/` is float
  division).
- **`while` loops** for both the outer exponent loop and
  the inner multiplication loop — sidesteps the for-loop-
  scope quirk.

## Expected output

```
== Modular exponentiation ==

a = 2
b = 100
m = 1000000007
a^b mod m = 976371285

3^13 mod 7 = 3

  2^10 mod 1000000007 = 1024  (expected 1024)  [ok]
  3^0 mod 1000000007 = 1  (expected 1)  [ok]
  5^3 mod 1000 = 125  (expected 125)  [ok]
  7^2 mod 49 = 0  (expected 0)  [ok]
  10^9 mod 1000000007 = 1000000000  (expected 1000000000)  [ok]

All assertions passed.
```

## Design notes

- The naive `pow(a, b) % m` would compute the (enormous)
  `a^b` first and only reduce at the end. That overflows
  immediately for any non-trivial `b`. Square-and-multiply
  keeps every intermediate `< m^2`, which (with the
  additional `mod_mul` trick) stays inside float64's safe
  range.
- Aether v1's `%` operator is non-negative for non-negative
  operands (verified in the evaluator's compound-assign
  path), so we don't need to "fix up" the result with a
  `while r < 0 { r += m }` loop — but we do normalize
  negative bases (`base < 0`) once at the start.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
- For very large `m` (say `m = 2^31 - 1`), the `mod_mul`
  trick is essential. For small `m` (say `m < 2^25`), the
  naive `(base * base) % m` would also work, but using
  `mod_mul` consistently is the safe default.
