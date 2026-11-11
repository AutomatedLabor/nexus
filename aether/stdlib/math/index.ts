/**
 * Aether stdlib — `math` module.
 *
 * Pure TypeScript numeric helpers.  All functions are synchronous and panic
 * via plain `Error` on bad input (which the evaluator surfaces as an Aether
 * panic).  `PI` and `E` are exposed as zero-arg functions returning constants
 * (since Aether builtins are first-class values that take arguments, we
 * surface constants as functions the user calls with no args).
 */

export const PI: number = Math.PI;
export const E: number = Math.E;

export function abs(n: number): number {
  assertNum(n, "abs");
  return Math.abs(n);
}

export function sign(n: number): number {
  assertNum(n, "sign");
  // Returns -1, 0, or 1 — never NaN (we treat NaN as panic).
  if (Number.isNaN(n)) throw new Error("sign: NaN is not signed");
  return Math.sign(n);
}

export function min(...a: number[]): number {
  if (a.length === 0) throw new Error("min: needs at least one argument");
  for (const x of a) assertNum(x, "min");
  return Math.min(...a);
}

export function max(...a: number[]): number {
  if (a.length === 0) throw new Error("max: needs at least one argument");
  for (const x of a) assertNum(x, "max");
  return Math.max(...a);
}

export function floor(f: number): number {
  assertNum(f, "floor");
  return Math.floor(f);
}

export function ceil(f: number): number {
  assertNum(f, "ceil");
  return Math.ceil(f);
}

export function round(f: number): number {
  assertNum(f, "round");
  // JS Math.round rounds half up for positives, half down for negatives.
  return Math.round(f);
}

export function trunc(f: number): number {
  assertNum(f, "trunc");
  return Math.trunc(f);
}

export function sqrt(f: number): number {
  assertNum(f, "sqrt");
  if (f < 0) throw new Error("sqrt: negative input");
  return Math.sqrt(f);
}

export function pow(base: number, exp: number): number {
  assertNum(base, "pow");
  assertNum(exp, "pow");
  return Math.pow(base, exp);
}

export function exp(f: number): number {
  assertNum(f, "exp");
  return Math.exp(f);
}

export function log(f: number): number {
  assertNum(f, "log");
  if (f <= 0) throw new Error("log: non-positive input");
  return Math.log(f);
}

export function log2(f: number): number {
  assertNum(f, "log2");
  if (f <= 0) throw new Error("log2: non-positive input");
  return Math.log2(f);
}

export function log10(f: number): number {
  assertNum(f, "log10");
  if (f <= 0) throw new Error("log10: non-positive input");
  return Math.log10(f);
}

export function sin(f: number): number {
  assertNum(f, "sin");
  return Math.sin(f);
}

export function cos(f: number): number {
  assertNum(f, "cos");
  return Math.cos(f);
}

export function tan(f: number): number {
  assertNum(f, "tan");
  return Math.tan(f);
}

export function asin(f: number): number {
  assertNum(f, "asin");
  if (f < -1 || f > 1) throw new Error("asin: input out of [-1, 1]");
  return Math.asin(f);
}

export function acos(f: number): number {
  assertNum(f, "acos");
  if (f < -1 || f > 1) throw new Error("acos: input out of [-1, 1]");
  return Math.acos(f);
}

export function atan(f: number): number {
  assertNum(f, "atan");
  return Math.atan(f);
}

export function atan2(y: number, x: number): number {
  assertNum(y, "atan2");
  assertNum(x, "atan2");
  return Math.atan2(y, x);
}

export function gcd(a: number, b: number): number {
  assertInt(a, "gcd");
  assertInt(b, "gcd");
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function lcm(a: number, b: number): number {
  assertInt(a, "lcm");
  assertInt(b, "lcm");
  if (a === 0 || b === 0) return 0;
  return Math.abs(a) / gcd(a, b) * Math.abs(b);
}

export function clamp(n: number, lo: number, hi: number): number {
  assertNum(n, "clamp");
  assertNum(lo, "clamp");
  assertNum(hi, "clamp");
  if (lo > hi) throw new Error("clamp: lo > hi");
  return Math.min(Math.max(n, lo), hi);
}

export function lerp(a: number, b: number, t: number): number {
  assertNum(a, "lerp");
  assertNum(b, "lerp");
  assertNum(t, "lerp");
  return a + (b - a) * t;
}

export function mod(a: number, b: number): number {
  assertInt(a, "mod");
  assertInt(b, "mod");
  if (b === 0) throw new Error("mod: division by zero");
  // Always non-negative (Euclidean modulo).
  return ((a % b) + b) % b;
}

export function factorial(n: number): number {
  assertInt(n, "factorial");
  if (n < 0) throw new Error("factorial: negative input");
  if (n > 170) throw new Error("factorial: input too large for float64");
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function isPrime(n: number): boolean {
  assertInt(n, "isPrime");
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

export function sum(arr: any[]): number {
  if (!Array.isArray(arr)) throw new Error("sum: expected array");
  let s = 0;
  for (const x of arr) {
    assertNum(x, "sum");
    s += x;
  }
  return s;
}

export function mean(arr: any[]): number {
  if (!Array.isArray(arr)) throw new Error("mean: expected array");
  if (arr.length === 0) throw new Error("mean: empty array");
  let s = 0;
  for (const x of arr) {
    assertNum(x, "mean");
    s += x;
  }
  return s / arr.length;
}

// ---------------------------------------------------------------------------
function assertNum(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": expected number, got " + (typeof x));
  }
}
function assertInt(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x) || !Number.isInteger(x)) {
    throw new Error(fn + ": expected integer, got " + String(x));
  }
}

