# aether-math-extra

> Extended number theory for the Aether language — 14 pure functions covering the extended Euclidean algorithm and modular inverse, the Chinese Remainder Theorem, Miller-Rabin primality and prime factorization, Euler's totient and the Mobius function, divisor enumeration and divisor-count / sum-of-divisors, and perfect / abundant / deficient number classification.

`aether-math-extra` is a user-space Aether package for the number-theory primitives that show up in competitive programming, cryptography (the modular-arithmetic half), and recreational mathematics. The base `aether-math` package ships the building blocks (gcd, lcm, factorial, basic primality via trial division, primesUpTo sieve, fib, pow, modPow, sqrt, trigonometry, rounding); this package builds the next layer on top.

## Why a "math-extra" package?

`aether-math` covers the day-to-day needs: `gcd`, `lcm`, `factorial`, `isPrime` (trial division up to sqrt), `primesUpTo` (Eratosthenes sieve), `fib`, `pow`, `modPow`, and a small numeric-utilities layer (clamp, lerp, sign, sum, mean). It deliberately stops short of:

- **Modular inverse** — needed for RSA-style keygen, CRT-based reconstruction, and any modular division.
- **The Chinese Remainder Theorem** — the canonical tool for reconstructing a number from its residues modulo pairwise-coprime moduli, used in fast multiplication algorithms (Schönhage-Strassen) and in secret-sharing schemes.
- **Strong pseudoprime testing** — `aether-math.isPrime` uses trial division (correct, deterministic, but O(sqrt(n))). Miller-Rabin is O(log^3 n) per witness and lets you test multi-hundred-bit numbers in milliseconds.
- **Prime factorization** — the foundation for everything else here (totient, mobius, divisor count, sum-of-divisors).
- **Multiplicative functions** (totient, mobius, divisorCount, sumDivisors) — derived from the factorization.
- **Perfect / abundant / deficient classification** — small recreational functions that depend on `sumDivisors`.

This package fills those gaps with a small, dependency-free library.

## API

