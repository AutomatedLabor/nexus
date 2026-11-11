# Concurrency in Aether

> Audience: anyone wondering where `async`, `await`, `spawn`, and
> channels are.
> Prerequisites: basic familiarity with async/await in any
> language. 30 minutes.

This tutorial is **honest** about Aether v1's concurrency story.
v1 is **single-threaded and synchronous**. There is no `async
fn`, no `await`, no `spawn`, no channels, no `select`. The
evaluator (`aether/core/eval/eval.ts`) walks the AST one step at
a time and never yields control to another piece of code.

The v2 plan adds an async/await system, a task scheduler, and
channels. The design is sketched in
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md).
There is a `stdlib/async` module in the v1 source tree, but its
functions are not callable from Aether code — the v1 evaluator
does not understand `Promise` values. See
[../tutorials/stdlib-tour.md](../tutorials/stdlib-tour.md) §10
for the honest status.

This document explains what v1 does, what v2 will do, and how to
write code today that is forward-compatible with the v2 design.

## 1. The v1 reality

Aether v1's evaluator is a synchronous tree-walking interpreter.
Every program runs to completion (or hits the step limit) before
control returns to the host. There is no event loop, no
microtask queue, no scheduler. The runtime is deterministic: the
same program with the same input always produces the same output
in the same order.

What this means in practice:

- **No concurrent execution.** Two pieces of code never run at
  the same time. There is no parallelism.
- **No I/O.** v1 has no `fetch`, no `readFile`, no `setTimeout`.
  The only I/O is `print`/`println` (to the playground's output
  pane) and a few stdlib `io` functions that only work in Node
  (which the playground is not).
- **No callbacks.** A function call is a function call; the
  caller waits for the callee to return.
- **No event loop.** The program runs from top to bottom and
  exits when it reaches the end of the source.

This is the simplest possible model. It is correct for the
playground, which is a teaching tool. It is not correct for a
production language, which is why v2 adds async.

## 2. Why v1 is single-threaded

Three reasons:

1. **Implementation simplicity.** A tree-walking interpreter is
   1000 lines of code; an event loop is another 500; a
   work-stealing scheduler is another 2000. v1 prioritized
   getting *something* working over getting *everything* working.
2. **Browser constraint.** The playground runs in the browser,
   which is single-threaded for JavaScript. A multi-threaded
   language would require Web Workers, which add complexity.
3. **Teaching value.** A single-threaded language is easier to
   reason about. There are no races, no deadlocks, no
   synchronization primitives to learn. You can focus on the
   type system and the stdlib without worrying about
   concurrency.

The tradeoff is that Aether v1 cannot express any program that
needs concurrency: web servers, parallel computation, UI
animation, real-time data processing. Those are all v2 concerns.

See
[../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md)
for the rationale and
[../decisions/adr-10-browser-runnable-core.md](../decisions/adr-10-browser-runnable-core.md)
for the browser constraint.

## 3. The v2 plan: async/await

The v2 design adds `async fn`, `await`, `spawn`, channels, and
`select`. The design is in
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md).
This section sketches the surface syntax with examples. None
of this runs in v1; the syntax is presented to show where the
language is going.

### 3.1 `async fn` and `await`

```aether
// v2 sketch — does NOT run in v1.

async fn fetch_user(id: int) -> User {
  let resp = await http_get(f"/users/{id}");
  parse_user(resp)
}

async fn main() {
  let alice = await fetch_user(1);
  print(alice.name);
}
```

- `async fn` declares a function that returns a `Future<T>`.
- `await` suspends the current task until the future resolves.
- The runtime is single-threaded by default (cooperative
  scheduling); a multi-threaded work-stealing runtime is
  opt-in.

### 3.2 `spawn`

```aether
// v2 sketch — does NOT run in v1.

async fn main() {
  let h1 = spawn { fetch_user(1) };
  let h2 = spawn { fetch_user(2) };
  let u1 = await h1;
  let u2 = await h2;
  print(u1.name);
  print(u2.name);
}
```

