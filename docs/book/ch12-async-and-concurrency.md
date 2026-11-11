# Chapter 12 — Async and concurrency

> Aether v2 has an async runtime: channels, `spawn`, `select`, `timeout`, and the higher-order async helpers `mapAsync`, `filterAsync`, `reduceAsync`, `awaitAll`, `race`, `retry`. The runtime is built on JS Promises (see ADR-13). This chapter covers the API, the structured-concurrency model, and the v2.x suspend/resume plan.

---

## 12.1 The async model

Aether v2's async is *cooperative* — there are no preemptive threads. Concurrency is achieved via:

- **Promises** — a value that will be available later. Created by `spawn`, `timeout`, `recv`, and the async helpers.
- **Channels** — bounded or unbounded queues that pass values between concurrent tasks.
- **`select`** — a race among channel operations; the first one to become ready wins.

The runtime is implemented in `aether/stdlib/async/index.ts` and `aether/vm/async/async.ts`. It uses JS Promises internally — the v2.1 plan is to migrate to a custom suspend/resume mechanism (see §12.6).

Aether's async is "sync-looking" in many cases. A `spawn` returns a `Promise<T>`; you can `await` it. There is no `async fn` keyword; functions that return Promises just return Promises (a Promise is a regular value).

---

## 12.2 `spawn` — start a concurrent task

`spawn(fn)` schedules `fn` on the microtask queue and returns a `Promise<T>` that resolves with `fn`'s return value:

```aether
let p = spawn(fn() -> int { 1 + 1 });
let v = await(p);
print(v);   // 2
```

Multiple `spawn`s run concurrently:

```aether
let p1 = spawn(fn() -> int {
  let mut s = 0;
  for i in range(0, 1000000) { s = s + i; }
  s
});
let p2 = spawn(fn() -> int {
  let mut s = 0;
  for i in range(0, 1000000) { s = s + i * 2; }
  s
});
let r1 = await(p1);
let r2 = await(p2);
print(r1);   // 499999500000
print(r2);   // 999999000000
```

