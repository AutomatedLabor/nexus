# gcd_lcm.ae

A small Aether program that computes the Greatest Common Divisor
(Euclid's algorithm, recursive) and the Least Common Multiple of
integer pairs. The driver walks a small table of pairs with a
`while` loop and prints gcd/lcm side by side, then runs sanity
assertions.

## What it does

1. **`gcd(a, b)`** — Euclid's algorithm expressed as a recursive
   one-liner: `if b == 0 { a } else { gcd(b, a % b) }`. The
   `%` operator is integer modulo (defined even for `b == 0` —
   the `if b == 0` base case handles it before we ever divide).
2. **`lcm(a, b)`** — `a * b / gcd(a, b)` with a `0` short-circuit
   when either input is zero (avoiding a 0/0 trap).
3. **Driver** — prints a few headline cases (`gcd(48, 36)`,
   `lcm(4, 6)`, etc.) and a pairs table using a `while` loop over a
   `[(int, int)]` array. The `while` loop (rather than `for`)
   sidesteps the known v1 scoping quirk where a `let` bound before
   a `for` loop is reported as undefined when referenced after
   the loop.

The driver finishes with `assert_eq` checks on the headline cases.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/gcd_lcm.ae
```

## Key language features

- **Recursive function with `if cond { then } else { else }`** as a
  value expression — `gcd` is a single if-else expression, no
  statements.
- **Tuple array** `[(int, int)]` and **tuple access** `p.0`, `p.1`.
- **`while` loop** with manual `i = i + 1` increment.
- **`%` integer modulo** for the gcd step (works because the base
  case handles `b == 0`).
- **`assert_eq`** for sanity checks.
- **String interpolation** `f"..."` in the print statements.

## Expected output

```
== GCD and LCM (Euclid, recursive) ==

gcd(48, 36) = 12
gcd(54, 24) = 6
...
lcm(4, 6)   = 12
...
Pairs table (a, b) -> gcd, lcm:
  (48, 36) -> gcd = 12, lcm = 144
  ...
All assertions passed.
```

## Design notes

- The recursive form is the cleanest expression of Euclid's
  algorithm; the iterative form would require a `let mut` plus a
  `while` loop and an early return — strictly more code for no
  readability win.
- The pairs table uses `while` rather than `for x in pairs` so we
  can read `i`, `p.0`, `p.1`, `gcd(a, b)`, `lcm(a, b)` all in the
  same iteration body without worrying about post-loop binding
  visibility.
- The `lcm` short-circuit for `0` is a defensive measure: although
  `gcd(0, 0)` would return `0` (and the divide would still be
  `0 / 0` — a runtime panic), the explicit `0` check makes the
  contract obvious to the reader.
