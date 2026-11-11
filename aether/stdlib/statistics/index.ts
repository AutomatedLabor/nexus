/**
 * Aether stdlib — `statistics` module.
 *
 * Descriptive and inferential statistics on plain JS number arrays.
 * All functions are pure TypeScript, take numeric arrays (and occasionally
 * a second paired array), and return numbers or arrays.  Each function
 * panics on invalid input — empty arrays where a non-empty is required,
 * mismatched lengths, or non-numeric values.
 *
 * Conventions:
 *  - "Population" semantics by default (divide by N).  Sample variance /
 *    standard deviation use divide-by-(N-1); see the doc on each function.
 *  - All numerics are JS numbers (IEEE-754 doubles).
 *  - Sorting for percentile/quartile uses the linear interpolation method
 *    (same as NumPy's `linear` interpolation), so percentile(p) for p in [0,100]
 *    returns values monotonically increasing in p.
 */

// ---------------------------------------------------------------------------
// Central tendency
// ---------------------------------------------------------------------------

/** Arithmetic mean (sum / n).  Panics on empty. */
export function mean(arr: number[]): number {
  assertNumArray(arr, "mean");
  if (arr.length === 0) throw new Error("mean: empty array");
  let s = 0;
  for (const x of arr) s += x;
  return s / arr.length;
}

