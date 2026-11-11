# aether/stdlib/async

> **Not callable from the v1 sync evaluator.** The functions in this module
> return JavaScript `Promise`s. The Aether tree-walking evaluator in
> `aether/core/eval/eval.ts` is synchronous: every value is a JS value, every
> call returns synchronously, and there is no event loop, no scheduler, and
> no way to suspend a closure mid-execution. A script like
> `let v = await recv(ch);` cannot be executed by the v1 runtime.
>
> You CAN use this module from host TypeScript/JavaScript code that wants
> to demonstrate concurrent patterns next to the playground — for example,
> a "Run async demo" button that calls `runAsync(fn)` from outside the
> evaluator. The functions are real, tested, and behave as documented; they
> are simply not reachable from inside a sync Aether script.

## Why a stub `register` that throws

The registry in `aether/stdlib/index.ts` deliberately does NOT call
`Async.register`. If a user typed `await channel()` inside a sync Aether
script, they would get back a `Promise` object as a regular Aether value,
which would silently flow through the rest of the program as an opaque
blob — a confusing failure. Instead, calling `Async.register` throws
`"async requires the v2 runtime"` so the failure is loud, immediate, and
accompanied by a clear pointer to the v2 limitation. Honest failure beats
silent corruption.

## Concurrency model

Aether's async primitives model a small, opinionated subset of CSP-style
concurrency. There is no preemption — code only yields between awaits — so
two `spawn`ed functions interleave at await points, not at random
boundaries.

### Channels

`channel()` returns an unbounded async channel. Unbounded means `send`
never blocks (it resolves immediately, queuing the value if no receiver is
waiting); `recv` blocks until a value is available or the channel is closed.

```ts
import * as Async from "aether/stdlib/async";

async function producer() {
  const ch = Async.channel();
  for (let i = 0; i < 3; i++) await Async.send(ch, i);
  Async.close(ch);
  return ch;
}

async function consumer(ch: Async.Channel) {
  while (true) {
    try { console.log(await Async.recv(ch)); }
    catch { break; } // closed
  }
}
```

Closing a channel rejects pending recv waiters. Subsequent `recv` calls
reject; subsequent `send` calls also reject.

### select

`select(ops, timeoutMs?)` races a list of `{ ch, op: "send" | "recv",
value? }` operations and resolves with `{ index, value? }` for the first
op that completes. If `timeoutMs` is supplied, `select` resolves with
`{ index: -1 }` if no op completes in time. `select` is the only way to
wait on multiple channels simultaneously without polling.

```ts
const r = await Async.select([
  { ch: ch1, op: "recv" },
  { ch: ch2, op: "recv" },
  { ch: ch3, op: "send", value: 42 },
], 100);
if (r.index === -1) console.log("timeout");
else if (r.index === 0) console.log("got from ch1:", r.value);
```

### timeout

`timeout(ms)` returns a Promise that resolves (with `undefined`) after `ms`
milliseconds. It's most useful inside `select` for the timeout branch, but
also works as a standalone sleep.

### spawn

`spawn(fn)` schedules `fn` on the JS microtask queue and returns a Promise
that resolves with `fn`'s return value (or rejects with `fn`'s error). It
is equivalent to `Promise.resolve().then(fn)`. Because JS is single-
threaded, `spawn` provides concurrency (interleaved execution at await
points), not parallelism — only one `fn` body is running at a time.

### awaitAll / race

`awaitAll(ps)` is `Promise.all` — waits for all to resolve or rejects on
the first rejection. `race(ps)` is `Promise.race` — resolves/rejects with
the first settled Promise. They're included for parity with the rest of
the stdlib API surface, not because they add anything JS doesn't have.

### mapAsync / filterAsync / reduceAsync

These are the async parallels of `map`, `filter`, `reduce` from
`aether/stdlib/collections`. They apply an async fn to each element of an
array, awaiting sequentially. Sequential means O(n) total await time —
they do NOT fire all the async fns concurrently. If you want concurrency,
use `awaitAll(arr.map(fn))` (which fires all immediately and waits for all).

