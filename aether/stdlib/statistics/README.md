# Aether stdlib — `statistics`

The `statistics` module gives Aether programs a compact statistics toolkit: descriptive measures (mean, median, mode, variance, percentiles), shape metrics (skewness, kurtosis), bivariate analysis (covariance, correlation, linear regression), and smoothing/binning helpers (histogram, cumulative sum, moving average, exponential smoothing). Every function is a pure TypeScript implementation that operates on plain JavaScript `number[]` arrays. Throwing a plain `Error` from a builtin becomes an Aether panic.

## Conventions

- **Population vs. sample**: by default, `variance` and `stdDev` divide by N (population). `sampleVariance` divides by N-1 (Bessel's correction) and is the one to use when your array is a sample of a larger population. Most other functions are population-neutral.
- **All inputs are number arrays** — pass `["x"]` or `[NaN]` and you get `panic: ...: non-finite element at index 0`. Empty arrays panic where a non-empty is required (mean, median, variance); functions like `cumulativeSum`, `exponentialSmooth`, `product` accept empty and return the obvious empty/identity value.
- **Percentile/quartile interpolation** uses NumPy's `linear` method: rank = `p/100 * (n-1)`, then linearly interpolate between `sorted[floor(rank)]` and `sorted[ceil(rank)]`. This means `percentile(arr, 0)` is the min, `percentile(arr, 100)` is the max, and `percentile(arr, 50)` equals `median(arr)` exactly — no off-by-one surprises.
- **Bivariate functions** require equal-length arrays and panic otherwise. `correlation` panics if either array has zero variance (the result is mathematically undefined).
- **Sorts are non-destructive** — `median`, `percentile`, `quartiles` copy first via `slice()`, then sort the copy. Your input array order is preserved.

## Central tendency: mean, median, mode

`mean(arr)` is the arithmetic mean (sum / n). `median(arr)` returns the middle value, with linear interpolation for even-length arrays (`(a[n/2-1] + a[n/2]) / 2`). `mode(arr)` returns the most frequent value; if multiple values tie, it returns the smallest one (deterministic, useful for tests). For a true multi-modal return, use `set.setFold(set.setNew(arr), ...)` and pick all max-count values yourself.

```aether
statistics.mean([1, 2, 3, 4])         // 2.5
statistics.median([1, 2, 3, 4])       // 2.5 (average of two middles)
statistics.median([1, 2, 3])         // 2
statistics.mode([1, 2, 2, 3])        // 2
statistics.mode([1, 1, 2, 2, 3])     // 1 (smallest of the two ties)
```

## Spread: variance, stdDev, range, min/max

`variance(arr)` is the population variance (divide by N). `stdDev(arr)` is its square root. `sampleVariance(arr)` divides by N-1; for samples of fewer than 2 elements it panics. `min_`/`max_` (the trailing underscore avoids clashes with the evaluator's `min`/`max` builtins) are obvious; `range` is max minus min; `sum_`/`product` are aggregate accumulators.

```aether
statistics.variance([2,4,4,4,5,5,7,9])   // 4.0 (population)
statistics.stdDev([2,4,4,4,5,5,7,9])     // 2.0
statistics.sampleVariance([2,4,4,4,5,5,7,9])  // ~4.571 (32/7)
statistics.min_([3,1,2])   // 1
statistics.max_([3,1,2])   // 3
statistics.range([3,1,2])  // 2
statistics.product([1,2,3,4])  // 24
```

## Quantiles: quartiles, percentile, iqr

`percentile(arr, p)` is the foundational function — it returns the value below which `p` percent of the data falls, using linear interpolation. `quartiles(arr)` returns `[Q1, Q2, Q3]` = `[percentile(arr,25), percentile(arr,50), percentile(arr,75)]`. `iqr(arr)` is the interquartile range `Q3 - Q1` — robust to outliers and a common box-plot input.

```aether
statistics.percentile([10,20,30,40,50], 50)  // 30 (median)
statistics.percentile([10,20,30,40], 25)     // 17.5 (linear interp)
statistics.quartiles([1,2,3,4,5,6,7,8])      // [2.75, 4.5, 6.25]
statistics.iqr([1,2,3,4,5,6,7,8])            // 3.5
```

## Shape: skewness, kurtosis

`skewness(arr)` is the Fisher-Pearson population skewness — the third standardized moment. Symmetric data is near 0, right-tailed data is positive, left-tailed is negative. `kurtosis(arr)` returns *excess* kurtosis (kurtosis minus 3), so a normal distribution gives 0. Flat distributions (like uniform) give negative values; heavy-tailed distributions give positive values. Both require at least 3 and 4 elements respectively.

```aether
statistics.skewness([1,2,3,4,5])            // ~0 (symmetric)
statistics.skewness([1,2,3,4,100])          // positive (right tail)
statistics.kurtosis([1,2,3,4,5,6,7,8,9,10,11,12])  // negative (flat)
```

## Bivariate: covariance, correlation, linearRegression

`covariance(a, b)` is the population covariance — positive when the two variables tend to move together, negative when opposite. `correlation(a, b)` is the Pearson correlation coefficient, normalized to [-1, 1]. `linearRegression(xs, ys)` returns `{slope, intercept, r2}` — the OLS line of best fit, with R² (coefficient of determination) telling you how much of the variance in y is explained by the linear model. `rSquare(xs, ys)` is a thin wrapper returning just the R².

```aether
statistics.covariance([1,2,3], [2,4,6])   // 2/3 (positive)
statistics.correlation([1,2,3], [2,4,6]) // 1.0 (perfect positive)
statistics.correlation([1,2,3], [3,2,1]) // -1.0 (perfect negative)
const fit = statistics.linearRegression([1,2,3,4], [3,5,7,9])
fit.slope       // 2
fit.intercept   // 1
fit.r2          // 1.0
```

## Z-scores and binning

`zScore(arr, x)` returns `(x - mean) / stdDev` — how many standard deviations above (or below) the mean `x` is. Useful for outlier detection and for normalizing features. `histogram(arr, bins)` counts how many elements fall into each of `bins` equal-width buckets over `[min, max]`. Values outside the range are clamped to the nearest bucket. `cumulativeSum(arr)` returns the running total. `movingAverage(arr, w)` is the simple moving average with window `w` — output length is `n - w + 1`. `exponentialSmooth(arr, alpha)` is the classic EWMA with smoothing weight `alpha` in [0, 1].

```aether
statistics.zScore([10,10,10,20], 15)    // ~0.577 (one SD above mean)
statistics.histogram([1,2,3,4,5], 5)    // [1,1,1,1,1]
statistics.histogram([1,1,5,5,5], 2)    // [2,3]
statistics.cumulativeSum([1,2,3,4])     // [1,3,6,10]
statistics.movingAverage([1,2,3,4,5], 3) // [2,3,4]
statistics.exponentialSmooth([1,2,3], 0.5)  // [1, 1.5, 2.25]
```

## Inferential: chiSquare

`chiSquare(observed, expected)` returns the chi-square statistic `Σ((O - E)² / E)` — useful for goodness-of-fit testing against an expected distribution. The arrays must have the same length; the expected array must not contain any zeros (division by zero would be undefined).

```aether
statistics.chiSquare([10,10], [10,10])   // 0 (perfect fit)
statistics.chiSquare([10,10], [5,15])    // ~6.667
```

## Numerical caveats

- All operations use IEEE-754 doubles. Sums of very large arrays can accumulate rounding error; for exact decimal arithmetic, use a dedicated decimal library.
- `variance` / `stdDev` use the naive two-pass algorithm (compute mean, then sum of squared deviations). For very large arrays with a tiny variance, this loses precision; for production stats work, use a streaming algorithm. The naive version is fine for arrays up to a few million elements.
- `correlation` / `linearRegression` panic on zero variance. This is the mathematically correct behavior — the result is undefined — and surfaces bugs more loudly than returning `NaN`.

## Choosing population vs. sample semantics

The default `variance` and `stdDev` use **population** semantics (divide by N). This is the right choice when:

- Your array *is* the entire population (e.g. "every score on this test").
- You're computing descriptive statistics to *describe* the data, not to infer anything beyond it.
- You're normalizing features for a machine-learning pipeline and want consistency between training and inference.

Reach for `sampleVariance` (divide by N-1, Bessel's correction) when:

- Your array is a *sample* of a larger population, and you want an unbiased estimate of that population's variance.
- You're doing hypothesis testing (t-tests, ANOVAs) — they assume sample variance.
- You're computing confidence intervals for the population mean.

For `covariance` and `correlation`, the same convention applies: the module uses population covariance by default. For sample covariance, divide the result by (N-1)/N — or just multiply by N/(N-1) for a quick adjustment.

## Percentile interpolation reference

`percentile(arr, p)` uses linear interpolation between the two closest order statistics. The formula is:

1. Sort `arr` to get `sorted`.
2. Compute `rank = (p / 100) × (n - 1)` where `n = arr.length`.
3. Let `lo = floor(rank)`, `hi = ceil(rank)`, `frac = rank - lo`.
4. Return `sorted[lo] × (1 - frac) + sorted[hi] × frac`.

This is NumPy's `linear` interpolation method. It has the nice properties:

- `percentile(arr, 0) === min(arr)`.
- `percentile(arr, 100) === max(arr)`.
- `percentile(arr, 50) === median(arr)`.
- The function is monotonic: `p1 < p2` implies `percentile(arr, p1) <= percentile(arr, p2)`.

The alternative interpolation methods (NumPy's `lower`, `higher`, `nearest`, `midpoint`) are not implemented; if you need them, request an extension.

## When NOT to reach for `statistics`

- **Big data / streaming**: the implementations here hold the whole array in memory and pass over it 1–3 times. For arrays that don't fit in memory, use a streaming algorithm (Welford's for variance, P² for quantiles) implemented externally.
- **Statistical inference**: this module computes *descriptive* statistics only. It does not compute p-values, t-statistics, F-statistics, or confidence intervals. For inferential work, use a dedicated stats library.
- **Heavy numerical computing**: the implementations are correct but not vectorized. For hot loops over millions of points, use a library backed by SIMD primitives (Float64Array operations, BLAS, etc.).

The whole module is 26 functions, ~380 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