(Both `spawn`s run "concurrently" in the JS-engine sense: their microtasks interleave. Aether is single-threaded; there's no parallelism, only concurrency.)

---

## 12.3 Channels

A *channel* is a queue for passing values between tasks. `channel()` creates an unbounded channel:

```aether
let ch = channel();
send(ch, "hello");
let v = await(recv(ch));
print(v);   // hello
```

- `send(ch, v)` — send a value. Returns a `Promise<void>` (resolves immediately for unbounded channels).
- `recv(ch)` — receive a value. Returns a `Promise<any>` (blocks until a value is available).
- `close(ch)` — close the channel. Future `recv` on a closed channel rejects with "channel closed".

### 12.3.1 Producer/consumer

```aether
let ch = channel();
// Producer:
spawn(fn() -> () {
  for i in range(0, 5) { send(ch, i); }
  close(ch);
});
// Consumer:
let mut sum = 0;
let mut done = false;
while !done {
  let r = await(recv(ch));
  match(r) {
    Option::Some(v) => { sum = sum + v; },
    Option::None => { done = true; },
  }
}
print(sum);   // 10 (0+1+2+3+4)
```

(Actually, `recv` on a closed channel *rejects* the Promise, not returns `None`. The example above uses `Option::Some/None` for illustrative purposes; in real code you'd catch the rejection or check a "closed" flag. The exact API is being finalized in v2.1.)

### 12.3.2 Bounded channels

Aether v2's channels are unbounded (no buffer-size limit). v2.1 will add bounded channels with `send` blocking when the buffer is full (creating real backpressure).

---

## 12.4 `select` — race channel operations

`select(ops, timeout?)` races channel operations; the first one to become ready wins:

```aether
let ch1 = channel();
let ch2 = channel();
spawn(fn() -> () { send(ch2, "from ch2"); });
let r = await(select([
  { op: "recv", ch: ch1 },
  { op: "recv", ch: ch2 },
]));
print(r);   // { ch: ch2, value: "from ch2" }
```

The `select` API is JS-object-based in v2 (the parser doesn't yet support tagged-union argument shapes). v2.1 will revisit with a more idiomatic Aether API.

### 12.4.1 With timeout

```aether
let ch = channel();
let r = await(select([ { op: "recv", ch: ch } ], 100));   // 100ms timeout
match(r) {
  Option::Some(v) => print(f"got: {v}"),
  Option::None => print("timed out"),
}
```

(`select` with a timeout returns `None` if no op became ready in time.)

---

## 12.5 Async helpers

The `async` stdlib has the higher-order async functions:

### 12.5.1 `awaitAll`

`awaitAll(ps)` waits for all promises to resolve:

```aether
let ps = [
  spawn(fn() -> int { 1 + 1 }),
  spawn(fn() -> int { 2 * 3 }),
  spawn(fn() -> int { 10 - 4 }),
];
let results = await(awaitAll(ps));
print(results);   // [2, 6, 6]
```

### 12.5.2 `race`

`race(ps)` returns the first promise to resolve:

```aether
let slow = spawn(fn() -> int {
  let mut s = 0;
  for i in range(0, 10000000) { s = s + i; }
  s
});
let fast = spawn(fn() -> int { 42 });
let first = await(race([slow, fast]));
print(first);   // 42
```

### 12.5.3 `mapAsync`

`mapAsync(arr, fn)` applies `fn` (which returns a Promise) to each element sequentially:

```aether
let urls = ["a", "b", "c"];
let fetch = fn(url: string) -> string {
  // hypothetical async fetch
  url + "-data"
};
let results = await(mapAsync(urls, fn(url: string) -> Promise<string> { fetch(url) }));
print(results);   // ["a-data", "b-data", "c-data"]
```

(Sequential; v2.1 will add a parallel variant.)

### 12.5.4 `filterAsync`, `reduceAsync`

Same shape: `filterAsync(arr, fn)` keeps elements where `fn` (which returns `Promise<bool>`) is true. `reduceAsync(arr, fn, init)` folds left with an async `fn`.

### 12.5.5 `retry`

`retry(n, fn)` runs `fn` up to `n` times, retrying on rejection:

```aether
let mut attempts = 0;
let flaky = fn() -> int {
  attempts = attempts + 1;
  if attempts < 3 { panic("not yet"); }
  42
};
let r = await(retry(5, flaky));
print(r);   // 42
print(attempts);   // 3
```

### 12.5.6 `debounce`

`debounce(fn, ms)` wraps `fn` so it only fires after `ms` of quiet:

```aether
let log = debounce(fn(x: int) -> () { print(x); }, 100);
log(1);
log(2);
log(3);
// 100ms later: prints 3 (the last call only)
```

### 12.5.7 `defer`

`defer(fn)` queues `fn` as a microtask:

```aether
print("a");
defer(fn() -> () { print("c"); });
print("b");
// Output: a, b, c
```

---

## 12.6 The v2.x suspend/resume plan

Aether v2 uses JS Promises for async. This works (you can `await` anything that returns a Promise), but it has limitations:

- Aether functions can't *suspend* mid-execution (a JS Promise is a value, not a coroutine). To wait for an async operation, the Aether function has to *return* a Promise — it can't pause, wait, then resume.
- The async stack is the JS stack (deep async recursion can blow the JS stack).
- Debugging async stack traces is hard (the JS engine's "async stack" feature is opaque).

The v2.1 plan is to implement *suspend/resume*:

- Aether functions that `await` are compiled to a state machine (a switch on the current "await point").
- Each `await` is a yield point: the function saves its state, returns a Promise, and is resumed when the Promise resolves.
- The state machine is built by the IR/optimizer/codegen, not by the programmer.

This is the same approach as Rust's `async`/`await`, JS's `async`/`await` (desugared to generators), and Python's `asyncio` (desugared to coroutines).

The implementation will be in `aether/vm/async/async.ts` (currently mostly a stub) and will use the IR's `Match` opcode for the state-machine dispatch.

See RFC-001 for the async/await design and ADR-13 for the "JS Promises vs generators" decision.

---

## 12.7 Structured concurrency

Aether's structured-concurrency model is *planned* (not yet implemented):

- A "scope" is a region in which tasks are spawned; the scope doesn't complete until all its tasks have completed (or errored).
- A task can't escape its scope (no "fire and forget" tasks that outlive their scope).
- Errors in a scope propagate to the scope's parent.

The API (planned):

```aether
fn fetch_all(urls: [string]) -> [string] {
  with_scope(fn(scope) -> () {
    for url in urls {
      scope.spawn(fn() -> string { fetch(url) });
    }
  })
}
```

(`with_scope` and `scope.spawn` are v2.1 — not yet implemented.)

The model is borrowed from Trio (Python) and Kotlin's structured concurrency. The motivation: make async code easier to reason about by enforcing that tasks don't outlive their scope.

---

## 12.8 Eight runnable examples

**1. `spawn` and `await`.**

```aether
let p = spawn(fn() -> int { 1 + 1 });
let v = await(p);
print(v);   // 2
```

**2. `awaitAll` of multiple spawns.**

```aether
let ps = [
  spawn(fn() -> int { 1 + 1 }),
  spawn(fn() -> int { 2 * 3 }),
  spawn(fn() -> int { 10 - 4 }),
];
print(await(awaitAll(ps)));   // [2, 6, 6]
```

**3. `race`.**

```aether
let slow = spawn(fn() -> int { 0 });
let fast = spawn(fn() -> int { 42 });
print(await(race([slow, fast])));   // 42 (probably)
```

**4. Channel send/recv.**

```aether
let ch = channel();
send(ch, "hello");
print(await(recv(ch)));   // hello
```

**5. Producer/consumer.**

```aether
let ch = channel();
spawn(fn() -> () {
  for i in range(0, 5) { send(ch, i); }
  close(ch);
});
let mut sum = 0;
let mut i = 0;
while i < 5 {
  sum = sum + await(recv(ch));
  i = i + 1;
}
print(sum);   // 10
```

**6. `timeout`.**

```aether
await(timeout(50));   // wait 50ms
print("done");
```

**7. `mapAsync`.**

```aether
let xs = [1, 2, 3];
let results = await(mapAsync(xs, fn(x: int) -> int { x * 2 }));
print(results);   // [2, 4, 6]
```

**8. `retry`.**

```aether
let mut attempts = 0;
let f = fn() -> int {
  attempts = attempts + 1;
  if attempts < 3 { panic("not yet"); }
  42
};
let r = await(retry(5, f));
print(r);   // 42
print(attempts);   // 3
```

---

## 12.9 Summary

- Aether v2's async is cooperative, single-threaded, JS-Promise-based.
- `spawn(fn)` schedules `fn` on the microtask queue, returns `Promise<T>`.
- Channels (`channel()`, `send`, `recv`, `close`) pass values between tasks.
- `select` races channel operations; first ready wins. With a timeout, returns `None` on timeout.
- Async helpers: `awaitAll`, `race`, `mapAsync`, `filterAsync`, `reduceAsync`, `retry`, `debounce`, `defer`.
- The v2.x plan is to implement suspend/resume (compile `await` to a state machine) — see RFC-001 and ADR-13.
- Structured concurrency (scopes that enforce task lifetime) is planned.

The next chapter is tooling: the CLI, the formatter, the linter, the planned LSP, the test runner, and docgen.
