# Aether stdlib — `math`

The `math` module is the home of numeric primitives for Aether programs.  It mirrors the JavaScript `Math` object for the usual trigonometry, rounding, and logarithm functions, then adds a handful of arithmetic helpers (`gcd`, `lcm`, `mod`, `clamp`, `lerp`, `factorial`, `isPrime`, `sum`, `mean`) and exposes the constants `PI` and `E` as zero-argument functions.

All functions are pure TypeScript and synchronous.  Numeric inputs are validated at the boundary; invalid inputs panic with a clear message (rather than silently returning `NaN`), which keeps Aether programs from leaking IEEE-754 surprises into user code.  In particular:

- `sqrt(-1)` panics instead of returning `NaN`.
- `log(0)` and `log(-3)` panic instead of returning `-Infinity`/`NaN`.
- `asin(2)` and `acos(2)` panic because the inputs are out of `[-1, 1]`.
- `factorial(-1)` and `factorial(200)` panic: the first because factorial is only defined on non-negative integers, the second because `200!` exceeds `Number.MAX_VALUE` and the result would overflow to `Infinity`.
- `mod(_, 0)` panics — there is no well-defined modulo by zero.
- `clamp(_, 10, 0)` panics when `lo > hi` since the range is empty.

Integer-typed functions (`gcd`, `lcm`, `mod`, `factorial`, `isPrime`) additionally reject non-integer inputs.  `sum` and `mean` accept any finite `number` in the array.

Where two natural definitions exist the module picks the more useful one for application code:

- `round` follows JS `Math.round` (round-half-up for positives, round-half-down for negatives).  If you need banker's rounding you can compose it from `floor((x + 0.5) / 1) * 1` or wait for the future `bankersRound` helper.
- `mod` is Euclidean: the result is always non-negative, so `mod(-7, 3) == 2` rather than `-1`.  This matches the behaviour most programmers expect from a high-level modulo.
- `sign` returns `-1`, `0`, or `1` and never `NaN` — `sign(NaN)` panics.

## Functions

### `abs(n: number) -> number`
Absolute value.

```aether
math.abs(-5)      // 5
math.abs(0)       // 0
```

### `sign(n: number) -> int`
Returns `-1`, `0`, or `1` according to the sign of `n`.  Panics on `NaN`.

```aether
math.sign(-3)     // -1
math.sign(0)      // 0
math.sign(3)      // 1
```

### `min(...a: number) -> number`
Returns the smallest of its arguments.  At least one argument is required.

```aether
math.min(3, 1, 2)  // 1
```

### `max(...a: number) -> number`
Returns the largest of its arguments.

```aether
math.max(3, 1, 2)  // 3
math.max(-3, -1, -2)  // -1
```

### `floor(f: number) -> int`
Round towards negative infinity.

```aether
math.floor(2.7)   // 2
math.floor(-2.1)  // -3
```

### `ceil(f: number) -> int`
Round towards positive infinity.

```aether
math.ceil(2.1)    // 3
math.ceil(-2.7)   // -2
```

### `round(f: number) -> int`
Round to the nearest integer (half up for positives, half down for negatives).

```aether
math.round(2.5)   // 3
math.round(-2.5)  // -2
```

### `trunc(f: number) -> int`
Truncate the fractional part (round towards zero).

```aether
math.trunc(-2.7)  // -2
math.trunc(2.7)   // 2
```

### `sqrt(f: number) -> number`
Square root.  Panics on negative input.

```aether
math.sqrt(16)     // 4
math.sqrt(-1)     // panic
```

### `pow(base: number, exp: number) -> number`
`base ** exp`.  Handles negative and fractional exponents per IEEE-754.

```aether
math.pow(2, 10)   // 1024
math.pow(2, -1)   // 0.5
math.pow(5, 0)    // 1
```

### `exp(f: number) -> number`
Euler's exponential `e^f`.

```aether
math.exp(0)       // 1
math.exp(1)       // ~2.71828
```

### `log(f: number) -> number`
Natural logarithm.  Panics on non-positive input.

```aether
math.log(math.E) // 1
math.log(0)      // panic
```

### `log2(f: number) -> number`
Base-2 logarithm.  Panics on non-positive input.

```aether
math.log2(8)     // 3
```

### `log10(f: number) -> number`
Base-10 logarithm.  Panics on non-positive input.

```aether
math.log10(1000) // 3
```

### `sin(f: number) -> number`
Sine of `f` (in radians).

