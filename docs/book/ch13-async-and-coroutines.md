# Chapter 13 — Async and coroutines

> Aether v3 introduces an async runtime built on *coroutine frames*: each async function is compiled to a state machine whose frame (locals, instruction pointer, captures) is heap-allocated and explicitly suspended/resumed. This is the substrate for `spawn`/`await`/`yield`, channels, `select`, `join`, `race`, `timeout`, and structured concurrency. This chapter covers the model, the API, and how the borrow checker makes coroutines safe. Ten runnable examples show every primitive.

Aether v2's async was built on JS Promises (ADR-13). It worked — you could `spawn`, `await`, `select` — but it was limited to a JS host. The v2.5 RFC asked: can we have async that works on the WASM backend (Chapter 14) and the x86 backend (Chapter 15), where there's no JS Promise? The v3 answer: yes, but only if we lower async to coroutine frames that the runtime can suspend and resume explicitly. The v3 async runtime is the result.

The coroutine model is the Go/MLton/OCaml multicore model, not the JS/Python `async`/`await` model. The unit of suspension is the *frame* (a closure-capturing record), not the JS microtask. This is what makes async work on every backend — tree-walker, VM, WASM, x86 — without a JS engine.

---

## 13.1 The model

A coroutine is a function that can suspend itself and be resumed later. The compiler transforms an `async fn` into a state machine:

```aether
async fn fetch(url: string) -> string {
  let body = await(http_get(url));    // suspend point 1
  let parsed = await(parse(body));    // suspend point 2
  parsed
}
```

is lowered to:

```aether
enum FetchState {
  Start,
  AwaitingBody(Future<string>),
  AwaitingParsed(Future<string>),
  Done,
  Error(string),
}

struct FetchFrame {
  url: string,
  state: FetchState,
  body: string,    // local, populated after suspend 1
  parsed: string,  // local, populated after suspend 2
}

impl FetchFrame {
  fn poll(self) -> Poll<string> {
    // Dispatch on self.state, run until the next suspend point,
    // update state, return.
  }
}
```

The `spawn` runtime calls `poll` repeatedly until it returns `Done`. Each `await` is a suspend point — the function returns `Pending` and is re-polled later when the awaited future completes.

This is the same lowering as Rust's `async fn` → `impl Future`, with one difference: Aether's coroutine frames are *heap-allocated* (not stack-allocated), so they can outlive the function that spawned them. This is necessary for `select`, `race`, and `timeout` — operations that hold multiple futures at once.

---

## 13.2 `spawn` and `await`

