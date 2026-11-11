/**
 * Aether stdlib — `functional` module.
 *
 * Higher-order helpers: composition, partial application, memoization,
 * rate-limiting, and a few classic combinators (`once`, `after`, `before`,
 * `wrap`, `tap`, `try_`, `when`, `unless`, `condTuples`).  All functions are
 * pure TypeScript and operate on plain JavaScript functions.
 *
 * Functions that mutate the wrapped function's state (memoize, once,
 * debounce, throttle, after, before) return a NEW function — they never
 * touch the input.  Throwing a plain `Error` becomes an Aether panic.
 */

// ---------------------------------------------------------------------------
// Identity & constant
// ---------------------------------------------------------------------------

/** Identity combinator: returns its argument unchanged. */
export function identity<T>(x: T): T {
  return x;
}

/** Returns a function that always returns `v`.  Haskell's `const`. */
export function constant<T>(v: T): () => T {
  return function () { return v; };
}

// ---------------------------------------------------------------------------
// Composition & piping
// ---------------------------------------------------------------------------

/** Compose: `compose(f, g)(x) = f(g(x))`.  Binary; use pipeFns for n-ary. */
export function compose<A, B, C>(f: (b: B) => C, g: (a: A) => B): (a: A) => C {
  if (typeof f !== "function") throw new Error("compose: expected function");
  if (typeof g !== "function") throw new Error("compose: expected function");
  return (x: A) => f(g(x));
}

/** Apply `x` left-to-right through `fns`: `pipe(x, f, g, h) = h(g(f(x)))`. */
export function pipe<T>(x: T, ...fns: Array<(x: any) => any>): any {
  let v: any = x;
  for (const f of fns) {
    if (typeof f !== "function") throw new Error("pipe: expected function");
    v = f(v);
  }
  return v;
}

/** Build a piped function: `pipeFns(f, g, h)(x) = h(g(f(x)))`.  Left-to-right compose. */
export function pipeFns(...fns: Array<(x: any) => any>): (x: any) => any {
  for (const f of fns) {
    if (typeof f !== "function") throw new Error("pipeFns: expected function");
  }
  return (x: any) => {
    let v = x;
    for (const f of fns) v = f(v);
    return v;
  };
}

// ---------------------------------------------------------------------------
// Currying & partial application
// ---------------------------------------------------------------------------

/** Curry a binary function: `curry(f)(a)(b) == f(a, b)`. */
export function curry<A, B, C>(fn: (a: A, b: B) => C): (a: A) => (b: B) => C {
  if (typeof fn !== "function") throw new Error("curry: expected function");
  return (a: A) => (b: B) => fn(a, b);
}

/** Uncurry a curried binary function: `uncurry(g)(a, b) == g(a)(b)`. */
export function uncurry<A, B, C>(fn: (a: A) => (b: B) => C): (a: A, b: B) => C {
  if (typeof fn !== "function") throw new Error("uncurry: expected function");
  return (a: A, b: B) => fn(a)(b);
}

/** Partial application: `partial(f, a, b)(c) == f(a, b, c)`. */
export function partial(fn: (...args: any[]) => any, ...args: any[]): (...rest: any[]) => any {
  if (typeof fn !== "function") throw new Error("partial: expected function");
  return function (...rest: any[]) { return fn(...args, ...rest); };
}

/** Flip a binary function's argument order: `flip(f)(a, b) == f(b, a)`. */
export function flip<A, B, C>(fn: (a: A, b: B) => C): (b: B, a: A) => C {
  if (typeof fn !== "function") throw new Error("flip: expected function");
  return (b: B, a: A) => fn(a, b);
}

// ---------------------------------------------------------------------------
// Caching & rate-limiting
// ---------------------------------------------------------------------------

/** Memoize a single-arg function.  Keys compared by SameValueZero. */
export function memoize<T, U>(fn: (x: T) => U): (x: T) => U {
  if (typeof fn !== "function") throw new Error("memoize: expected function");
  const cache = new Map<T, U>();
  return (x: T) => {
    if (cache.has(x)) return cache.get(x) as U;
    const r = fn(x);
    cache.set(x, r);
    return r;
  };
}