```ts
// Sequential — 100ms total:
const r1 = await Async.mapAsync([1, 2, 3], async x => {
  await Async.timeout(33);
  return x * 2;
});

// Concurrent — 33ms total:
const r2 = await Async.awaitAll([1, 2, 3].map(async x => {
  await Async.timeout(33);
  return x * 2;
}));
```

### defer

`defer(fn)` queues `fn` on the JS microtask queue (`queueMicrotask` if
available, otherwise `Promise.resolve().then(fn)`). It's the closest thing
Aether has to "schedule this for later, but as soon as possible". Useful
for breaking up long synchronous work without setTimeout's clamping.

### retry

`retry(n, fn)` calls `fn` up to `n` times. Returns the first success, or
rethrows the last rejection if all attempts fail. No backoff, no jitter —
just retry. For real retry with exponential backoff, layer this with
`timeout` yourself.

```ts
const result = await Async.retry(3, async () => {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
});
```

### debounce

`debounce(fn, ms)` returns a wrapped version of `fn` that delays
invocation until `ms` milliseconds have elapsed since the last call. If you
call it three times in a row, only the third call fires, after `ms` of
quiet. Useful for search inputs, window resize, etc.

```ts
const onInput = Async.debounce((q: string) => search(q), 200);
input.addEventListener("input", e => onInput(e.target.value));
```

### runAsync

`runAsync(fn)` is the demo entry point — it just `Promise.resolve().then(fn)`.
The playground uses it to drive async demos from the host side; you cannot
call it from inside an Aether script (the v1 evaluator wouldn't know what
to do with the returned Promise).

## Testing the async module

Tests live in `index.test.ts`. They run real Promises and assert on
resolved values and elapsed time. The `select` timeout test, the `defer`
microtask test, and the `debounce` coalescing test all use real wall-clock
timers (15-30ms granularity) — keep that in mind if you run them in a
very slow CI sandbox.

## Why not just use JS's native Promise API?

You can — and arguably should, from host code. The async module exists so
that the playground's autocomplete, docs generator, and (eventually) the
v2 evaluator can treat Aether's async API as a first-class part of the
stdlib, not as a leaky JS interop. When the v2 evaluator lands (with
`await` support), this module's `register` will be un-stubbed and the
same functions will be callable from inside Aether scripts.

## Future: the v2 evaluator

The v2 runtime (planned, not yet built) will add:

- **`async fn` syntax** — `async fn read() -> Result<int, string> { ... }`.
- **`await` expression** — `let v = await recv(ch);` becomes a real
  await, suspending the closure and resuming on the resolved Promise.
- **`spawn` as a green-thread** — a real scheduler that interleaves
  closures at await points.
- **Backwards compatibility** — every function in this module is already
  the right shape; only `register` needs to be un-stubbed.

Until then, treat this module as a typed, tested Promise toolkit that
happens to be bundled with the Aether stdlib for documentation parity.

## Public API summary

| Function | Signature | Resolves with |
|----------|-----------|---------------|
| `channel` | `() -> Channel` | a new channel |
| `send` | `(ch, v) -> Promise<void>` | on delivery |
| `recv` | `(ch) -> Promise<T>` | a value |
| `close` | `(ch) -> void` | (sync, no Promise) |
| `select` | `(ops, ms?) -> Promise<{index, value?}>` | first ready |
| `timeout` | `(ms) -> Promise<void>` | after ms |
| `spawn` | `(fn) -> Promise<T>` | fn's result |
| `awaitAll` | `(ps) -> Promise<T[]>` | all results |
| `race` | `(ps) -> Promise<T>` | first result |
| `mapAsync` | `(arr, fn) -> Promise<U[]>` | mapped array |
| `filterAsync` | `(arr, fn) -> Promise<T[]>` | kept elements |
| `reduceAsync` | `(arr, fn, init) -> Promise<U>` | accumulated |
| `defer` | `(fn) -> void` | (sync, no Promise) |
| `retry` | `(n, fn) -> Promise<T>` | first success |
| `debounce` | `(fn, ms) -> fn` | (sync wrapper) |
| `runAsync` | `(fn) -> Promise<T>` | fn's result |

All async functions return native Promises; the sync helpers (`close`,
`defer`, `debounce`) return their result directly.