`spawn { ... }` schedules a task on the runtime and returns a
`JoinHandle<T>`. `await` on the handle waits for the task to
complete. Tasks run concurrently; they do not run in parallel
unless the multi-threaded runtime is enabled.

### 3.3 Channels

```aether
// v2 sketch — does NOT run in v1.

async fn producer(ch: Channel<int>) {
  for i in range(0, 10) {
    send(ch, i);
  }
  close(ch);
}

async fn consumer(ch: Channel<int>) {
  loop {
    let v = await recv(ch);
    print(v);
  }
}

async fn main() {
  let ch = channel<int>();
  spawn { producer(ch) };
  spawn { consumer(ch) };
}
```

Channels are bounded queues for sending values between tasks.
`send(ch, v)` puts a value on the channel; `recv(ch)` takes one
off. `recv` is `async` because the channel might be empty.

### 3.4 `select`

```aether
// v2 sketch — does NOT run in v1.

async fn main() {
  let ch1 = channel<int>();
  let ch2 = channel<string>();
  loop {
    let result = select {
      v = recv(ch1) => print(f"int: {v}"),
      s = recv(ch2) => print(f"str: {s}"),
      timeout(1000) => { print("timeout"); break; },
    };
  }
}
```

`select` races multiple channel operations and runs the first
one that becomes ready. This is the Go/Rust pattern for
multiplexing.

### 3.5 Structured concurrency

```aether
// v2 sketch — does NOT run in v1.

async fn main() {
  // All spawned tasks must complete before `main` returns.
  let scope = Scope::new();
  scope.spawn { fetch_user(1) };
  scope.spawn { fetch_user(2) };
  scope.spawn { fetch_user(3) };
  // `scope` waits here for all three to finish.
}
```

Structured concurrency is the principle that tasks have a
well-defined lifetime: they start when their scope starts and
end when their scope ends. The v2 design is built around this.

## 4. The `async` stdlib module

The v1 source tree has a `aether/stdlib/async` module that
declares functions like `channel`, `send`, `recv`, `close`,
`select`, `timeout`, `spawn`, `await_all`, `race`, `map_async`,
`filter_async`, `reduce_async`, `defer`, `retry`, `debounce`,
`run_async`. The function signatures are real — they exist in
`aether/stdlib/async/index.ts` — but they are **not callable
from Aether v1 code** because the v1 evaluator does not
understand `Promise` values.

The reason the module exists is to:

1. Document the v2 API. The signatures are the contract.
2. Let host code (the playground, a future CLI) call the async
   functions directly. The host can call `await Async.spawn(...)`
   from JavaScript without needing Aether to know about
   promises.
3. Provide a target for the v2 evaluator. When v2 ships, the
   evaluator will understand promises and the `async` module
   will become callable from Aether.

The honest status: **the async stdlib module is a spec, not an
implementation**, for Aether v1 code. See
[../tutorials/stdlib-tour.md](../tutorials/stdlib-tour.md) §10
for the details.

## 5. What you can do today

In v1, you have three honest options for "concurrent-looking"
code.

### 5.1 Sequential composition

Just call functions in sequence. There is no concurrency, but
the code is clear and the order is deterministic:

```aether
fn fetch_user(id: int) -> User {
  // Pretend this is fast.
  User { id: id, name: "user" }
}

let alice = fetch_user(1);
let bob = fetch_user(2);
print(alice.name);
print(bob.name);
```

This is the v1 idiom. It will continue to work in v2; you can
upgrade to `async`/`await` when you need concurrency.

### 5.2 Pre-compute everything

If your program needs to "do many things," pre-compute them in
a loop and use the results. This is the way to write
data-parallel code in v1:

```aether
fn process(items: [int]) -> [int] {
  map(items, fn(x: int) -> int { x * x })
}

let data = range(0, 100);
let results = process(data);
print(results[10]);
```

For genuinely parallel work in v1, you would need to drop to
the host JavaScript level and use `Promise.all` outside the
Aether evaluator. There is no language support for this.

### 5.3 Write code that is forward-compatible with v2

If you know your code will run under v2 eventually, structure
it so that adding `async`/`await` is a mechanical change. The
pattern is:

```aether
// v1 today.
fn fetch_and_print(id: int) -> User {
  let u = fetch_user(id);
  print(u.name);
  u
}

// v2 tomorrow — just sprinkle `async` and `await`.
// async fn fetch_and_print(id: int) -> User {
//   let u = await fetch_user(id);
//   print(u.name);
//   u
// }
```

Functions that look like they will be I/O-bound (file, network,
database) should be small, single-purpose, and named with a
verb that suggests `await` (`fetch`, `read`, `write`, `load`,
`save`). When v2 ships, the migration is mechanical.

## 6. The `spawn` builtin in v1

There is no `spawn` in v1. The `async` stdlib module exports a
`spawn` function, but it is not callable from Aether v1 code.
See §4 above.

## 7. What the spec says

The spec at
[../spec/07-functions-closures-async.md](../spec/07-functions-closures-async.md)
describes the v2 async design in detail. The key points:

- `async fn` returns `Future<T>`.
- `await` is a postfix operator (`expr.await`) and a prefix
  keyword (`await expr`).
- The default runtime is single-threaded and cooperative.
- A multi-threaded work-stealing runtime is opt-in.
- Tasks have structured lifetimes via `Scope`.
- Channels are the primary IPC mechanism.
- `select!` is the multiplexing primitive.

The spec is the v2 target. v1 does not implement any of it.
The v1 evaluator (`aether/core/eval/eval.ts`) is strictly
synchronous.

## 8. The honest tradeoff

Aether v1 chooses:

- **Synchronous over async.** No event loop, no scheduler, no
  promises. Code runs top to bottom.
- **Single-threaded over multi-threaded.** No races, no
  deadlocks, no synchronization primitives. Code is
  deterministic.
- **Browser over server.** v1 runs in the browser, which is
  single-threaded for JavaScript. v2 will support server-side
  execution with async.

The tradeoff is that v1 cannot express any program that needs
concurrency. This is a real limitation, and it is the one most
likely to make Aether v1 unusable for real applications. The v2
plan addresses it; see
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md).

## 9. A worked example: what v2 will enable

Here is a sketch of what an Aether program that uses async
will look like in v2. None of this runs in v1; the syntax is
presented to show the v2 target.

```aether
// v2 sketch — does NOT run in v1.

async fn fetch_user(id: int) -> User {
  let resp = await http_get(f"/users/{id}");
  parse_user(resp)
}

async fn fetch_all(ids: [int]) -> [User] {
  let handles = map(ids, fn(id: int) -> JoinHandle<User> {
    spawn { fetch_user(id) }
  });
  await_all(handles)
}

async fn main() {
  let users = await fetch_all([1, 2, 3, 4, 5]);
  for u in users {
    print(u.name);
  }
}
```

The same program in v1 would be sequential:

```aether
// v1 today.

fn fetch_user(id: int) -> User {
  // Pretend this is fast.
  User { id: id, name: f"user{id}" }
}

fn fetch_all(ids: [int]) -> [User] {
  map(ids, fn(id: int) -> User { fetch_user(id) })
}

let users = fetch_all([1, 2, 3, 4, 5]);
for u in users {
  print(u.name);
}
```

The v1 version runs all five `fetch_user` calls in sequence;
the v2 version will run them concurrently. The structure is the
same; the only change is adding `async` to the function
declarations and `await` before the calls.

## 10. Where to go next

- **[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md)**
  — the v2 async/await design.
- **[../spec/07-functions-closures-async.md](../spec/07-functions-closures-async.md)**
  — the spec for v2 async, channels, and the task scheduler.
- **[../spec/11-memory-and-gc.md](../spec/11-memory-and-gc.md)**
  — the GC design (which matters for v2 because async tasks
  hold references to captured values).
- **[../tutorials/stdlib-tour.md](../tutorials/stdlib-tour.md) §10**
  — the honest status of the `async` stdlib module.

Aether v1 is single-threaded. The v2 plan is async/await with
channels and structured concurrency. Until v2 ships, write
code that is forward-compatible with `async` and accept that
everything is sequential.