/** Median (middle value, with linear interpolation for even-length arrays). */
export function median(arr: number[]): number {
  assertNumArray(arr, "median");
  if (arr.length === 0) throw new Error("median: empty array");
  const sorted = arr.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const mid = n >> 1;
  if (n % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Mode(s): the most frequent value(s).  Returns a single value if unimodal,
 *  or the smallest most-frequent value if multi-modal (deterministic). */
export function mode(arr: number[]): number {
  assertNumArray(arr, "mode");
  if (arr.length === 0) throw new Error("mode: empty array");
  const counts = new Map<number, number>();
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = arr[0];
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && v < best)) {
      best = v; bestCount = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Spread
// ---------------------------------------------------------------------------

/** Population variance: average of squared deviations from the mean. */
export function variance(arr: number[]): number {
  assertNumArray(arr, "variance");
  if (arr.length === 0) throw new Error("variance: empty array");
  const m = mean(arr);
  let s = 0;
  for (const x of arr) { const d = x - m; s += d * d; }
  return s / arr.length;
}

/** Population standard deviation: sqrt(variance). */
export function stdDev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

/** Sample variance (divide by N-1) — Bessel's correction. */
export function sampleVariance(arr: number[]): number {
  assertNumArray(arr, "sampleVariance");
  if (arr.length < 2) throw new Error("sampleVariance: need at least 2 elements");
  const m = mean(arr);
  let s = 0;
  for (const x of arr) { const d = x - m; s += d * d; }
  return s / (arr.length - 1);
}

/** Minimum. */
export function min_(arr: number[]): number {
  assertNumArray(arr, "min_");
  if (arr.length === 0) throw new Error("min_: empty array");
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}

/** Maximum. */
export function max_(arr: number[]): number {
  assertNumArray(arr, "max_");
  if (arr.length === 0) throw new Error("max_: empty array");
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

/** Range: max - min. */
export function range(arr: number[]): number {
  return max_(arr) - min_(arr);
}

/** Sum. */
export function sum_(arr: number[]): number {
  assertNumArray(arr, "sum_");
  let s = 0;
  for (const x of arr) s += x;
  return s;
}

/** Product of all elements. */
export function product(arr: number[]): number {
  assertNumArray(arr, "product");
  let p = 1;
  for (const x of arr) p *= x;
  return p;
}

// ---------------------------------------------------------------------------
// Quantiles
// ---------------------------------------------------------------------------

/** Quartiles Q1, Q2 (median), Q3 as [q1, q2, q3].  Uses linear interpolation. */
export function quartiles(arr: number[]): [number, number, number] {
  assertNumArray(arr, "quartiles");
  if (arr.length === 0) throw new Error("quartiles: empty array");
  return [percentile(arr, 25), percentile(arr, 50), percentile(arr, 75)];
}

/** Percentile using linear interpolation (NumPy's default).  `p` is 0-100. */
export function percentile(arr: number[], p: number): number {
  assertNumArray(arr, "percentile");
  if (arr.length === 0) throw new Error("percentile: empty array");
  if (typeof p !== "number" || !Number.isFinite(p)) throw new Error("percentile: p must be a number");
  if (p < 0 || p > 100) throw new Error("percentile: p must be in [0, 100]");
  const sorted = arr.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Interquartile range: Q3 - Q1. */
export function iqr(arr: number[]): number {
  const q = quartiles(arr);
  return q[2] - q[0];
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** Skewness (population, Fisher-Pearson coefficient). */
export function skewness(arr: number[]): number {
  assertNumArray(arr, "skewness");
  if (arr.length < 3) throw new Error("skewness: need at least 3 elements");
  const m = mean(arr);
  const n = arr.length;
  let s2 = 0, s3 = 0;
  for (const x of arr) { const d = x - m; s2 += d * d; s3 += d * d * d; }
  const sd = Math.sqrt(s2 / n);
  if (sd === 0) return 0;
  return (s3 / n) / (sd * sd * sd);
}

/** Excess kurtosis (kurtosis - 3, so a normal distribution gives 0). */
export function kurtosis(arr: number[]): number {
  assertNumArray(arr, "kurtosis");
  if (arr.length < 4) throw new Error("kurtosis: need at least 4 elements");
  const m = mean(arr);
  const n = arr.length;
  let s2 = 0, s4 = 0;
  for (const x of arr) { const d = x - m; const d2 = d * d; s2 += d2; s4 += d2 * d2; }
  const v = s2 / n;
  if (v === 0) return 0;
  return (s4 / n) / (v * v) - 3;
}

// ---------------------------------------------------------------------------
// Bivariate
// ---------------------------------------------------------------------------

/** Covariance (population): average of products of paired deviations. */
export function covariance(a: number[], b: number[]): number {
  assertNumArray(a, "covariance");
  assertNumArray(b, "covariance");
  if (a.length !== b.length) throw new Error("covariance: arrays must have the same length");
  if (a.length === 0) throw new Error("covariance: empty arrays");
  const ma = mean(a), mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / a.length;
}

/** Pearson correlation coefficient in [-1, 1]. */
export function correlation(a: number[], b: number[]): number {
  const cov = covariance(a, b);
  const sa = stdDev(a), sb = stdDev(b);
  if (sa === 0 || sb === 0) throw new Error("correlation: zero variance");
  return cov / (sa * sb);
}

/** Simple linear regression on (xs, ys).  Returns {slope, intercept, r2}. */
export function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  assertNumArray(xs, "linearRegression");
  assertNumArray(ys, "linearRegression");
  if (xs.length !== ys.length) throw new Error("linearRegression: arrays must have the same length");
  if (xs.length < 2) throw new Error("linearRegression: need at least 2 points");
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0) throw new Error("linearRegression: zero variance in x");
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2 };
}

/** R² (coefficient of determination) for (xs, ys).  1 = perfect linear fit. */
export function rSquare(xs: number[], ys: number[]): number {
  return linearRegression(xs, ys).r2;
}

/** Z-score of `x` within `arr`'s distribution: (x - mean) / stdDev. */
export function zScore(arr: number[], x: number): number {
  const m = mean(arr);
  const sd = stdDev(arr);
  if (sd === 0) throw new Error("zScore: zero standard deviation");
  return (x - m) / sd;
}

// ---------------------------------------------------------------------------
// Smoothing & binning
// ---------------------------------------------------------------------------

/** Histogram: count of elements in each of `bins` equal-width buckets over [min, max].
 *  Returns the counts (length = bins).  Values outside [min, max] are clamped. */
export function histogram(arr: number[], bins: number): number[] {
  assertNumArray(arr, "histogram");
  if (typeof bins !== "number" || !Number.isFinite(bins) || bins <= 0) {
    throw new Error("histogram: bins must be a positive integer");
  }
  const b = Math.floor(bins);
  if (arr.length === 0) throw new Error("histogram: empty array");
  const lo = min_(arr), hi = max_(arr);
  const out = new Array(b).fill(0);
  if (lo === hi) { out[0] = arr.length; return out; }
  const width = (hi - lo) / b;
  for (const x of arr) {
    let idx = Math.floor((x - lo) / width);
    if (idx >= b) idx = b - 1;
    if (idx < 0) idx = 0;
    out[idx]++;
  }
  return out;
}

/** Cumulative sum: [a, a+b, a+b+c, ...]. */
export function cumulativeSum(arr: number[]): number[] {
  assertNumArray(arr, "cumulativeSum");
  const out: number[] = new Array(arr.length);
  let s = 0;
  for (let i = 0; i < arr.length; i++) { s += arr[i]; out[i] = s; }
  return out;
}

/** Simple moving average with window `w`.  Output length is arr.length - w + 1. */
export function movingAverage(arr: number[], w: number): number[] {
  assertNumArray(arr, "movingAverage");
  if (typeof w !== "number" || !Number.isFinite(w) || w <= 0 || Math.floor(w) !== w) {
    throw new Error("movingAverage: window must be a positive integer");
  }
  if (w > arr.length) throw new Error("movingAverage: window larger than array");
  const out: number[] = new Array(arr.length - w + 1);
  let s = 0;
  for (let i = 0; i < w; i++) s += arr[i];
  out[0] = s / w;
  for (let i = w; i < arr.length; i++) {
    s += arr[i] - arr[i - w];
    out[i - w + 1] = s / w;
  }
  return out;
}

/** Exponential smoothing: s_0 = arr[0], s_t = alpha*arr[t] + (1-alpha)*s_{t-1}. */
export function exponentialSmooth(arr: number[], alpha: number): number[] {
  assertNumArray(arr, "exponentialSmooth");
  if (typeof alpha !== "number" || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new Error("exponentialSmooth: alpha must be in [0, 1]");
  }
  if (arr.length === 0) return [];
  const out: number[] = new Array(arr.length);
  out[0] = arr[0];
  for (let i = 1; i < arr.length; i++) {
    out[i] = alpha * arr[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

/** Chi-square statistic Σ((O - E)² / E).  O and E must have equal length. */
export function chiSquare(observed: number[], expected: number[]): number {
  assertNumArray(observed, "chiSquare");
  assertNumArray(expected, "chiSquare");
  if (observed.length !== expected.length) throw new Error("chiSquare: arrays must have the same length");
  let chi = 0;
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] === 0) throw new Error("chiSquare: expected value is zero");
    const d = observed[i] - expected[i];
    chi += (d * d) / expected[i];
  }
  return chi;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "statistics",
  fns: [
    { name: "mean", sig: "(arr: number[]) -> float", desc: "Arithmetic mean (sum / n)." },
    { name: "median", sig: "(arr: number[]) -> float", desc: "Middle value (linear interpolation for even-length arrays)." },
    { name: "mode", sig: "(arr: number[]) -> number", desc: "Most frequent value (smallest most-frequent if multimodal)." },
    { name: "variance", sig: "(arr: number[]) -> float", desc: "Population variance (divide by N)." },
    { name: "stdDev", sig: "(arr: number[]) -> float", desc: "Population standard deviation (sqrt of variance)." },
    { name: "sampleVariance", sig: "(arr: number[]) -> float", desc: "Sample variance (Bessel's correction, divide by N-1)." },
    { name: "min_", sig: "(arr: number[]) -> number", desc: "Minimum." },
    { name: "max_", sig: "(arr: number[]) -> number", desc: "Maximum." },
    { name: "range", sig: "(arr: number[]) -> number", desc: "Range: max - min." },
    { name: "sum_", sig: "(arr: number[]) -> number", desc: "Sum." },
    { name: "product", sig: "(arr: number[]) -> number", desc: "Product of all elements." },
    { name: "quartiles", sig: "(arr: number[]) -> [float, float, float]", desc: "[Q1, Q2 (median), Q3]." },
    { name: "percentile", sig: "(arr: number[], p: float) -> float", desc: "Percentile via linear interpolation (p in 0-100)." },
    { name: "iqr", sig: "(arr: number[]) -> float", desc: "Interquartile range: Q3 - Q1." },
    { name: "skewness", sig: "(arr: number[]) -> float", desc: "Fisher-Pearson skewness (population)." },
    { name: "kurtosis", sig: "(arr: number[]) -> float", desc: "Excess kurtosis (normal = 0)." },
    { name: "covariance", sig: "(a: number[], b: number[]) -> float", desc: "Population covariance." },
    { name: "correlation", sig: "(a: number[], b: number[]) -> float", desc: "Pearson correlation in [-1, 1]." },
    { name: "linearRegression", sig: "(xs, ys) -> {slope, intercept, r2}", desc: "Simple linear regression." },
    { name: "rSquare", sig: "(xs, ys) -> float", desc: "R² (coefficient of determination)." },
    { name: "zScore", sig: "(arr: number[], x) -> float", desc: "Z-score of x within arr." },
    { name: "histogram", sig: "(arr: number[], bins: int) -> int[]", desc: "Counts in each of bins equal-width buckets." },
    { name: "cumulativeSum", sig: "(arr: number[]) -> number[]", desc: "Cumulative sum array." },
    { name: "movingAverage", sig: "(arr, w: int) -> float[]", desc: "Simple moving average with window w." },
    { name: "exponentialSmooth", sig: "(arr, alpha: float) -> float[]", desc: "Exponential smoothing with weight alpha in [0,1]." },
    { name: "chiSquare", sig: "(observed, expected) -> float", desc: "Chi-square statistic Σ((O-E)²/E)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("mean", mean);
  registerBuiltin("median", median);
  registerBuiltin("mode", mode);
  registerBuiltin("variance", variance);
  registerBuiltin("stdDev", stdDev);
  registerBuiltin("sampleVariance", sampleVariance);
  registerBuiltin("min_", min_);
  registerBuiltin("max_", max_);
  registerBuiltin("range", range);
  registerBuiltin("sum_", sum_);
  registerBuiltin("product", product);
  registerBuiltin("quartiles", quartiles);
  registerBuiltin("percentile", percentile);
  registerBuiltin("iqr", iqr);
  registerBuiltin("skewness", skewness);
  registerBuiltin("kurtosis", kurtosis);
  registerBuiltin("covariance", covariance);
  registerBuiltin("correlation", correlation);
  registerBuiltin("linearRegression", linearRegression);
  registerBuiltin("rSquare", rSquare);
  registerBuiltin("zScore", zScore);
  registerBuiltin("histogram", histogram);
  registerBuiltin("cumulativeSum", cumulativeSum);
  registerBuiltin("movingAverage", movingAverage);
  registerBuiltin("exponentialSmooth", exponentialSmooth);
  registerBuiltin("chiSquare", chiSquare);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertNumArray(x: any, fn: string): asserts x is number[] {
  if (!Array.isArray(x)) throw new Error(fn + ": expected number[], got " + kind(x));
  for (let i = 0; i < x.length; i++) {
    if (typeof x[i] !== "number" || !Number.isFinite(x[i])) {
      throw new Error(fn + ": non-finite element at index " + i);
    }
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