```aether
math.sin(0)             // 0
math.sin(math.PI / 2)   // 1
```

### `cos(f: number) -> number`
Cosine of `f` (radians).

```aether
math.cos(0)             // 1
math.cos(math.PI)       // -1
```

### `tan(f: number) -> number`
Tangent of `f` (radians).

```aether
math.tan(0)             // 0
```

### `asin(f: number) -> number`
Arc sine in radians.  Panics when `f` is outside `[-1, 1]`.

```aether
math.asin(0)   // 0
math.asin(2)   // panic
```

### `acos(f: number) -> number`
Arc cosine in radians.  Panics when `f` is outside `[-1, 1]`.

```aether
math.acos(1)   // 0
```

### `atan(f: number) -> number`
Arc tangent in radians, range `(-π/2, π/2)`.

```aether
math.atan(0)   // 0
```

### `atan2(y: number, x: number) -> number`
Quadrant-aware two-argument arc tangent.  Returns the angle in radians between the positive x-axis and the point `(x, y)`.

```aether
math.atan2(1, 0)    // ~1.5708
math.atan2(-1, -1)  // ~-2.356
```

### `PI() -> number`
The constant π.  Registered as a zero-arg function so it composes like any other builtin.

```aether
math.PI()  // 3.141592653589793
```

### `E() -> number`
Euler's number `e`.

```aether
math.E()   // 2.718281828459045
```

### `gcd(a: int, b: int) -> int`
Greatest common divisor via the Euclidean algorithm.  Inputs are taken in absolute value so `gcd(-12, 18) == 6`.

```aether
math.gcd(12, 18)   // 6
math.gcd(7, 5)     // 1
```

### `lcm(a: int, b: int) -> int`
Least common multiple.  Returns `0` if either argument is `0`.

```aether
math.lcm(4, 6)    // 12
math.lcm(0, 5)    // 0
```

### `clamp(n: number, lo: number, hi: number) -> number`
Clamp `n` to the closed range `[lo, hi]`.  Panics when `lo > hi`.

```aether
math.clamp(5, 0, 10)    // 5
math.clamp(-1, 0, 10)   // 0
math.clamp(11, 0, 10)   // 10
```

### `lerp(a: number, b: number, t: number) -> number`
Linear interpolation `a + (b - a) * t`.  `t = 0` returns `a`, `t = 1` returns `b`; values outside `[0, 1]` extrapolate.

```aether
math.lerp(0, 10, 0.5)   // 5
math.lerp(0, 10, 2)     // 20 (extrapolated)
```

### `mod(a: int, b: int) -> int`
Euclidean modulo.  The result always satisfies `0 <= mod(a, b) < abs(b)`.

```aether
math.mod(7, 3)    // 1
math.mod(-7, 3)   // 2
math.mod(1, 0)    // panic
```

### `factorial(n: int) -> int`
Computes `n!`.  Panics for negative inputs and for inputs larger than 170 (which would overflow `Infinity`).

```aether
math.factorial(0)   // 1
math.factorial(5)    // 120
```

### `isPrime(n: int) -> bool`
Trial-division primality test up to `sqrt(n)`.  Returns `false` for `n < 2`.

```aether
math.isPrime(2)    // true
math.isPrime(17)   // true
math.isPrime(15)   // false
```

### `sum(arr: number[]) -> number`
Sum of an array of numbers.  Returns `0` for an empty array.

```aether
math.sum([1, 2, 3, 4])   // 10
math.sum([])              // 0
```

### `mean(arr: number[]) -> number`
Arithmetic mean of an array of numbers.  Panics for an empty array.

```aether
math.mean([2, 4, 6])    // 4
```

## Rounding pitfalls and conventions

JavaScript's `Math.round(x)` rounds half towards positive infinity, so `Math.round(-2.5)` is `-2` (not `-3`).  `math.round` preserves that behaviour to avoid surprising users who already know JS, but be aware that it differs from Python's `round` (which is banker's rounding).  When in doubt, use `floor` / `ceil` and an explicit `+ 0.5` shift to define exactly the rounding you want.

## Performance notes

The `sum` and `mean` helpers are simple imperative loops rather than `.reduce` chains; this avoids the `0 + x` warm-up and the closure allocation, which matters when the array is large.  `isPrime` is the textbook trial-division algorithm with a `sqrt(n)` ceiling — sufficient for `n` up to a few hundred million.  For larger inputs a Miller–Rabin helper will arrive in a later module.
