# Concurrency — honest v1, planned v2

> Audience: you want to write concurrent Aether.
> **Short version:** Aether v1 is synchronous. There is no `async`, no `await`, no `spawn`, no `channels`, no scheduler, no event loop, no promises that the evaluator can wait on. The stdlib has an `async` module (in `aether/stdlib/async/index.ts`) — but it is *not callable from a sync Aether script*. It exists for host code that wants to drive async patterns from outside the evaluator, and as a design artifact for the v2 runtime. This tutorial is honest about v1 and sketches the v2 plan.

This tutorial covers: what "synchronous" means in v1 (every call returns before the next starts), what the stdlib `async` module actually contains and why you can't call it, how to write "concurrent-style" patterns in v1 with what you have, and the v2 plan (`async`/`await`, `spawn`, channels, `select`, structured concurrency).

---

## 1. Why v1 is synchronous

Aether v1's runtime is a tree-walking interpreter (`aether/core/eval/eval.ts`). Every evaluation step is a synchronous function call: `evalExpr(node, env)` returns a value, or throws a `PanicSignal` / `ReturnSignal` / `BreakSignal` / `ContinueSignal`. There is no event loop, no scheduler, no continuations, and no way to *suspend* a running closure mid-execution. `run(program, opts)` returns synchronously — either a `RunResult` or a thrown error.

This means: when an Aether program calls a function, that function returns before the next statement runs. There is no `await` because there is nothing to wait for. The whole program runs to completion (or hits the step limit, or panics) before control returns to the host.

This is the right trade-off for v1 because:

1. **Implementation simplicity.** A synchronous tree-walker is ~1000 lines. A scheduler, an event loop, and async-aware continuations would have doubled the runtime.
2. **Browser-runnable.** The playground runs in the browser's main thread (well, actually a worker — see `src/lib/aether-worker.ts` — but conceptually main thread). Async without a scheduler would block the UI.
3. **Deterministic.** A synchronous program is a sequence of steps. The **Steps** tab in the playground shows them. Debugging is straightforward.
4. **Forward-compatible.** v2's async runtime layers on top of the same AST; the synchronous evaluator is kept for REPL/LSP/debug scenarios.

The decision is documented in [ADR-01 tree-walking interpreter for v1](../decisions/adr-01-tree-walking-interpreter-for-v1.md) and the v2 design is in [RFC-001 async await](../rfcs/rfc-001-async-await.md).

---

## 2. The stdlib `async` module — what's in it

The stdlib has an `async` module (`aether/stdlib/async/index.ts`, 264 lines, 16 functions). Its `MANIFEST` lists:

```
channel() -> Channel                       // unbounded async channel
send(ch, v) -> Promise<void>
recv(ch) -> Promise<any>
close(ch) -> void
select(ops, timeout?) -> Promise<SelectResult>
timeout(ms) -> Promise<void>
spawn(fn) -> Promise<T>
awaitAll(ps) -> Promise<T[]>
race(ps) -> Promise<T>
mapAsync(arr, fn) -> Promise<U[]>
filterAsync(arr, fn) -> Promise<T[]>
reduceAsync(arr, fn, init) -> Promise<U>
defer(fn) -> void
retry(n, fn) -> Promise<T>
debounce(fn, ms) -> T
runAsync(fn) -> Promise<T>
```

These are real, working TypeScript functions backed by JS `Promise`s. They implement channels (unbounded queues with promise-based waiters), `select` (race multiple channel ops with optional timeout), `spawn` (schedule on the microtask queue), `awaitAll`/`race` (Promise.all/race wrappers), `mapAsync`/`filterAsync`/`reduceAsync` (sequential async iteration), `defer` (queueMicrotask), `retry` (try N times), `debounce` (wait `ms` since last call), and `runAsync` (the demo entry point).

**Why you can't call them from Aether:** the registry (`aether/stdlib/index.ts`) deliberately does *not* call `Async.register`. The `register` function in `aether/stdlib/async/index.ts` throws on every call:

```ts
export function register(_registerBuiltin: (name: string, fn: any) => void): void {
  throw new Error(
    "aether/stdlib/async: async primitives require the v2 runtime. " +
      "The v1 evaluator is synchronous. Use `import * as Async from 'aether/stdlib/async'` " +
      "from host code if you want to drive Promises directly."
  );
}
```