/** Run `fn` at most once; subsequent calls return the first result. */
export function once<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => ReturnType<T> {
  if (typeof fn !== "function") throw new Error("once: expected function");
  let done = false;
  let result: any;
  return function (...args: any[]) {
    if (done) return result;
    result = fn(...args);
    done = true;
    return result;
  };
}

/** Debounce: postpone calls until `ms` ms of quiet; only the last call fires. */
export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): (...args: Parameters<T>) => void {
  if (typeof fn !== "function") throw new Error("debounce: expected function");
  assertInt(ms, "debounce");
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (...args: any[]) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
}

/** Throttle: invoke `fn` at most once per `ms` window; first call fires immediately. */
export function throttle<T extends (...args: any[]) => any>(fn: T, ms: number): (...args: Parameters<T>) => void {
  if (typeof fn !== "function") throw new Error("throttle: expected function");
  assertInt(ms, "throttle");
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (...args: any[]) {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      last = now;
      fn(...args);
    } else if (timer === null) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
}

// ---------------------------------------------------------------------------
// Count-based combinators
// ---------------------------------------------------------------------------

/** Run `fn` only after the `n`th call; earlier calls are no-ops. */
export function after<T extends (...args: any[]) => any>(n: number, fn: T): (...args: Parameters<T>) => ReturnType<T> | undefined {
  assertInt(n, "after");
  if (typeof fn !== "function") throw new Error("after: expected function");
  if (n < 0) throw new Error("after: n must be non-negative");
  let count = 0;
  return function (...args: any[]) {
    count++;
    if (count < n) return undefined;
    return fn(...args);
  };
}

/** Run `fn` for the first `n` calls only; later calls are no-ops. */
export function before<T extends (...args: any[]) => any>(n: number, fn: T): (...args: Parameters<T>) => ReturnType<T> | undefined {
  assertInt(n, "before");
  if (typeof fn !== "function") throw new Error("before: expected function");
  if (n < 0) throw new Error("before: n must be non-negative");
  let count = 0;
  return function (...args: any[]) {
    if (count >= n) return undefined;
    count++;
    return fn(...args);
  };
}

// ---------------------------------------------------------------------------
// Wrapping & taps
// ---------------------------------------------------------------------------

/** Wrap `fn` so `wrapper` controls when/how it runs.  `wrapper(fn, ...args)`. */
export function wrap<T extends (...args: any[]) => any>(fn: T, wrapper: (fn: T, ...args: any[]) => any): (...args: any[]) => any {
  if (typeof fn !== "function") throw new Error("wrap: expected function");
  if (typeof wrapper !== "function") throw new Error("wrap: expected function");
  return function (...args: any[]) { return wrapper(fn, ...args); };
}

/** Tap: pass `x` to `fn` for its side effect, then return `x` unchanged. */
export function tap<T>(x: T, fn: (x: T) => void): T {
  if (typeof fn !== "function") throw new Error("tap: expected function");
  fn(x);
  return x;
}

// ---------------------------------------------------------------------------
// Control-flow combinators
// ---------------------------------------------------------------------------

/** `try_(fn, handler)`: run `fn()`; if it throws, return `handler(err)`. */
export function try_<T>(fn: () => T, handler: (err: Error) => T): T {
  if (typeof fn !== "function") throw new Error("try_: expected function");
  if (typeof handler !== "function") throw new Error("try_: expected function");
  try {
    return fn();
  } catch (e) {
    return handler(e instanceof Error ? e : new Error(String(e)));
  }
}

/** When `cond` is truthy, return `fn()`; otherwise undefined. */
export function when<T>(cond: any, fn: () => T): T | undefined {
  if (typeof fn !== "function") throw new Error("when: expected function");
  return cond ? fn() : undefined;
}

/** When `cond` is falsy, return `fn()`; otherwise undefined. */
export function unless<T>(cond: any, fn: () => T): T | undefined {
  if (typeof fn !== "function") throw new Error("unless: expected function");
  return cond ? undefined : fn();
}

