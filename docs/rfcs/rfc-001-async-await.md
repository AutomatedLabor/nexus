# RFC-001 — Async/await for Aether v2

> Status: Draft
> Stage: 0 (Proposal)
> Discussion: open
> Related: [RFC-002 bytecode VM](rfc-002-bytecode-vm.md), [ADR-01 tree-walking interpreter for v1](../decisions/adr-01-tree-walking-interpreter-for-v1.md), [the v1 `async` stdlib](../../aether/stdlib/async/index.ts)

## Summary

Aether v2 adds `async`/`await`, `spawn`, channels, and `select` to the language. Async functions return `Future<T>` (a thin wrapper over the host JS `Promise<T>`); `await` suspends the calling function until the future resolves; `spawn` schedules a future on a runtime executor; channels (`channel`, `send`, `recv`, `close`) are unbounded async queues; `select` races a list of channel ops. The design is influenced by Rust's async/await, Go's CSP channels, and Swift's structured concurrency. v1 stays synchronous; v2 is opt-in per module.

This RFC specifies the surface syntax, the type-system changes, the runtime semantics, the executor design, and the relationship to the v1 stdlib `async` module (which is host-only in v1). The companion [RFC-002 bytecode VM](rfc-002-bytecode-vm.md) specifies the runtime that supports suspend/resume.

## Motivation

Aether v1 is synchronous. The evaluator (`aether/core/eval/eval.ts`) is a tree-walker; every call returns before the next starts; there is no event loop, no scheduler, no continuations. The stdlib has an `async` module (`aether/stdlib/async/index.ts`, 264 lines, 16 functions: `channel`, `send`, `recv`, `close`, `select`, `timeout`, `spawn`, `awaitAll`, `race`, `mapAsync`, `filterAsync`, `reduceAsync`, `defer`, `retry`, `debounce`, `runAsync`) — but it's deliberately not callable from sync Aether scripts. The `register` function throws on every call:

```ts
throw new Error(
  "aether/stdlib/async: async primitives require the v2 runtime. " +
    "The v1 evaluator is synchronous. Use `import * as Async from 'aether/stdlib/async'` " +
    "from host code if you want to drive Promises directly."
);
```

This is honest failure: returning a `Promise` from a sync call would surface `[object Promise]` in the output, which is confusing. The functions are real, tested, and callable from host TypeScript — but v1's runtime can't suspend a closure mid-execution to await one.

The motivation for v2 is twofold:

1. **Real I/O.** A production language needs to do network requests, file I/O, timers — all naturally async. v1's `io` module is browser-limited and Node-only in places; the v2 `http`, `fs`, and `net` modules need async.
2. **Concurrency.** Even without I/O, concurrent patterns (producer/consumer, parallel map, fan-out/fan-in) are common. v1 has to do them sequentially; v2 lets the user express them naturally.

The motivation is *not* parallelism (multi-core). Aether v2 stays single-threaded per evaluator; `spawn` schedules on the microtask queue, not on a new thread. True parallelism needs Web Workers (browser) or `worker_threads` (Node) and is a v3+ item.

## Detailed design

### `async fn` and `await`

```aether
async fn fetch(url: string) -> result<string, string> {
  // imagine an HTTP client
  Result::Ok("hello, world")
}

async fn main() -> () {
  let r = fetch("https://example.com");
  let body = await r?;
  print(body);
}
```

- `async fn name(...) -> T { ... }` declares an async function. Calling it returns a `Future<T>` (not `T`).
- `await expr` evaluates `expr` to a `Future<T>`, suspends the calling async function, and resumes with the `T` when the future resolves. If the calling function isn't async, `await` is a type error.
- `await` is only valid inside `async fn` (and inside `async` blocks, see §3).
- The `?` operator composes: `let body = await fetch(url)?;` awaits, then unwraps `Ok` or propagates `Err`.

The type of `fetch("...")` is `Future<result<string, string>>`. The type of `await fetch("...")` is `result<string, string>`. The type of `await fetch("...")?` is `string` (or propagates the `Err`).

