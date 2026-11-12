# aether-math

> Extended math functions for Aether — 30 pure functions covering number theory, exponentiation, roots, trigonometry (implemented via Taylor series), rounding, and utility combinators, written in Aether itself.

Aether ships a tiny math core: `abs`, `sqrt`, `int` (truncation), and the arithmetic operators. It deliberately does *not* ship `gcd`, `factorial`, `isPrime`, `pow`, `exp`, `ln`, `sin`, `cos`, `floor`, `clamp`, `lerp`, or any of the other "every program eventually needs these" math operations. The language design principle is: the standard library should be the smallest set of operations that compose into everything else, and the rest should live in user-installable packages.

`aether-math` is the canonical user-installable package for math operations. It is the fourth target of the Aether package registry (RFC-005, draft) and the reference implementation for how math libraries should compose with the core language.

The package's most distinctive feature is that its trigonometric functions (`sin`, `cos`, `tan`, `atan`, `atan2`) are implemented from scratch in Aether via Taylor series. There is no host primitive for `sin` — the package computes `sin(1.0)` as `1 - 1^3/3! + 1^5/5! - ...` in user-space. This is a deliberate design choice: it keeps the language core minimal, demonstrates that Aether is expressive enough for real numerical computing, and gives learners a readable reference for how transcendental functions actually work under the hood.

## Why a math package?

The three math primitives Aether ships (`abs`, `sqrt`, `int`) are the smallest possible set that supports a numeric tower — every other operation can be derived from these plus arithmetic. But "can be derived" and "should be re-derived by every program" are different things. `aether-math` is the canonical user-installable derivation.

The package targets three audiences:

1. **Application authors** who need standard math operations (`gcd`, `factorial`, `clamp`, `lerp`, `floor`, `round`) and don't want to rewrite them in every project.
2. **Numerical-computing authors** who need transcendental functions (`sin`, `cos`, `exp`, `ln`) and want them in pure Aether rather than a host FFI.
3. **Language learners** who want to see how `sin` is actually computed from a Taylor series, or how `ln` is computed via range reduction and a fast-converging series.

## API

All 30 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they return new values and never mutate their inputs. The package also exports two `pub const` constants, `PI` and `E_CONST`, for use in user code.

The package is built only on Aether's core builtins: `+`, `-`, `*`, `/`, `<`, `>`, `==`, `int` (truncation), `abs`, `sqrt`, `len`, `push`, `range`, `min`, `max`, `panic`. No host primitives beyond what the language ships.

### Number theory

| Function | Signature | Description |
| --- | --- | --- |
| `gcd(a, b)` | `(int, int) -> int` | Greatest common divisor (Euclidean algorithm). Returns non-negative. |
| `lcm(a, b)` | `(int, int) -> int` | Least common multiple. Returns 0 if either is 0. |
| `factorial(n)` | `(int) -> int` | `n!`. Returns 1 for `n <= 0`. |
| `isPrime(n)` | `(int) -> bool` | True if `n` is prime. Trial division up to `sqrt(n)`. |
| `primesUpTo(n)` | `(int) -> [int]` | All primes `<= n`. Sieve of Eratosthenes. |
| `fib(n)` | `(int) -> int` | `n`-th Fibonacci number (0-indexed). Iterative. |

### Exponentiation

| Function | Signature | Description |
| --- | --- | --- |
| `pow(a, b)` | `(int, int) -> int` | `a^b` for integer `b >= 0`. Repeated squaring. |
| `modPow(a, b, m)` | `(int, int, int) -> int` | `(a^b) mod m`. Modular exponentiation. |
| `exp(x)` | `(float) -> float` | `e^x` via Taylor series with range reduction. |
| `ln(x)` | `(float) -> float` | Natural log. Range reduction + series `2*(y + y^3/3 + ...)`. |
| `log(b, x)` | `(float, float) -> float` | `log_b(x) = ln(x) / ln(b)`. |

### Roots

| Function | Signature | Description |
| --- | --- | --- |
| `sqrt_(n)` | `(float) -> float` | Square root. Uses the builtin `sqrt`; panics on `n < 0`. |
| `cbrt(n)` | `(float) -> float` | Cube root. Newton's method. |

### Trigonometry

| Function | Signature | Description |
| --- | --- | --- |
| `sin(x)` | `(float) -> float` | Sine. Taylor series `x - x^3/3! + x^5/5! - ...` (15 terms) after angle reduction to `[-pi, pi]`. |
| `cos(x)` | `(float) -> float` | Cosine. Taylor series `1 - x^2/2! + x^4/4! - ...` (15 terms) after angle reduction. |
| `tan(x)` | `(float) -> float` | Tangent. `sin(x) / cos(x)`. Panics if `cos(x) == 0`. |
| `atan(x)` | `(float) -> float` | Arctan. Halving identity twice + Taylor series. |
| `atan2(y, x)` | `(float, float) -> float` | 4-quadrant arctangent. Returns angle in `(-pi, pi]`. |

### Rounding