/** Lisp-style COND: walk [pred, fn] pairs; return fn() of the first truthy pred. */
export function condTuples(pairs: Array<[() => any, () => any]>): any {
  if (!Array.isArray(pairs)) throw new Error("condTuples: expected array of pairs");
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error("condTuples: expected [predicate, fn] pairs");
    }
    const [pred, fn] = pair;
    if (typeof pred !== "function" || typeof fn !== "function") {
      throw new Error("condTuples: pair members must be functions");
    }
    if (pred()) return fn();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "functional",
  fns: [
    { name: "identity", sig: "(x: any) -> any", desc: "Identity combinator: returns x unchanged." },
    { name: "constant", sig: "(v: any) -> () -> any", desc: "Returns a function that always returns v." },
    { name: "compose", sig: "(f, g) -> (x) -> any", desc: "Compose: compose(f, g)(x) = f(g(x))." },
    { name: "pipe", sig: "(x, ...fns) -> any", desc: "Apply x left-to-right through fns." },
    { name: "pipeFns", sig: "(...fns) -> (x) -> any", desc: "Build a piped function (left-to-right compose)." },
    { name: "curry", sig: "(fn) -> (a) -> (b) -> any", desc: "Curry a binary function." },
    { name: "uncurry", sig: "(fn) -> (a, b) -> any", desc: "Uncurry a curried binary function." },
    { name: "partial", sig: "(fn, ...args) -> (...rest) -> any", desc: "Partial application of leading args." },
    { name: "flip", sig: "(fn) -> (b, a) -> any", desc: "Flip a binary function's argument order." },
    { name: "memoize", sig: "(fn) -> fn", desc: "Memoize a single-arg function." },
    { name: "once", sig: "(fn) -> fn", desc: "Run fn at most once; later calls return the first result." },
    { name: "debounce", sig: "(fn, ms: int) -> fn", desc: "Debounce: only the last call within ms fires." },
    { name: "throttle", sig: "(fn, ms: int) -> fn", desc: "Throttle: invoke fn at most once per ms window." },
    { name: "after", sig: "(n: int, fn) -> fn", desc: "Run fn only after the nth call." },
    { name: "before", sig: "(n: int, fn) -> fn", desc: "Run fn for the first n calls only." },
    { name: "wrap", sig: "(fn, wrapper) -> fn", desc: "Wrap fn so wrapper controls when/how it runs." },
    { name: "tap", sig: "(x, fn) -> x", desc: "Pass x to fn for its side effect, return x unchanged." },
    { name: "try_", sig: "(fn, handler) -> any", desc: "Run fn; if it throws, return handler(err)." },
    { name: "when", sig: "(cond, fn) -> any", desc: "If cond is truthy, return fn(); else undefined." },
    { name: "unless", sig: "(cond, fn) -> any", desc: "If cond is falsy, return fn(); else undefined." },
    { name: "condTuples", sig: "(pairs: [[pred, fn]]) -> any", desc: "Lisp COND: return fn() of the first truthy pred." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("identity", identity);
  registerBuiltin("constant", constant);
  registerBuiltin("compose", compose);
  registerBuiltin("pipe", pipe);
  registerBuiltin("pipeFns", pipeFns);
  registerBuiltin("curry", curry);
  registerBuiltin("uncurry", uncurry);
  registerBuiltin("partial", partial);
  registerBuiltin("flip", flip);
  registerBuiltin("memoize", memoize);
  registerBuiltin("once", once);
  registerBuiltin("debounce", debounce);
  registerBuiltin("throttle", throttle);
  registerBuiltin("after", after);
  registerBuiltin("before", before);
  registerBuiltin("wrap", wrap);
  registerBuiltin("tap", tap);
  registerBuiltin("try_", try_);
  registerBuiltin("when", when);
  registerBuiltin("unless", unless);
  registerBuiltin("condTuples", condTuples);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertInt(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": expected number, got " + (x === null ? "null" : x === undefined ? "undefined" : typeof x));
  }
}