This is the *honest* choice: a confusing silent failure (returning a `Promise` from a sync call and seeing `[object Promise]` in the output) would be worse than a clear error. The thrown message tells you exactly what's wrong and how to use the module anyway (from host code).

The async functions return `Promise`s; the v1 evaluator has no machinery to `await` them. If you called `await channel()` from inside an Aether script, you'd get a Promise object back — not the channel's value. Worse, you'd "see" a Promise where you expected an int, and the rest of your program would compute on garbage.

### Using async from host code

The async module is callable from TypeScript host code (the playground itself, a Node script, a server). For example, a "Run async demo" button could drive `runAsync` from outside the evaluator:

```ts
// host TypeScript — not Aether
import * as Async from "aether/stdlib/async";

async function demo() {
  const ch = Async.channel<number>();
  Async.send(ch, 1);
  Async.send(ch, 2);
  console.log(await Async.recv(ch));   // 1
  console.log(await Async.recv(ch));   // 2
}
demo();
```

This is what the module is for: *host* code that wants to demo concurrent patterns without waiting for v2. From inside an Aether script, none of these are callable.

---

## 3. Writing "concurrent-style" code in v1

You can't actually do two things at once in v1. But you can write code that *looks* concurrent and prepares for v2.

### Channels — modeled with arrays

A channel is essentially a queue. You can model one with an array and synchronous `send`/`recv`:

```aether
// A "channel" modeled as an array. Synchronous — no waiting.
let chan = [];   // acts as a queue

fn send(ch: [int], v: int) -> () {
  push(ch, v);
}

fn recv(ch: [int]) -> int {
  // In a real channel, this would block until a value is available.
  // Synchronously, we just take the first element if there is one.
  let v = ch[0];
  // remove the first element by copying the tail
  let mut rest = [];
  let mut i = 1;
  while i < len(ch) {
    push(rest, ch[i]);
    i = i + 1;
  }
  // (in real code, we'd mutate ch in place, but that's awkward in v1)
  v
}

send(chan, 1);
send(chan, 2);
send(chan, 3);
print(recv(chan));   // 1
print(recv(chan));   // 2
print(recv(chan));   // 3
```

This is single-threaded — `send` and `recv` happen in source order. There's no waiting; if `recv` is called on an empty channel, you'd panic with an out-of-bounds index. But the *shape* of the code (a queue with send/recv) is what v2 channels will look like.

### Producer/consumer — single-threaded

```aether
// A producer that fills a buffer, then a consumer that drains it.
fn producer(n: int) -> [int] {
  let mut out = [];
  let mut i = 0;
  while i < n {
    push(out, i * i);
    i = i + 1;
  }
  out
}

fn consumer(xs: [int]) -> int {
  let mut sum = 0;
  for x in xs { sum = sum + x; }
  sum
}

let buf = producer(10);
print(consumer(buf));   // 285 — sum of squares 0..9
```

In v2, producer and consumer would run concurrently with a channel between them:

```aether
// v2 sketch — does NOT run in v1

async fn producer(ch: Channel<int>, n: int) {
  for i in 0 .. n { await ch.send(i * i); }
  ch.close();
}

async fn consumer(ch: Channel<int>) -> int {
  let mut sum = 0;
  while let Some(v) = await ch.recv() {
    sum = sum + v;
  }
  sum
}

let ch = channel();
spawn(producer(ch, 10));
let total = await consumer(ch);
print(total);   // 285
```

The v1 version is the same algorithm, sequential. The v2 version is the same algorithm, concurrent. You can write the v1 version now; when v2 lands, you add `async`/`await`/`spawn` and it runs concurrently.

### MapReduce — single-threaded

```aether
let nums = [1, 2, 3, 4, 5];

let squared = map(nums, fn(x: int) -> int { x * x });
let total = reduce(squared, fn(acc: int, x: int) -> int { acc + x }, 0);

print(total);   // 55
```

The `map` and `reduce` are sequential. In v2, you'd use `mapAsync` and `reduceAsync` (which exist in the stdlib already, just not callable from sync Aether) — and they'd still be sequential, because they're implemented as `for` loops. To get parallelism you'd need `spawn` + `awaitAll`:

```aether
// v2 sketch

let nums = [1, 2, 3, 4, 5];
let ps = map(nums, fn(x: int) -> Promise<int> {
  spawn(fn() -> int { x * x })   // each square on its own microtask
});
let squared = await awaitAll(ps);   // wait for all
let total = reduce(squared, fn(acc: int, x: int) -> int { acc + x }, 0);
print(total);   // 55
```

