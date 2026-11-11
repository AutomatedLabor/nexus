# power_fn.ae

Fast exponentiation by squaring — O(log n) multiplications instead
of O(n). Computes `b^n` for non-negative integer exponents using
the classic recursive algorithm.

## What it does

Algorithm:

```
b^0          = 1
b^n (n even) = (b^(n/2))^2       // square half-power
b^n (n odd)  = b * b^(n-1)       // one extra multiply, then even
```

The "even" branch is the key trick: instead of `b * b * b * ...`
(n times), we compute `b^(n/2)` once and square it — halving the
work at each step.

1. **`power(base, exp)`** — recursive implementation of the
   algorithm above. Uses `int(exp / 2)` to truncate the float
   result of `/` back to an integer.
2. **`power_naive(base, exp)`** — naive linear-time version
   (`exp` multiplications). Used as an oracle to verify `power`.
3. **Driver** — prints the headline cases (`2^10`, `3^5`, `5^0`)
   and a table of `(base, exp)` pairs computed both ways, with a
   "match" column showing they agree.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/power_fn.ae
```

## Key language features

- **Recursive function with nested `if cond { then } else { else }`**
  — `power` is a triply-nested if-else expression, no statements.
  Each level handles a different case (`exp == 0`, `exp == 1`,
  `exp % 2 == 0`, otherwise).
- **`int(exp / 2)` cast** — Aether's `/` is float division
  (`7 / 2 = 3.5`), so we cast to truncate the result back to
  an integer for the recursive call. Without this, the recursion
  would never terminate (we'd recurse on `3.5`, then `1.75`,
  then `0.875`, ...).
- **`exp % 2 == 0`** to test parity — `%` is integer modulo in
  Aether.
- **`while` loop with `let mut out`** for the naive oracle.
- **`assert_eq`** comparing fast vs naive results.

## Expected output

```
== Fast exponentiation (exponentiation by squaring) ==

2^10 = 1024    (naive: 1024)
3^5  = 243     (naive: 243)
5^0  = 1    (naive: 1)
7^1  = 7    (naive: 7)
2^20 = 1048576 (naive: 1048576)

Table (base, exp) -> fast, naive, match:
  (2, 0) -> fast = 1, naive = 1  [ok]
  (2, 1) -> fast = 2, naive = 2  [ok]
  ...
  (-2, 6) -> fast = 64, naive = 64  [ok]
All assertions passed.
```

## Design notes

- We include negative bases (`-2, 5`, `-2, 6`) to verify that the
  squaring branch handles negative bases correctly (since
  `(-b)^2 == b^2`).
- The naive oracle runs `exp` multiplications, so for `2^20` it
  does 1 million — wait, 20 iterations of the `while i < exp`
  loop, not 1 million. (The naive version multiplies 20 times,
  not `2^20` times.)
- The "even exponent" branch (`half * half`) is the key
  optimization: it ensures we recurse at most `log2(n)` times
  before hitting the base case. For `2^20`, that's 5 levels of
  recursion (`20 -> 10 -> 5 -> 4 -> 2 -> 1`), versus 20 for the
  naive version.