| Function | Signature | Description |
| --- | --- | --- |
| `floor(x)` | `(float) -> float` | Greatest integer `<= x`. |
| `ceil(x)` | `(float) -> float` | Smallest integer `>= x`. |
| `round(x)` | `(float) -> float` | Nearest integer, ties away from zero. |
| `trunc(x)` | `(float) -> float` | Truncate toward zero. |

### Miscellaneous

| Function | Signature | Description |
| --- | --- | --- |
| `clamp(n, lo, hi)` | `(float, float, float) -> float` | Clamp `n` to `[lo, hi]`. |
| `lerp(a, b, t)` | `(float, float, float) -> float` | Linear interpolation: `a + (b - a) * t`. |
| `sign(x)` | `(float) -> int` | `-1`, `0`, or `1`. |
| `abs_(x)` | `(float) -> float` | Absolute value (uses builtin `abs`). |
| `min_(arr)` | `([float]) -> float` | Minimum of an array. Panics on empty. |
| `max_(arr)` | `([float]) -> float` | Maximum of an array. Panics on empty. |
| `sum_(arr)` | `([float]) -> float` | Sum of an array. |
| `mean(arr)` | `([float]) -> float` | Arithmetic mean. Panics on empty. |
| `deg(r)` | `(float) -> float` | Radians to degrees. |
| `rad(d)` | `(float) -> float` | Degrees to radians. |

### Constants

| Constant | Value |
| --- | --- |
| `PI` | `3.141592653589793` |
| `E_CONST` | `2.718281828459045` |

(The constant is named `E_CONST` because `E` would collide with too many user-defined names. The trailing `_` on `sqrt_`, `abs_`, `min_`, `max_`, `sum_` similarly avoids collisions with the core builtins of the same names.)

## How to use

### As a dependency

Add `aether-math` to your project's `aether.toml`:

```toml
[dependencies]
aether-math = "0.1.0"
```

Then in your Aether source, import the functions you need:

```aether
import { gcd, lcm, isPrime, primesUpTo, PI, sin, cos, atan2 } from "aether-math";

print(gcd(12, 18));    // 6
print(lcm(4, 6));      // 12
print(isPrime(17));    // true
print(primesUpTo(20)); // [2, 3, 5, 7, 11, 13, 17, 19]
print(sin(PI / 2));    // 1.0 (approximately)
print(atan2(1, 1));    // 0.7853981633974483 (= pi/4)
```

### Locally (without the registry)

```aether
import { clamp, lerp, fib } from "./aether-packages/aether-math/src/lib.ae";

print(clamp(15, 0, 10));  // 10
print(lerp(0, 100, 0.25)); // 25
print(fib(10));            // 55
```

### Running the test suite

```sh
aether test aether-packages/aether-math/tests
# PASS aether-packages/aether-math/tests/tests.ae
# 1 passed, 0 failed
```

The test file (`tests/tests.ae`) contains 30+ `assert_eq` and `assert` cases covering every `pub fn` in the library, including tolerance-based checks for the transcendental functions.

### Running the example

```sh
aether run aether-packages/aether-math/examples/example.ae
```

The example exercises every function with a small input, producing a snapshot of expected outputs.

## Design notes

### Why Taylor series for trigonometry?