### `async` blocks

```aether
async fn main() -> () {
  let body = await async {
    let r = fetch("https://example.com");
    let body = await r?;
    body
  };
  print(body);
}
```

`async { ... }` is an async block — an anonymous async function with no parameters, evaluated to a `Future<T>` where `T` is the block's type. Useful for "I want to await something here but the enclosing function isn't async".

### `spawn`

```aether
async fn main() -> () {
  let task = spawn(fetch("https://example.com"));
  // ... do other work ...
  let body = await task;
  print(body);
}
```

`spawn(future)` schedules the future on the runtime's executor. It returns a `JoinHandle<T>` that you can `await` later. The future starts running on the microtask queue immediately (in the v2 single-threaded executor).

### Channels

```aether
async fn producer(ch: Channel<int>) -> () {
  for i in 0 .. 10 { await ch.send(i); }
  ch.close();
}

async fn consumer(ch: Channel<int>) -> int {
  let mut sum = 0;
  loop {
    match await ch.recv() {
      Option::Some(v) => sum = sum + v,
      Option::None => break,
    }
  }
  sum
}

async fn main() -> () {
  let ch = channel();
  spawn(producer(ch));
  let total = await consumer(ch);
  print(total);     // 45
}
```

- `channel<T>()` returns an unbounded `Channel<T>`. (Bounded channels via `channel<T>(capacity)` are a planned extension.)
- `ch.send(v)` returns `Future<()>`. It resolves immediately for an unbounded channel with no waiters; it suspends if the channel is bounded and full.
- `ch.recv()` returns `Future<option<T>>`. `Some(v)` for a value; `None` when the channel is closed and empty.
- `ch.close()` closes the channel; future `send` rejects; future `recv` returns `None` once the buffer drains.

Channels are first-class values; they can be passed to functions, stored in structures, sent over other channels. They are the primary communication mechanism between concurrent tasks.

### `select`

```aether
async fn main() -> () {
  let ch1 = channel();
  let ch2 = channel();
  spawn(async fn() { await ch1.send(1); });
  spawn(async fn() { await ch2.send(2); });

  match await select([ch1.recv(), ch2.recv()]) {
    SelectResult { index, value } => print(f"got {value} from channel {index}"),
  }
}
```

`select(ops)` returns a `Future<SelectResult>` that resolves with the first operation that completes. `SelectResult` has `index: int` (which op) and `value: any` (the value, for `recv`). With a timeout:

```aether
match await select([ch.recv()], 1000) {
  SelectResult { index, value } => print(f"got {value}"),
  // index == -1 means timeout
}
```

### Structured concurrency

```aether
async fn main() -> () {
  // All spawned tasks in this scope are awaited at scope exit.
  // If any panic, the scope propagates the panic after all tasks finish.
  scope {
    spawn(task_a());
    spawn(task_b());
    spawn(task_c());
  };   // implicit await + error propagation here
}
```

`scope { ... }` opens a structured-concurrency scope. Any `spawn` inside the scope is awaited when the scope exits. If a task panics, the scope propagates the panic after all sibling tasks finish. This is the Swift/Kotlin model; it prevents "task leaks" where a spawned task outlives the function that started it.

### Type system

- New built-in type: `Future<T>` (analogous to `Promise<T>` in JS, `Future<Output = T>` in Rust).
- New built-in type: `Channel<T>`.
- New built-in type: `JoinHandle<T>`.
- New built-in type: `SelectResult`.
- `async fn name(...) -> T` has type `fn(...) -> Future<T>`. (Calling an `async fn` returns a `Future<T>`; the function value itself is `fn(...) -> Future<T>`.)
- `await expr` requires `expr: Future<T>` and yields `T`.
- `spawn expr` requires `expr: Future<T>` and yields `JoinHandle<T>`.
- `await join_handle` requires `JoinHandle<T>` and yields `T`.
- The `?` operator works on `Future<result<T, E>>`: it awaits, then propagates the `Err`.

