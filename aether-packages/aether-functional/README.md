# aether-functional

> Functional combinators for the Aether language — 18 pub functions covering the lodash/underscore-style higher-order API, written in Aether itself.

`aether-functional` is a small but complete higher-order library: compose, pipe, curry, partial, flip, memoize, once, debounce, throttle, after, before, wrap, tap, identity, constant, try_, when, unless, cond. Every function is a few lines of Aether built on `while`, `push`, `map`, `filter`, `reduce`, and recursion. No `for in` loops — defensive against the v1 evaluator's for-loop-scope quirk.

## Why a functional package?

Aether ships a small core of built-in functions. It deliberately does *not* ship `compose`, `curry`, `memoize`, or any of the other "every functional program eventually needs these" combinators. The language design principle is: the standard library should be the smallest set of operations that compose into everything else, and the rest should live in user-installable packages.

`aether-functional` is the canonical user-installable package for higher-order combinators. It is the reference target for the package registry protocol (RFC-005, draft): every other functional-flavored package in the registry (`aether-functional-extra`, `aether-lenses`, `aether-monads`) is expected to either re-export `aether-functional` or extend it.

## API

All 18 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they return new closures and never mutate their inputs (with the documented exception of `memoize`/`once`/`debounce`/`throttle`/`after`/`before`, which hold internal mutable state for caching/gating).

### identity / constant

| Function | Signature | Description |
| --- | --- | --- |
| `identity(x)` | `(int) -> int` | Returns `x`. Useful as a default. |
| `constant(x)` | `(int) -> fn() -> int` | Returns a closure that always returns `x`. |

### compose / pipe

| Function | Signature | Description |
| --- | --- | --- |
| `compose(f, g)` | `(fn(int)->int, fn(int)->int) -> fn(int)->int` | `h(x) = f(g(x))` (right-to-left). |
| `pipe(f, g)` | `(fn(int)->int, fn(int)->int) -> fn(int)->int` | `h(x) = g(f(x))` (left-to-right). |

### curry / partial / flip

| Function | Signature | Description |
| --- | --- | --- |
| `curry(f)` | `(fn(int,int)->int) -> fn(int) -> fn(int)->int` | Curried form: call with one arg, get a closure expecting the other. |
| `partial(f, a)` | `(fn(int,int)->int, int) -> fn(int)->int` | Fix the first arg of `f`. |
| `flip(f)` | `(fn(int,int)->int) -> fn(int,int)->int` | Swap the two args. |

### memoize / once — caching

| Function | Signature | Description |
| --- | --- | --- |
| `memoize(f)` | `(fn(int)->int) -> fn(int)->int` | Cache `f`'s results by arg. |
| `once(f)` | `(fn()->int) -> fn()->int` | Run `f` the first time, return the cached result thereafter. |

### debounce / throttle — rate limiting

| Function | Signature | Description |
| --- | --- | --- |
| `debounce(f, n)` | `(fn(int)->int, int) -> fn(int)->int` | Fire `f` only after `n` consecutive calls. The state is `[count_since_last_fire, last_result]`. |
| `throttle(f, n)` | `(fn(int)->int, int) -> fn(int)->int` | Fire `f` at most once every `n` calls. |

Note: v3.0 debounce/throttle are call-count-based (not wall-clock-based). The v3.1 plan is to integrate with the coroutine scheduler's `timeout(ms)` for real time-based rate limiting.

### after / before — gating

| Function | Signature | Description |
| --- | --- |--- |
| `after(n, f)` | `(int, fn(int)->int) -> fn(int)->int` | No-op for the first `n-1` calls; from call `n` onward, runs `f`. |
| `before(n, f)` | `(int, fn(int)->int) -> fn(int)->int` | Runs `f` for the first `n` calls, then no-ops. |

### wrap / tap — side-effect injection

| Function | Signature | Description |
| --- | --- | --- |
| `wrap(f, wrapper)` | `(fn(int)->int, fn(fn(int)->int, int)->int) -> fn(int)->int` | Calls `wrapper(f, x)`. The wrapper decides when to call `f`. |
| `tap(f)` | `(fn(int)->()) -> fn(int)->int` | Calls `f(x)` for side effects, returns `x` unchanged. |