All 14 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they never mutate their inputs and operate on integers (Aether's `int` is a JavaScript `number`, safe up to 2^53; the test cases stay well within that range). Iteration uses `while` with explicit indices to avoid the v1 evaluator's for-loop-scope quirk.

### Modular arithmetic

| Function | Signature | Description |
| --- | --- | --- |
| `gcdExtended(a, b)` | `(int, int) -> [int]` | Extended Euclidean algorithm. Returns `[gcd, x, y]` such that `a*x + b*y = gcd`. `gcd >= 0`. For `a = b = 0` returns `[0, 0, 0]`. |
| `modInverse(a, m)` | `(int, int) -> int` | Multiplicative inverse of `a` mod `m`. Returns -1 if no inverse exists (i.e. `gcd(a, m) != 1`). Panics if `m <= 0`. |
| `chineseRemainder(a, m)` | `([int], [int]) -> int` | CRT reconstruction. `a` and `m` are parallel arrays of residues and pairwise-coprime moduli. Returns the unique `x` in `[0, prod(m))` such that `x = a[i] (mod m[i])` for all `i`. Panics on length mismatch, empty input, or non-coprime moduli. |
| `chineseRemainderRem(a, m)` | `([int], [int]) -> int` | Alias for `chineseRemainder` (provided as a separate export for callers who want the merge-based formulation semantics named explicitly). |

`gcdExtended` is recursive: `gcdExtended(a, b) = [g, y, x - (a/b)*y]` where `[g, x, y] = gcdExtended(b, a%b)`, with the base case `gcdExtended(a, 0) = [abs(a), sign(a), 0]` (and `[0, 0, 0]` for the all-zero input). The recursion depth is O(log(min(a, b))) — fine for any practical input.

`chineseRemainder` works by iteratively merging congruences: starting with `x = a[0] (mod m[0])`, it solves `x = current (mod prod)` and `x = a[i] (mod m[i])` using `modInverse(prod, m[i])`. The result after merging all `n` congruences is the unique solution modulo `prod(m)`.

### Primality and factoring

| Function | Signature | Description |
| --- | --- | --- |
| `isPrimeMillerRabin(n)` | `(int) -> bool` | Simplified Miller-Rabin primality test using the first 7 primes as witnesses (deterministic for `n < 341,550,071,728,321`). False for `n < 2`. |
| `primeFactors(n)` | `(int) -> [int]` | Prime factorization of `n` with multiplicity, in ascending order. Returns `[]` for `n < 2`. |

`isPrimeMillerRabin` writes `n - 1 = d * 2^r` with `d` odd, then for each witness `a` in `[2, 3, 5, 7, 11, 13, 17]` checks whether `a^d mod n` is `1`, `n-1`, or squares to `n-1` within `r` squarings. If any witness proves `n` is composite, the function returns false; otherwise it returns true. For inputs below the deterministic bound (about 3.4×10^14), this is a fast, correct primality test — much faster than trial division for medium-sized `n`.

`primeFactors` uses trial division up to `sqrt(n)`. For each prime factor `f` found, it repeatedly divides `n` by `f` to extract the multiplicity. Worst case is `n` being prime or a product of two large primes; for those, the loop runs `O(sqrt(n))` iterations — acceptable for inputs up to ~10^10.

### Multiplicative functions

| Function | Signature | Description |
| --- | --- | --- |
| `totient(n)` | `(int) -> int` | Euler's totient `phi(n)` — count of `1..n` coprime to `n`. Computed via `phi = n * prod(1 - 1/p)` over the distinct prime factors. |
| `mobius(n)` | `(int) -> int` | Mobius function `mu(n)`: `+1` for square-free with even number of prime factors, `-1` for square-free with odd, `0` if has a squared prime factor. |
| `divisors(n)` | `(int) -> [int]` | Sorted list of all positive divisors of `n`. `[]` for `n < 1`. |
| `divisorCount(n)` | `(int) -> int` | Number of positive divisors — `prod(e_i + 1)` over the factorization `prod(p_i^e_i)`. |
| `sumDivisors(n)` | `(int) -> int` | Sum of all positive divisors — `prod((p^(e+1) - 1) / (p - 1))` over the factorization. |

`totient`, `mobius`, `divisorCount`, and `sumDivisors` all derive from `primeFactors` — the same factorization is reused for all four computations, so the cost is dominated by the single `O(sqrt(n))` factorization call. `divisors` walks the divisor pairs `(i, n/i)` directly, which is also `O(sqrt(n))`.

### Perfect / abundant / deficient classification

| Function | Signature | Description |
| --- | --- | --- |
| `perfectNumber(n)` | `(int) -> bool` | True if `n` is perfect (sum of proper divisors equals `n`). False for `n < 2`. |
| `abundantNumber(n)` | `(int) -> bool` | True if `n` is abundant (sum of proper divisors > `n`). |
| `deficientNumber(n)` | `(int) -> bool` | True if `n` is deficient (sum of proper divisors < `n`). Special case: `n = 1` is deficient (sum of proper divisors = 0). |

These three are thin wrappers around `sumDivisors` — the "proper divisor sum" is `sumDivisors(n) - n`. The three classifications are mutually exclusive and cover every `n >= 1`.

## How to use

### As a dependency

```toml
[dependencies]
aether-math-extra = "0.1.0"
```

```aether
import { isPrimeMillerRabin, primeFactors, totient } from "aether-math-extra";

print(isPrimeMillerRabin(1000003));  // true
print(primeFactors(360));            // [2, 2, 2, 3, 3, 5]
print(totient(360));                 // 96
```

### Running the test suite

```sh
aether test aether-packages/aether-math-extra/tests
# PASS aether-packages/aether-math-extra/tests/tests.ae
# 1 passed, 0 failed
```

The test file contains 25+ `assert_eq` cases including the Carmichael number 561 (which fools Fermat's primality test but is correctly identified as composite by Miller-Rabin) and the first four perfect numbers (6, 28, 496, ...).

### Running the example

```sh
aether run aether-packages/aether-math-extra/examples/example.ae
```

## Design notes

### Why "simplified" Miller-Rabin?

The full Miller-Rabin test picks random witnesses for `k` rounds, giving a probabilistic guarantee (false-positive probability ≤ 4^(-k)). For a fixed set of small-prime witnesses, the test is *deterministic* up to a known bound — for the first 7 primes, that bound is 3.4×10^14, which is way more than we'd ever test in Aether. The package ships the deterministic variant because (a) it's faster (no randomness), (b) it's correct for all practical inputs, and (c) the test cases can be deterministic.

### Why trial division for `primeFactors`?

Pollard's rho algorithm is asymptotically faster for hard composites (O(n^(1/4)) vs O(sqrt(n))), but the implementation is more complex and the constant factor is larger for small inputs. For inputs up to ~10^10, trial division with early-exit on `f*f > n` is faster and far simpler. A future `aether-math-extra-pollard` package could ship the rho algorithm for callers who need it.

### Why `sumDivisors` via factorization rather than direct enumeration?

Two strategies for `sumDivisors(n)`:

1. **Direct enumeration.** Walk all divisors via the `(i, n/i)` pairs, sum them. O(sqrt(n)).
2. **Via factorization.** Factor `n`, then use `sigma(n) = prod((p^(e+1) - 1) / (p - 1))`. O(sqrt(n)) (the factorization dominates), but reuses `primeFactors` and gives the multiplicative structure for free.

Both are O(sqrt(n)) but strategy 2 is reusable: `divisorCount` shares the same factorization. So strategy 2 is what's implemented.

## Future work

- A `pollardRho(n)` factorization for hard composites beyond trial division's reach.
- A `lucasLehmer(p)` primality test for Mersenne numbers `2^p - 1`.
- An `ellipticCurvePrimality(n)` for cryptographic-size inputs (the gold standard for general primality proving).
- A `factorCount(n)` returning the number of distinct ordered factorizations of `n`.

## License

MIT — same as the Aether language.