### Runtime: executor and suspend/resume

The v2 runtime uses the bytecode VM ([RFC-002](rfc-002-bytecode-vm.md)) with explicit suspend/resume instructions. When an async function awaits a future:

1. The frame is captured (registers, operand stack, instruction pointer).
2. A continuation is registered with the awaited future, to be called when it resolves.
3. The frame is suspended — control returns to the executor.
4. When the future resolves, the continuation is called with the resolved value, the frame is restored, and execution resumes from after the `await`.

This is the standard CPS-style or generator-style coroutine implementation. The v1 tree-walker doesn't have it because it would require either rewriting every evaluator function to take a continuation (CPS) or rewriting every evaluator function as a JS generator (which has its own quirks). The bytecode VM has neither problem because the IP and operand stack are explicit data, not JS call stack.

The executor is a single-threaded work queue. It runs ready tasks in FIFO order, suspending each as it awaits. There's no preemption — a task runs until it awaits or finishes. This is cooperative multitasking, like Python's `asyncio` or Rust's `tokio` (current-thread runtime).

### Backward compatibility

v1 code stays working. A v1 program (no `async`, no `await`, no `spawn`) runs identically under the v2 tree-walker, which is kept for REPL/LSP/debug (see [ADR-01](../decisions/adr-01-tree-walking-interpreter-for-v1.md)). A v2 module that uses async runs under the bytecode VM. Mixed modules (some functions async, some sync) work — sync functions can call other sync functions; async functions can call sync functions (the sync call just completes synchronously); async functions can call async functions via `await`.

A v1 program that uses the stdlib's `async` module's `register` (which throws in v1) will, in v2, see `register` succeed — the async functions become callable from Aether. The `register` function is no longer a "throws" stub; it actually registers.

### Module opt-in

A module declares `edition = "v2"` in its `aether.toml` (see [RFC-003](rfc-003-modules-and-packages.md)) to enable the async runtime. v1-edition modules stay sync. Mixing editions within a single module is an error.

## Alternatives considered

### Promises-only (no syntax)

Aether v1 could expose the JS `Promise` type directly: `Promise<T>`, `.then(closure)`, `await` desugars to `.then`. This is the JS approach.

Downsides:

- Promises compose poorly. `Promise.all` / `Promise.race` are external; the language doesn't help.
- Stack traces are bad — a `.then` chain shows the closures, not the original calls.
- No structured concurrency — Promises can outlive their creators (a "Promise leak" is easy).
- The Aether user has to think in two paradigms (sync code, Promise-based async code) instead of one.

Aether v2 chooses the Rust/Python model: async is a first-class language feature, the syntax (`async fn`, `await`) is part of the language, the runtime knows about suspending and resuming.

### Green threads (Goroutine-style)

Go's goroutines are implicitly async — any function can be `go func()`'d, the runtime handles the stack. This is more ergonomic (no `async` keyword to think about) but has costs:

- Every function call has to be "stackless" — the runtime can't assume a call returns synchronously.
- The runtime has to allocate stacks dynamically (goroutine stacks start small and grow).
- Stack captures are expensive — every call site is a potential suspension point.

For Aether v2, the explicit-async model (you write `async fn` to opt in) is the right balance. The v1 sync functions stay sync; only `async fn` functions pay the suspend/resume cost.

### Callbacks

JS-style callbacks (`fetch(url, fn(body) { ... })`) are the lowest-common-denominator approach. They work in any language, with no runtime support. But they're verbose, they don't compose (you end up rewriting `await` by hand with promises or continuations), and they're error-prone (error handling requires a separate error callback or a `Result` argument). Aether v1 already has `Result<T, E>` for error handling; v2 layers async on top with `Future<T>`.

## Drawbacks

