# prime_sieve_big.ae

Sieve of Eratosthenes up to `N = 200`. Returns the count of
primes and the last 5 primes below `N`.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`isqrt(n)`** — integer floor of `sqrt(n)` via the
   builtin `sqrt` and `int` truncation.
3. **`sieve(N)`** — the algorithm:
   - Initialize `is_prime[0..N] = 1` (true), then mark 0
     and 1 as composite.
   - For each `i` from 2 to `sqrt(N)`, if `is_prime[i]` is
     still 1, mark all multiples of `i` (`i*i, i*i + i, ...`)
     as composite. The `i*i` starting point is the
     optimization that skips already-marked small multiples.
   - Sweep the array, pushing each still-1 index into a
     `primes` array.
4. **`take_last(arr, n)`** — return the last `n` elements.
5. **Driver** — prints the count, last 5 primes, and first
   5 primes for `N = 200`, plus a table at several cutoffs.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/prime_sieve_big.ae
```

## Key language features

- **Indexed array assignment** `is_prime[j] = 0` on a
  `let mut is_prime` array — supported by the v1 evaluator.
- **`int(sqrt(float(n)))`** to get the integer sqrt bound
  for the outer loop.
- **`while` loops** throughout — sidesteps the for-loop-scope
  quirk.
- **`reduce`** to render int arrays as pretty strings.

## Expected output

```
== Sieve of Eratosthenes (N = 200) ==

N:           200
prime count:  46
last 5 primes: [181, 191, 193, 197, 199]
first 5 primes: [2, 3, 5, 7, 11]

  primes <= 10: count=4, last=7
  primes <= 50: count=15, last=47
  primes <= 100: count=25, last=97
  primes <= 200: count=46, last=199

All assertions passed.
```

## Design notes

- There are exactly 46 primes below 200. The last 5 are
  `181, 191, 193, 197, 199` (note the prime gap of 10
  between 199 and the next prime 211).
- The `i*i` starting point for the inner sieve loop is the
  key optimization: every composite `j` with `j < i*i` has
  already been marked by an earlier prime (since `j` has
  some prime factor `< i`). This brings the runtime from
  `O(N * log N)` to `O(N log log N)`.
- Aether's `1`/`0` int convention here substitutes for a
  bool array, since the v1 type checker doesn't love
  `[bool]` literals. At runtime both work.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