// ---------------------------------------------------------------------------
export const MANIFEST = {
  module: "math",
  fns: [
    { name: "abs", sig: "(n: number) -> number", desc: "Absolute value." },
    { name: "sign", sig: "(n: number) -> int", desc: "Sign: -1, 0, or 1." },
    { name: "min", sig: "(...a: number) -> number", desc: "Smallest of args." },
    { name: "max", sig: "(...a: number) -> number", desc: "Largest of args." },
    { name: "floor", sig: "(f: number) -> int", desc: "Round towards -inf." },
    { name: "ceil", sig: "(f: number) -> int", desc: "Round towards +inf." },
    { name: "round", sig: "(f: number) -> int", desc: "Round to nearest int (half up)." },
    { name: "trunc", sig: "(f: number) -> int", desc: "Truncate fractional part." },
    { name: "sqrt", sig: "(f: number) -> number", desc: "Square root (panics on negative)." },
    { name: "pow", sig: "(base: number, exp: number) -> number", desc: "Exponentiation." },
    { name: "exp", sig: "(f: number) -> number", desc: "e^f." },
    { name: "log", sig: "(f: number) -> number", desc: "Natural log (panics on <=0)." },
    { name: "log2", sig: "(f: number) -> number", desc: "Base-2 log." },
    { name: "log10", sig: "(f: number) -> number", desc: "Base-10 log." },
    { name: "sin", sig: "(f: number) -> number", desc: "Sine (radians)." },
    { name: "cos", sig: "(f: number) -> number", desc: "Cosine (radians)." },
    { name: "tan", sig: "(f: number) -> number", desc: "Tangent (radians)." },
    { name: "asin", sig: "(f: number) -> number", desc: "Arc sine (radians)." },
    { name: "acos", sig: "(f: number) -> number", desc: "Arc cosine (radians)." },
    { name: "atan", sig: "(f: number) -> number", desc: "Arc tangent (radians)." },
    { name: "atan2", sig: "(y: number, x: number) -> number", desc: "Quadrant-aware atan." },
    { name: "PI", sig: "() -> number", desc: "π constant." },
    { name: "E", sig: "() -> number", desc: "Euler's e constant." },
    { name: "gcd", sig: "(a: int, b: int) -> int", desc: "Greatest common divisor." },
    { name: "lcm", sig: "(a: int, b: int) -> int", desc: "Least common multiple." },
    { name: "clamp", sig: "(n: number, lo: number, hi: number) -> number", desc: "Clamp to range." },
    { name: "lerp", sig: "(a: number, b: number, t: number) -> number", desc: "Linear interpolation." },
    { name: "mod", sig: "(a: int, b: int) -> int", desc: "Always-non-negative modulo." },
    { name: "factorial", sig: "(n: int) -> int", desc: "n! (panics for n>170)." },
    { name: "isPrime", sig: "(n: int) -> bool", desc: "Trial-division primality test." },
    { name: "sum", sig: "(arr: number[]) -> number", desc: "Sum of numeric array." },
    { name: "mean", sig: "(arr: number[]) -> number", desc: "Mean of numeric array." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("abs", abs);
  registerBuiltin("sign", sign);
  registerBuiltin("min", min);
  registerBuiltin("max", max);
  registerBuiltin("floor", floor);
  registerBuiltin("ceil", ceil);
  registerBuiltin("round", round);
  registerBuiltin("trunc", trunc);
  registerBuiltin("sqrt", sqrt);
  registerBuiltin("pow", pow);
  registerBuiltin("exp", exp);
  registerBuiltin("log", log);
  registerBuiltin("log2", log2);
  registerBuiltin("log10", log10);
  registerBuiltin("sin", sin);
  registerBuiltin("cos", cos);
  registerBuiltin("tan", tan);
  registerBuiltin("asin", asin);
  registerBuiltin("acos", acos);
  registerBuiltin("atan", atan);
  registerBuiltin("atan2", atan2);
  registerBuiltin("PI", () => PI);
  registerBuiltin("E", () => E);
  registerBuiltin("gcd", gcd);
  registerBuiltin("lcm", lcm);
  registerBuiltin("clamp", clamp);
  registerBuiltin("lerp", lerp);
  registerBuiltin("mod", mod);
  registerBuiltin("factorial", factorial);
  registerBuiltin("isPrime", isPrime);
  registerBuiltin("sum", sum);
  registerBuiltin("mean", mean);
}