`spawn(f)` creates a new coroutine from the closure `f` and returns a `Future<T>` (where `T` is the closure's return type). `await(fut)` suspends the current coroutine until `fut` is ready, then yields its value.

### Example 1: spawn and await

```aether
async fn square(n: int) -> int {
  n * n
}

let f = spawn(fn() -> int { square(7) });
let r = await(f);
print(r);   // 49
```

`spawn` takes a closure; the closure's return type is the future's `T`. `await` blocks until the future is ready. In the tree-walker runtime, the await is implemented as a busy-poll on the runtime's ready queue; in the WASM/x86 runtime, it's a bytecode-level `Op.Suspend`/`Op.Resume` pair.

### Example 2: concurrent spawns

```aether
async fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

let a = spawn(fn() -> int { fib(15) });
let b = spawn(fn() -> int { fib(20) });
let c = spawn(fn() -> int { fib(10) });

let ra = await(a);
let rb = await(b);
let rc = await(c);
print(ra + rb + rc);   // 610 + 6765 + 55 = 7430
```

The three spawns start their coroutines concurrently. The awaits block until each completes. The runtime decides the scheduling — typically round-robin on a single worker (the v3 default), but a future multi-worker runtime is on the roadmap.

---

## 13.3 `yield`

`yield()` suspends the current coroutine without a value, returning control to the runtime. This is the basis for cooperative multitasking — long-running coroutines can yield periodically to let other coroutines run.

### Example 3: cooperative yielding

```aether
async fn ticker(id: int) -> int {
  let mut count = 0;
  while count < 3 {
    print("ticker " + str(id) + " tick " + str(count));
    yield();
    count = count + 1;
  }
  count
}

let t1 = spawn(fn() -> int { ticker(1) });
let t2 = spawn(fn() -> int { ticker(2) });
await(t1);
await(t2);
```

Output (interleaved):

```
ticker 1 tick 0
ticker 2 tick 0
ticker 1 tick 1
ticker 2 tick 1
ticker 1 tick 2
ticker 2 tick 2
```

Each `yield()` switches to the other ready coroutine. Without yields, one coroutine would run to completion before the other started.

---

## 13.4 Channels

A channel is a synchronous queue: `send(ch, v)` puts a value (blocking if the channel is full); `recv(ch)` takes a value (blocking if empty). Channels are the canonical way for coroutines to communicate without sharing mutable state.

### Example 4: producer-consumer

```aether
let ch = channel();

let producer = spawn(fn() -> () {
  let mut i = 0;
  while i < 5 {
    send(ch, i);
    i = i + 1;
  }
  close(ch);
});

let consumer = spawn(fn() -> int {
  let mut sum = 0;
  let mut keep = true;
  while keep {
    let r = recv(ch);
    if r is Some(v) {
      sum = sum + v;
    } else {
      keep = false;
    };
  }
  sum
});

let total = await(consumer);
print(total);   // 0+1+2+3+4 = 10
```

The producer sends 0..5 and closes the channel; the consumer reads until the channel is closed. The runtime suspends the consumer when the channel is empty and the producer when it's full. No explicit locking — the channel is the synchronisation primitive.

---

## 13.5 `select`

`select(ops)` waits for the first of several channel operations to complete, then executes the corresponding arm. This is the Go `select` statement, with the same semantics: ready operations race; if multiple are ready, the runtime picks one pseudo-randomly.

### Example 5: select between two channels

```aether
let ch1 = channel();
let ch2 = channel();

let f = spawn(fn() -> int {
  select([
    recv_op(ch1, fn(v: int) -> int { v + 100 }),
    recv_op(ch2, fn(v: int) -> int { v + 200 }),
  ])
});

send(ch2, 7);
let r = await(f);
print(r);   // 207  (ch2's 7 + 200)
```

`select` takes an array of channel operations (`recv_op` or `send_op`). The first one that's ready fires; the others are abandoned. If multiple are ready, the runtime picks one (not necessarily in order — this is intentional, to prevent starvation).

---

## 13.6 `join`

`join(futs)` waits for *all* of an array of futures to complete, returning an array of results. This is `Promise.all` / `Promise.allSettled` semantics.

### Example 6: join multiple spawns

```aether
let a = spawn(fn() -> int { 1 });
let b = spawn(fn() -> int { 2 });
let c = spawn(fn() -> int { 3 });

let results = await(join([a, b, c]));
print(results);   // [1, 2, 3]
```

`join` returns a future that resolves when all inputs resolve. If any input fails, `join` fails (the v3 default; a future `join_settled` would wait for all and report each result).

---

## 13.7 `race`

`race(futs)` waits for the *first* of an array of futures to complete, abandoning the others. This is `Promise.race` semantics.

### Example 7: race with timeout

```aether
async fn slow() -> int {
  sleep(1000);
  42
}

let result = await(race([spawn(slow), spawn(fn() -> int { timeout(50, 99) })]));
print(result);   // 99 (the timeout wins after 50ms)
```

`race` returns the first future to complete. The loser is dropped (its result is ignored; its resources are reclaimed). The `timeout(ms, default)` function races a sleep against an immediate return — if the sleep finishes first, the timeout's default wins; if the awaited operation finishes first, that result wins.

---

## 13.8 `timeout`

`timeout(ms, fut)` waits for `fut` for at most `ms` milliseconds. If `fut` finishes in time, return its value; otherwise, return an `Option::None` (or a custom timeout value).

### Example 8: timeout a slow operation

```aether
async fn slow_fetch() -> string {
  sleep(200);
  "data"
}

let r = await(timeout(100, slow_fetch()));
if r is Some(data) {
  print("got: " + data);
} else {
  print("timed out");   // this branch runs — 200ms > 100ms
}
```

`timeout` is built on `race` and `sleep`. The v3 default `timeout` returns `Option::None` on timeout; programs that want a different sentinel can use `race` directly.

---

## 13.9 Structured concurrency

Structured concurrency is the discipline that every spawned coroutine is *awaited* before its parent returns. The runtime enforces this: if a parent coroutine exits while a child is still running, the runtime aborts the child (or waits for it, depending on the configuration).

### Example 9: structured spawn

```aether
async fn parent() -> int {
  let child = spawn(fn() -> int {
    let mut sum = 0;
    let mut i = 0;
    while i < 10 {
      sum = sum + i;
      i = i + 1;
    }
    sum
  });
  let r = await(child);   // required — structured concurrency
  r + 1
}

print(await(spawn(parent)));   // (0+1+...+9) + 1 = 46
```

If `parent` returned without awaiting `child`, the runtime would either await or abort `child` (configurable). The default is to await, so no child is silently dropped. This is the same discipline as Go's `errgroup` and Rust's `tokio::task::spawn` with `JoinHandle`.

### Example 10: a worker pool

```aether
async fn worker(id: int, jobs: Channel<int>, results: Channel<int>) -> () {
  let mut keep = true;
  while keep {
    let r = recv(jobs);
    if r is Some(job) {
      send(results, job * job);
    } else {
      keep = false;
    };
  }
}

async fn pool(n_workers: int, n_jobs: int) -> [int] {
  let jobs = channel();
  let results = channel();
  let mut workers = [];
  let mut i = 0;
  while i < n_workers {
    push(workers, spawn(fn() -> () { worker(i, jobs, results) }));
    i = i + 1;
  }
  let mut j = 0;
  while j < n_jobs {
    send(jobs, j);
    j = j + 1;
  }
  close(jobs);
  let mut k = 0;
  while k < n_workers {
    await(workers[k]);
    k = k + 1;
  }
  let mut out = [];
  let mut m = 0;
  while m < n_jobs {
    let r = recv(results);
    if r is Some(v) { push(out, v) };
    m = m + 1;
  }
  out
}

let squares = await(pool(4, 10));
print(squares);   // [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]
```

The pool spawns N workers, sends M jobs, closes the jobs channel, awaits all workers (structured), and collects the results. The workers race on the channel — each pulls a job as it becomes available. Order is non-deterministic; a future `pool_ordered` would tag jobs with an index.

---

## 13.10 How the runtime works internally

The v3 async runtime is in `aether/vm/async/async.ts` and `aether/vm/coroutine/coroutine.ts`. The key pieces:

1. **`Coroutine`** — a struct with a frame, a poll function, and a state. The poll function takes the frame and returns `Poll<T>` (`Pending` or `Ready(T)`).
2. **`Scheduler`** — a queue of ready coroutines. `spawn` enqueues; the runtime loop dequeues and polls.
3. **`Waker`** — a callback the runtime installs on each future; when the future becomes ready, it enqueues the waiting coroutine.
4. **`Op.Suspend` / `Op.Resume`** (VM) — bytecode instructions that pop the current frame and store it in a coroutine, and restore a coroutine's frame and resume execution.

The runtime is single-threaded (v3 default): one worker, round-robin scheduling. A multi-worker runtime is on the roadmap (v3.2), with the same coroutine model but multiple ready queues.

The borrow checker (Chapter 12) makes this safe: a coroutine can't share `&mut` data with another coroutine (the borrow checker would reject the shared mut borrow). Coroutines communicate via channels (which transfer ownership) or via `&T` shared references (which are immutable, so concurrent reads are safe).

---

## 13.11 Summary

- **Coroutines** are functions that can suspend and resume. The compiler lowers `async fn` to a state machine with a frame.
- **`spawn(f)`** creates a coroutine from a closure; **`await(fut)`** blocks until the future is ready.
- **`yield()`** suspends the current coroutine; basis for cooperative multitasking.
- **Channels** are synchronous queues for coroutine communication. `send`/`recv` block; `close` signals end-of-stream.
- **`select`** races channel operations, firing the first one that's ready.
- **`join`** waits for all of an array of futures; **`race`** waits for the first.
- **`timeout`** races a future against a deadline; returns `Option::None` on timeout.
- **Structured concurrency** — every spawned coroutine is awaited before its parent returns. The runtime enforces this.
- **The runtime** is single-threaded with round-robin scheduling. Multi-worker is a v3.2 roadmap item.
- **The borrow checker** makes coroutines safe: no shared `&mut` across coroutines; communication via channels or `&T`.

The next chapter (Chapter 14) covers the WASM backend — which uses the coroutine model directly: a WASM module is a coroutine that the browser's WASM engine runs.