The standard library could ship `sin`, `cos`, `exp`, `ln` as host primitives (calling into JavaScript's `Math.sin` etc.). It doesn't, for three reasons:

1. **Minimal core.** Aether's design principle is "smallest set of operations that compose into everything else." Adding `sin` as a builtin would be a slippery slope — why not `tan`, `atan2`, `erf`, `tgamma`, `lgamma`? Pushing these into user-space keeps the core small.
2. **Learner value.** Seeing `sin(x) = x - x^3/3! + x^5/5! - ...` in Aether source is more instructive than seeing a black-box `sin(x)` call. The package doubles as a teaching reference for numerical methods.
3. **Composability.** If `sin` is user-space, it can be overridden, optimized, or extended (e.g. with arbitrary-precision arithmetic) without changing the language.

The downside is performance: a Taylor series in interpreted Aether is ~100x slower than a host `Math.sin`. For most use cases (geometry, simple physics, plotting), the precision and speed are good enough. For high-throughput numerical computing, a future `aether-math-fast` package could provide host-backed primitives.

### Why range reduction for `sin` and `cos`?

The Taylor series for `sin(x)` converges for any `x`, but the convergence is slow for large `|x|` — `sin(1000)` would need ~1000 terms to converge. To make the series practical, we reduce `x` to the range `[-pi, pi]` before applying the Taylor expansion. This is the standard technique used by every math library (C, Java, Python).

The reduction is `y = x - 2*pi * int(x / (2*pi))`, with adjustment to `[-pi, pi]` if `y` is in `(pi, 2pi]` or `[-2pi, -pi)`. After reduction, `sin(y) = sin(x)` (since `sin` is 2π-periodic), and the Taylor series converges in ~15 terms to machine precision.

### Why the halving identity for `atan`?

The Taylor series for `atan(x) = x - x^3/3 + x^5/5 - ...` converges only for `|x| <= 1`, and even for `|x| = 1`, the convergence is the alternating harmonic series — log-like, ~10000 terms for 4 decimal places.

To make `atan` practical, we use the halving identity `atan(x) = 2 * atan(x / (1 + sqrt(1 + x*x)))`, applied twice. This shrinks `x` from `1` to `~0.41` to `~0.20`. The Taylor series at `0.20` converges in ~30 terms to machine precision. We then multiply the result by 4 (since we halved twice, `atan(x) = 4 * atan(y2)`).

For `|x| > 1`, we use `atan(x) = pi/2 - atan(1/x)` (or `-pi/2 - atan(1/x)` for `x < -1`).

### Why `pow` is integer-only

`pow(a, b)` is declared with `(int, int) -> int` signature. This covers `pow(2, 10) = 1024` (the common case) but not `pow(2, 0.5) = sqrt(2)`. The float-exponent case is supported via `exp(b * ln(a))` — for example, `pow(2, 0.5) = exp(0.5 * ln(2))`. We chose to keep `pow` integer-only to avoid the float-exponent API confusion (negative base, fractional exponent with negative base, etc.) and because the integer case (with repeated squaring) is much faster than the float case.

### Why `floor` and `trunc` are different

`floor(x)` returns the greatest integer `<= x`. `trunc(x)` truncates toward zero. They differ for negative `x`:

- `floor(-2.5) = -3` (round down toward negative infinity)
- `trunc(-2.5) = -2` (truncate toward zero)

`int(x)` (the builtin) is `trunc(x)`. We expose both `floor` and `trunc` because different applications need different semantics — `floor` for array indexing and time-step counting, `trunc` for digit extraction and floating-point decomposition.

### Why panics on `min_`/`max_`/`mean` empty?

The minimum/maximum/mean of an empty array is mathematically undefined. Two options:

1. **Panic** (chosen). Forces the caller to handle emptiness explicitly. Matches Haskell's `minimum`/`maximum` (which throw on empty).
2. **Return a default** (e.g. `0`). Silent failure — bugs from accidentally passing an empty array would be hard to track down.

The panic message is descriptive (`"min_: empty array"`) so the error is easy to find.

### Why `sqrt_` and not `sqrt`

`sqrt` is a builtin in Aether. Naming the wrapper `sqrt_` avoids a collision (the wrapper adds a domain check that the builtin lacks). The same convention applies to `abs_` (wrapping `abs`), `min_` (taking an array rather than varargs), `max_`, `sum_`.

## Implementation patterns

The codebase uses a small set of recurring patterns.

### Pattern 1: trial division / iteration

`gcd`, `factorial`, `fib`, `isPrime`, `pow`, `modPow` use simple while loops:

```aether
pub fn fib(n: int) -> int {
  if n <= 0 { 0 } else {
    if n == 1 { 1 } else {
      let mut a = 0;
      let mut b = 1;
      let mut i = 2;
      while i <= n {
        let t = a + b;
        a = b;
        b = t;
        i = i + 1;
      }
      b
    }
  }
}
```

### Pattern 2: sieve

`primesUpTo` uses a boolean-array sieve (Sieve of Eratosthenes):

```aether
let mut sieve = [];
while k <= n { push(sieve, true); k = k + 1; }
sieve[0] = false;
sieve[1] = false;
let mut i = 2;
while i * i <= n {
  if sieve[i] {
    let mut j = i * i;
    while j <= n {
      sieve[j] = false;
      j = j + i;
    }
  };
  i = i + 1;
}
```

### Pattern 3: Taylor series

`sin`, `cos`, `exp` use the iterative Taylor series pattern: compute term `k+1` from term `k` via a multiplicative update:

```aether
let mut sum = y;
let mut term = y;
let mut k = 1;
while k < 15 {
  term = term * (-y * y) / ((2 * k) * (2 * k + 1));
  sum = sum + term;
  k = k + 1;
}
sum
```

This is more numerically stable than recomputing `y^(2k+1) / (2k+1)!` from scratch each iteration.

### Pattern 4: Newton's method

`cbrt` uses Newton's iteration: `x_{n+1} = (2*x_n + a/x_n^2) / 3`, with a convergence check:

```aether
let mut x = a;
let mut i = 0;
while i < 50 {
  let next = (2 * x + a / (x * x)) / 3;
  ...
  x = next;
  i = i + 1;
}
```

## Future work

- **Float-exponent `pow`.** Add `powf(base, exp)` that uses `exp(exp * ln(base))` for non-integer exponents.
- **Hyperbolic functions.** `sinh`, `cosh`, `tanh` are easy Taylor series and would round out the trig set.
- **Statistical functions.** `variance`, `stdev`, `median` could live here or in a separate `aether-statistics` package (the `aether/stdlib/statistics` host package already exists).
- **BigInt support.** Currently `factorial(20)` overflows JS numbers; a BigInt variant could be in `aether-math-bigint`.

## License

MIT — same as the Aether language.
