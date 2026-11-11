# prime_factors.ae

Prime factorization of a positive integer: writes `n` as a product
of primes. Trial-divides by 2 (the only even prime), then every odd
number from 3 up to `sqrt(n)`. Each factor found is divided out as
many times as possible.

## What it does

1. **`prime_factors(n)`** — returns the array of prime factors in
   non-decreasing order. Handles `n >= 1`; for `n = 1` the result
   is empty.
   - Factor out all the 2s with `while cur % 2 == 0 { push(out, 2);
     cur = cur / 2; }`.
   - Factor out odd primes from 3 up: `while p * p <= cur { while
     cur % p == 0 { push(out, p); cur = cur / p; }; p = p + 2; }`.
     The `p * p <= cur` bound avoids the float-sqrt entirely.
   - If `cur > 1` after the loop, `cur` is the last prime factor.
2. **`show(arr)`** — renders an int array as `[a, b, c]` via
   `reduce`.
3. **Driver** — walks a list of n values with a `while` loop,
   prints factorizations, then runs sanity assertions.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/prime_factors.ae
```

## Key language features

- **`while` loops with `let mut out` and `push`** for the
  accumulator.
- **`% 2` integer modulo** to test even/odd — works as expected.
- **`/ p` integer division** — note this is float division under
  the hood, but since `cur` is always a multiple of `p` at that
  point, the result is an exact integer with no truncation needed.
  (If we were doing general integer division of non-multiples,
  we'd want `int(cur / p)` — see `merge_sort.ae`.)
- **`;` after an `if` block when another statement follows** —
  the `if cur > 1 { push(out, cur); };` block needs a trailing
  `;` before the bare `out` expression. Aether parses `if` as an
  expression, so two adjacent expressions without a `;` separator
  is a syntax error.

## Expected output

```
== Prime factorization ==

  1 = (no prime factors)   factors = []
  2 = 2   factors = [2]
  7 = 7   factors = [7]
  12 = 2 * 2 * 3   factors = [2, 2, 3]
  17 = 17   factors = [17]
  99 = 3 * 3 * 11   factors = [3, 3, 11]
  100 = 2 * 2 * 5 * 5   factors = [2, 2, 5, 5]
  360 = 2 * 2 * 2 * 3 * 3 * 5   ...
All assertions passed.
```

## Design notes

- The 2-then-odd split is the standard trial-division optimization:
  we cut the work in half by handling the only even prime
  separately. After that, every prime factor is odd, so we
  stride by 2.
- The `p * p <= cur` bound is computed fresh each iteration rather
  than cached as `sqrt(cur)`. Since `cur` shrinks every time we
  find a factor, the bound shrinks too — and we avoid the cost of
  recomputing the integer square root each time.
- The `99991` test case (a prime near `100000`) takes about 158
  trial divisions (odds from 3 to 316), which the evaluator
  handles in a few thousand steps — well inside the playground's
  step budget.