### try_ / when / unless / cond — control-flow combinators

| Function | Signature | Description |
| --- | --- | --- |
| `try_(f, fallback)` | `(fn(int)->int, fn(int)->int) -> fn(int)->int` | Calls `f`; if it errors, calls `fallback`. v3.0 is a no-op wrapper (Aether's tree-walker doesn't catch panics in closures without a JS-level try/catch). |
| `when(pred, f)` | `(fn(int)->bool, fn(int)->int) -> fn(int)->int` | Calls `f(x)` iff `pred(x)`; else returns `x` unchanged. |
| `unless(pred, f)` | `(fn(int)->bool, fn(int)->int) -> fn(int)->int` | Calls `f(x)` iff `!pred(x)`; else returns `x` unchanged. |
| `cond(cases, default)` | `([fn(int)->bool], int) -> fn(int)->int` | Chain of `(pred, fn)` pairs (flattened). Returns the first matching `fn(x)`, or `default` if no pred matches. |

## How to use

### As a dependency

Add `aether-functional` to your project's `aether.toml`:

```toml
[dependencies]
aether-functional = "0.1.0"
```

Then in your Aether source:

```aether
import { compose, pipe, curry, memoize } from "aether-functional";

fn inc(x: int) -> int { x + 1 }
fn dbl(x: int) -> int { x * 2 }

let f = compose(dbl, inc);
print(f(5));  // 12

let add = fn(a: int, b: int) -> int { a + b };
let add5 = curry(add)(5);
print(add5(3));  // 8

let slow_sq = fn(n: int) -> int { n * n };
let memoized_sq = memoize(slow_sq);
print(memoized_sq(5));  // 25 (computed)
print(memoized_sq(5));  // 25 (cached)
```

### Running the test suite

```sh
aether test aether-packages/aether-functional/tests
# PASS aether-packages/aether-functional/tests/tests.ae
# 1 passed, 0 failed
```

The test file contains 30+ `assert_eq` cases covering every `pub fn`.

## Design notes

### Why `Map`-free memoize?

Aether's `Map` is the JS `Map`, but the language doesn't expose a way to construct an empty Map from a literal. The simplest portable approach is to use an array-of-pairs (`[[k, v], ...]`) as the cache. Linear scans are O(n), but the memoize use case is for small argument domains — the trade-off is clarity for performance. The v3.1 plan is a `Map` builtin that exposes the JS Map constructor directly.

### State via captured arrays

Several functions (`memoize`, `once`, `debounce`, `throttle`, `after`, `before`) hold internal mutable state. Aether closures capture variables by reference, so a closure created with `let state = [0]; fn() -> int { state[0] = state[0] + 1; state[0] }` will increment the same `state` on every call. This is the standard "closure as object" pattern; the package uses it consistently.

### Why call-count-based debounce/throttle?

Real debounce/throttle are wall-clock-based. v3.0 doesn't have access to wall-clock timers from inside an Aether closure (the `timeout(ms)` builtin lives in the coroutine scheduler, not the synchronous evaluator). The package approximates with call counts: `debounce(f, n)` fires after `n` consecutive calls; `throttle(f, n)` fires at most once every `n` calls. The semantics are slightly different but the use cases (rate-limiting, batching) are the same. The v3.1 plan is to lift this restriction via the coroutine scheduler.

### `try_` is a no-op in v3.0

Aether's evaluator doesn't catch panics thrown by closures without a JS-level try/catch. The `try_` combinator is a placeholder that just calls `f` directly — if `f` panics, the panic propagates. For real error handling, use the `aether-result` package (which models errors as values, not exceptions). The v3.1 plan is a `try`/`catch` expression at the language level; once that lands, `try_` can implement real fallback behavior.

## Future work

- **Real `Map`-based memoize.** When Aether exposes the JS Map constructor, switch the cache to a real Map for O(1) lookups.
- **Timer-based debounce/throttle.** Integrate with the coroutine scheduler's `timeout(ms)` for real wall-clock rate limiting.
- **Real `try_`.** A language-level try/catch expression would let `try_` actually catch panics.
- **Variadic compose/pipe.** Currently `compose`/`pipe` are binary (two functions). A variadic version that composes N functions is a natural extension.

## License

MIT — same as the Aether language.
