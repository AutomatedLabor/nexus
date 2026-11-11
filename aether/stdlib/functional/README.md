# Aether stdlib — `functional`

The `functional` module is a small but principled toolbox of higher-order functions: composition, partial application, memoization, rate-limiting, and classic control-flow combinators (`once`, `after`, `before`, `wrap`, `tap`, `try_`, `when`, `unless`, `condTuples`). Every function is a pure TypeScript implementation that operates on plain JavaScript functions; throwing a plain `Error` from a builtin becomes an Aether panic.

## Why a `functional` module?

Aether has closures and higher-order builtins (map/filter/reduce) but no first-class way to glue functions together — no `compose`, no `partial`, no `memoize`. You can write each of these in three lines when you need it, but the three-line version tends to be subtly wrong: `memoize` without a Map cache, `debounce` that forgets to clear the previous timer, `throttle` that fires the trailing call twice. This module packages the canonical implementations so Aether programs can do `functional.pipe(x, parse, validate, transform, render)` instead of four nested calls.

## Conventions

- **Stateful wrappers return a new function** and never mutate the input. `memoize(f)`, `once(f)`, `debounce(f, ms)`, `throttle(f, ms)`, `after(n, f)`, `before(n, f)`, `wrap(f, wrapper)` each return a fresh closure that holds its own state. You can wrap the same base function multiple times and each wrapper is independent.
- **Argument order matches intent**. `compose(f, g)` reads "do g then f" (math convention, `f ∘ g`). `pipe(x, f, g, h)` reads "do f, then g, then h" (Unix-pipe convention). The two are duals: `pipeFns(f, g, h)(x) === compose(h, compose(g, f))(x)`.
- **All callbacks must be functions** — passing a non-function panics with a clear message (e.g. `tap: expected function`).
- **No currying beyond binary**. `curry` and `uncurry` work on 2-arg functions only. For deeper currying, write it explicitly or use `partial` repeatedly; arbitrary-depth variadic curry is a notorious source of bugs in JS (it's impossible to tell whether `f(a)(b)` should return a value or another function without arity hints).
- **Time-based helpers** (`debounce`, `throttle`) use `setTimeout` and `Date.now()` — they work the same in Node and the browser. The `throttle` implementation uses the "leading + trailing" policy: the first call fires immediately, the last call within the window fires on the trailing edge.

## Identity, constant, composition

`identity(x)` returns `x` — useful as a default `map` function or a no-op transform. `constant(v)` returns a thunk that always returns `v` (Haskell's `const`). `compose(f, g)` is `(x) => f(g(x))` — binary, so for three functions use `compose(h, compose(g, f))` or `pipeFns(f, g, h)` (which reads more naturally left-to-right).

```aether
functional.identity(42)              // 42
const alwaysFive = functional.constant(5)
alwaysFive()                          // 5

const inc = x -> x + 1
const dbl = x -> x * 2
functional.compose(inc, dbl)(3)       // 7  (inc(dbl(3)))
```

## Pipe vs pipeFns

`pipe(x, f, g, h)` is the eager version — it applies `x` immediately and returns the final value. `pipeFns(f, g, h)` is the deferred version — it returns a function you can reuse. The two are complementary: reach for `pipe` when you have the input now, `pipeFns` when you're building a reusable pipeline (e.g. a middleware chain).

```aether
functional.pipe(3, x -> x + 1, x -> x * 2)         // 8
const line = functional.pipeFns(x -> x + 1, x -> x * 2)
line(3)   // 8
line(0)   // 2
```

## Currying and partial application

`curry(f)(a)(b)` is equivalent to `f(a, b)` for binary `f`. `uncurry` is the inverse. `partial(f, a, b)(c)` is `f(a, b, c)` — partial application of leading arguments. `flip(f)(b, a)` is `f(a, b)` — useful for adapting a function whose argument order doesn't match how you want to use it (e.g. flipping `String.prototype.indexOf` to make the haystack the second arg).

```aether
const add = (a, b) -> a + b
const curriedAdd = functional.curry(add)
curriedAdd(2)(3)            // 5
const from5 = functional.partial(add, 5)
from5(3)                    // 8
const subFrom = functional.flip((a, b) -> a - b)
subFrom(2, 10)              // 10 - 2 = 8
```

## Caching and rate-limiting

`memoize(f)` caches results keyed by the single argument. The cache is a `Map` (SameValueZero equality), so it works for `NaN`, `0` vs `-0`, strings, numbers, and object identity. `once(f)` runs `f` at most once; later calls return the first result without re-invoking. This is the canonical pattern for "initialize this resource exactly one time" guards.

`debounce(f, ms)` postpones invocation until `ms` ms of quiet; only the last call within a burst fires (the leading calls are dropped). `throttle(f, ms)` invokes `f` at most once per `ms` window; the very first call fires immediately and the last call within the window fires on the trailing edge. The two are easy to confuse: debounce batches a burst into one trailing call, throttle limits the rate.

```aether
const slow = functional.memoize(x -> expensive(x))
slow(3); slow(3)           // computed once

const init = functional.once(() -> setup())
init(); init()             // setup() runs once

const onResize = functional.debounce(() -> relayout(), 100)
window.on("resize", onResize)   // relayout fires 100ms after the user stops dragging

const onScroll = functional.throttle(() -> update(), 50)
window.on("scroll", onScroll)   // update fires at most 20×/sec
```

## Count-based combinators

`after(n, f)` is "f only fires after the n-th call" — useful for "do this the first time we get past the warmup". `before(n, f)` is the dual: "f only fires for the first n calls" — useful for "log this only the first 3 times it happens".

```aether
const logOnce = functional.after(1, () -> println("stabilized"))
logOnce()  // undefined
logOnce()  // "stabilized"  (the 2nd call)

const earlyBail = functional.before(3, () -> probe())
earlyBail(); earlyBail(); earlyBail(); earlyBail()  // 3 probes, 4th is no-op
```

## Wrapping, tapping, control flow

`wrap(f, wrapper)` produces `(...args) => wrapper(f, ...args)` — the wrapper gets the original function and can decide whether/when/how to call it. This is the foundation for things like logging wrappers, retry wrappers, and tracing wrappers. `tap(x, fn)` calls `fn(x)` for its side effect and returns `x` — indispensable for inserting logging into a pipeline without breaking the chain.

`try_(fn, handler)` is the classic try/catch as a combinator: it returns `fn()` on success or `handler(err)` on throw. `when(cond, fn)` calls `fn` only if `cond` is truthy; `unless(cond, fn)` calls `fn` only if `cond` is falsy. `condTuples(pairs)` is Lisp's `COND`: walk `[pred, fn]` pairs and return the first `fn()` whose `pred()` is truthy.

```aether
const safe = functional.try_(() -> risky(), e -> e.message)

const greet = functional.when(user != null, () -> "hi " + user.name)

const label = functional.condTuples([
  [() -> x < 0,   () -> "negative"],
  [() -> x == 0,  () -> "zero"],
  [() -> x > 0,   () -> "positive"],
])

const logged = functional.tap(42, x -> println("got " + x))   // prints, returns 42
```

## When NOT to reach for `functional`

- If you're writing a one-off pipeline with no reusability, plain nested calls (`render(validate(parse(x)))`) are clearer than `pipe(x, parse, validate, render)` to most readers.
- For async/await flows, prefer the dedicated `async` module — the rate-limiters here are sync and don't propagate promises.
- The `memoize` cache is unbounded. For long-running programs with a wide argument space, you'll want an LRU; for now, wrap externally.

The whole module is 21 functions, ~280 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