(In practice the microtask queue doesn't give you parallelism — it gives you interleaving. True parallelism in the browser needs Web Workers; in Node, `worker_threads`. The v2 design tracks this in [RFC-001 async await](../rfcs/rfc-001-async-await.md).)

---

## 4. The v2 plan — `async`/`await`, spawn, channels, select

This is **design-only** — none of the syntax below runs in v1. It's the planned v2 surface, sketched in [RFC-001 async await](../rfcs/rfc-001-async-await.md). The sketch draws from Rust's async model, with explicit acknowledgement that the design is influenced by Go's CSP channels and by Swift's structured concurrency.

### `async` and `await`

```aether
// v2 sketch

async fn fetch(url: string) -> result<string, string> {
  // ... imagine an HTTP client ...
  Result::Ok("hello, world")
}

async fn main() -> () {
  let r = fetch("https://example.com");
  let body = await r?;       // await the result, propagate errors
  print(body);
}
```

`async fn` declares an async function — calling it returns a `Future<T>` (or `Promise<T>` — the v2 design tracks both; the stdlib already uses `Promise` because it's the JS-native abstraction). `await` suspends the calling function until the future resolves.

### `spawn` — start a future in the background

```aether
// v2 sketch

async fn main() -> () {
  let task = spawn(fetch("https://example.com"));
  // ... do other work ...
  let body = await task;       // wait for the spawned task
  print(body);
}
```

`spawn(future)` starts the future on the runtime's executor. It returns a `JoinHandle<T>` that you can `await` later.

### Channels — first-class

```aether
// v2 sketch

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

Channels are unbounded by default (the stdlib's `channel()` is unbounded), with a planned bounded variant. `send` and `recv` are async — they suspend the calling task if the channel is full/empty.

### `select` — race multiple operations

```aether
// v2 sketch

async fn main() -> () {
  let ch1 = channel();
  let ch2 = channel();
  spawn(async fn() -> () { await ch1.send(1); });
  spawn(async fn() -> () { await ch2.send(2); });

  match await select([ch1.recv(), ch2.recv()]) {
    SelectResult { index, value } => print(f"got {value} from channel {index}"),
  }
}
```

`select(ops)` returns the first operation that completes. This is Go's `select` (and Rust's `tokio::select!`). The stdlib's `select` already implements the basic version (with a timeout); the v2 surface adds pattern-matching on the result.

### Structured concurrency

```aether
// v2 sketch

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

Structured concurrency (the Swift / Kotlin coroutines model): spawned tasks are scoped, and the scope doesn't exit until all its tasks finish. This prevents "task leaks" where a spawned task outlives the function that started it. The v2 design includes this; it's the part of the design most likely to look different when implemented.

### Async iteration

```aether
// v2 sketch

async fn main() -> () {
  let ch = channel();
  spawn(producer(ch));
  for await v in ch {
    print(v);
  }
}
```

`for await x in async_iterable { ... }` — async iteration over a channel or any `AsyncIterable`. The v2 design tracks this.

---

## 5. Why not just use promises in v1?

You might ask: the JS runtime already has Promises. Why not expose them in v1?

The answer is: the v1 evaluator has no way to *suspend* a closure mid-execution. A Promise's `.then()` callback runs later, on the microtask queue — but the Aether evaluator has no mechanism to "park" a partially-evaluated closure and resume it. Implementing that requires either:

1. **Continuation-passing style** — rewriting the evaluator so every call takes a continuation, and async functions can call the continuation with a Promise that will later call the rest. This is a substantial rewrite.
2. **Generator-based coroutines** — using JS's `function*` and `yield` to implement suspending. This requires the AST to be lowered to JS generators, which is what the v2 bytecode VM does (see [RFC-002 bytecode VM](../rfcs/rfc-002-bytecode-vm.md)).
3. **Direct-to-bytecode compilation** — the bytecode VM has explicit suspend/resume instructions. This is the v2 plan.

Option (1) is too much work for v1. Option (3) is the v2 plan. The stdlib's `async` module is the *design* for v2 — written as TypeScript functions so the API exists and can be tested — and waits for the v2 runtime to expose it to Aether scripts.

---

## 6. A warning about "concurrent-looking" v1 code

Some patterns *look* concurrent but aren't. Be honest about what v1 gives you.

### "Fire and forget" — doesn't fire

```aether
let mut results = [];
for i in 0 .. 10 {
  // This looks like it might start a background task.
  // It doesn't — it just runs the closure immediately.
  let r = (fn(x: int) -> int { x * x })(i);
  push(results, r);
}
print(results);   // [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]
```

In v1, every call is synchronous. The closure runs to completion before the next iteration starts. There is no background execution.

### `defer` — doesn't work

```aether
// `defer` is in the stdlib's async module but not callable from v1 Aether.
// defer(fn() -> int { 42 });   // ERROR — defer is not registered
```

If you try to use `defer` from v1 Aether, the evaluator will report `undefined name 'defer'`. The function exists in the stdlib but is not registered in the v1 evaluator's builtins (because it would need an event loop to schedule on).

### `timeout` — doesn't work

```aether
// timeout(1000);   // ERROR — undefined name 'timeout'
```

Same reason: `timeout` returns a `Promise`. The v1 evaluator can't wait on it.

### The pattern that *does* work — explicit batching

```aether
// Instead of "async fetch these 10 URLs", do "compute these 10 things sequentially".
let urls = ["a", "b", "c", "d", "e"];
let mut results = [];
for u in urls {
  // imagine `fetch(u)` returns a string — in v1 we just compute synchronously
  let body = u + "_body";
  push(results, body);
}
print(results);
```

This is the v1 idiom: do things in sequence, collect results, move on. v2 will give you `await awaitAll(map(urls, async fn(u) { await fetch(u) }))` to do them concurrently.

---

## 7. The playground's `async` view (planned)

The v2 plan includes a playground view that runs async demos by *bypassing the sync evaluator* and calling the stdlib `async` functions from host TypeScript. The sketch (in [RFC-001 async await](../rfcs/rfc-001-async-await.md) § 6) is:

- A new "Async" view in the playground sidebar.
- A textarea where you write "host-style" code that can call `spawn`, `channel`, `send`, `recv`, etc. directly.
- The view runs the code in a JS `async` context (a Web Worker) and displays the resolved values.

This isn't v1 either — it's a planned v2 feature. In v1, the closest you can get is the existing **Benchmarks** view, which runs 6 canned programs and charts elapsed time. Those programs are sync (because everything is sync in v1), but the charting is real and the elapsed-time numbers are accurate.

---

## 8. FAQ

**Q: Can I write `async fn` in v1?**
A: No. The parser accepts `fn` but not `async fn`. You'll see `unexpected token 'async'` (or similar).

**Q: Can I `await` a Promise?**
A: No. The v1 evaluator doesn't know what a Promise is. If a function returns a Promise (e.g., the stdlib `sha512` returns `Promise<string>` — see the [stdlib tour](stdlib-tour.md) § crypto), calling it from v1 Aether returns the Promise object itself, which `print` would render as `[object Promise]` or similar. The stdlib marks these as "host-only" in the manifest.

**Q: Why does the stdlib have an `async` module at all if I can't call it?**
A: Two reasons: (1) host code (the playground itself, server-side scripts, the planned v2 async view) can call it; (2) it's the design artifact for the v2 runtime. The API exists and is tested, even though v1 doesn't expose it to Aether scripts.

**Q: Is Aether "thread-safe"?**
A: v1 has no threads. The playground runs in a single Web Worker. There is no shared state across multiple threads, no mutex, no `Mutex<T>`. v2's structured concurrency model will add the equivalent.

**Q: What about parallelism?**
A: v1 has none. The tree-walker executes one step at a time. Even when v2 adds `async`/`await`, the concurrency is interleaved (cooperative multitasking), not parallel (multiple cores). True parallelism would require Web Workers (browser) or `worker_threads` (Node), which is a v3+ item. See [RFC-001](../rfcs/rfc-001-async-await.md) § 7.

---

## 9. What's next

- [decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md) — why the v1 runtime is sync.
- [rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md) — the v2 async design.
- [rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md) — the v2 runtime that supports suspend/resume.
- [stdlib-tour.md](stdlib-tour.md) — the stdlib modules you *can* call in v1.
- [performance.md](performance.md) — what the synchronous runtime costs.

Aether v1's concurrency story is, in three sentences: v1 is synchronous, the stdlib has an `async` module for host code and as a v2 design artifact, and the v2 plan adds `async`/`await`/`spawn`/channels/`select` on top of a bytecode VM with suspend/resume. v1 code keeps working; v2 opts in.