- **Implementation cost.** The bytecode VM (RFC-002) is a multi-month project; the async runtime on top is another month. The total v2 effort is substantially larger than v1.
- **Two execution models.** Aether v2 has both sync (tree-walker) and async (bytecode VM) runtimes. The user has to know which one a given function uses. The opt-in per module mitigates this but doesn't eliminate it.
- **Async coloring.** Async functions can only be called from async functions (the `await` keyword). Sync functions can't `await`. This is the "function color" problem (https://journal.stuffwithstuff.com/2015/02/01/what-color-is-your-function/). The mitigation is `spawn` (a sync function can `spawn` an async future and block on its result, but that defeats the purpose) — in practice, async code stays async, sync code stays sync.
- **Debugging is harder.** A suspended async function has no JS stack frame to inspect. The v2 LSP / debugger will need a "logical stack" view that reconstructs the async call chain. This is additional work.
- **Performance overhead.** Each `await` captures and restores a frame; this has overhead vs. a direct call. For high-throughput code, you'd write sync functions; for I/O-bound code, the overhead is dwarfed by the I/O wait.
- **Channel semantics.** Choosing unbounded as the default vs. bounded (Rust's `tokio::sync::mpsc::channel` defaults to bounded; Go's channels default to unbounded). The v1 stdlib's `channel()` is unbounded; we keep that as the v2 default. A bounded variant (`channel<T>(capacity)`) is planned.

## Open questions

1. **Cancellation.** Should `JoinHandle` support cancellation? `tokio::select!` cancels the losing branches; Go's `context` provides cancellation. The v2 design tracks this; the planned API is `handle.cancel()` plus a `CancellationToken` passed to the spawned future.
2. **Async drop.** Should `Drop` be async? Rust doesn't allow `async fn drop`; the v2 design will probably follow Rust here.
3. **Async iteration.** `for await x in async_iter { ... }` — the design is sketched but the API surface for `AsyncIterable` is open.
4. **Executor backpressure.** When the executor has too many ready tasks, what happens? The v1 stdlib doesn't have this problem (it's all driven from host code); v2 needs a policy.

## Cross-references

- [RFC-002 bytecode VM](rfc-002-bytecode-vm.md) — the runtime that supports suspend/resume.
- [RFC-003 modules and packages](rfc-003-modules-and-packages.md) — the `edition` field in `aether.toml`.
- [RFC-005 LSP](rfc-005-lsp.md) — the LSP's handling of async stack traces.
- [../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md) — the v1 decision (sync runtime).
- [../tutorials/concurrency.md](../tutorials/concurrency.md) — the v1 vs v2 concurrency tutorial.
- `aether/stdlib/async/index.ts` — the v1 stdlib `async` module (host-only in v1, design artifact for v2).

## Prior art

- **Rust** async/await + `tokio` — the closest model. `async fn`, `await`, `tokio::spawn`, `tokio::sync::mpsc`, `tokio::select!`. Aether's design is heavily influenced by Rust.
- **Swift** structured concurrency — `async/await`, `Task`, `async let`, `withTaskGroup`. The structured-concurrency `scope { ... }` is from Swift's `withTaskGroup`.
- **Kotlin** coroutines — `suspend fun`, `launch`, `async`, `Channel`, `select`. The `Channel<T>` API is from Kotlin.
- **Go** goroutines + channels — the CSP model. `go func()`, `chan T`, `select { case ... }`. Aether's channels are inspired by Go's.
- **Python** asyncio — `async def`, `await`, `asyncio.create_task`, `asyncio.Queue`, `asyncio.wait`. The single-threaded executor is like `asyncio`'s default loop.
- **JavaScript** Promises + `async`/`await` — the host runtime that the v1 stdlib uses. v2 layers Aether's syntax on top.
- **OCaml** Lwt / Async — monadic concurrency. Aether doesn't go the monad route; explicit `await` is simpler.

## Status

This RFC is at stage 0 (Proposal). The next step is to prototype the executor in TypeScript (without the bytecode VM, using JS generators for suspend/resume) to validate the API surface. If the prototype works, the RFC moves to stage 1 (Implementation sketch) and the bytecode VM team (RFC-002) takes over.
