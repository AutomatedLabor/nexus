# 07 — Functions, Closures & Async

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/core/ast`, `aether/core/eval`, `aether/vm`
> **Spec version:** 0.1

This section specifies the dynamic semantics of functions, closures,
and asynchronous computations. The static typing rules are in
[§03](./03-type-system.md) and [§04 §11](./04-expressions.md#closures);
this section focuses on runtime behavior.

## 1. Function calls

A function call `f(a₁, …, aₙ)` proceeds as follows:

1. The callee `f` is evaluated to a function value.
2. Each argument `aᵢ` is evaluated left-to-right (see
   [§04 §16](./04-expressions.md#evaluation-order)).
3. A new **call frame** is pushed onto the current task's frame
   stack. The frame contains the function's prototype, a fresh set
   of locals, and an instruction pointer at the function's entry.
4. Arguments are bound to parameters. By-value parameters receive
   copies (for `Copy` types) or moves (for non-`Copy` types);
   by-reference parameters receive `&T` / `&mut T` references into
   the caller's frame.
5. The function body executes until it returns, raises, or panics.
6. The frame is popped and the return value (if any) becomes the
   value of the call expression.

### 1.1 Tail calls

A `return f(args)` whose return type matches the enclosing
function's return type and whose `f` is a non-async function MAY be
compiled as a **tail call** that does not grow the frame stack. The
compiler is *not required* to perform tail-call optimization, but
it MUST guarantee that any loop expressed entirely in tail-call
form runs in constant stack space. Tail calls to `async fn` are
not optimized in 0.1 (Q-TAIL-1).

### 1.2 Recursion limits

Each task has a configurable **stack limit** (default 8 MiB; 1 MiB
for `wasm32`). Exceeding the limit raises a *panic* with code
`StackOverflow`, recoverable via `try` (§08 5). The compiler does
not perform *guaranteed* tail-call optimization for ordinary
recursion; deep recursion is the programmer's responsibility.

## 2. Parameter and return-value semantics

### 2.1 Passing modes

| Declared | Caller side | Callee side |
|----------|-------------|-------------|
| `x: T` (where `T: Copy`) | copy | owns the copy |
| `x: T` (where `T: !Copy`) | move | owns the value |
| `x: &T` | borrows `&T` | borrows `&T` |
| `x: &mut T` | borrows `&mut T` | borrows `&mut T` |
| `x: Box<T>` | moves the `Box` | owns the heap value |

### 2.2 Variadic parameters

Variadic functions are **not** supported in 0.1. Functions that
need a variable number of arguments take a slice or a `List`:

```aether
fn sum(xs: &[Int]) -> Int { xs.iter().fold(0, |a, b| a + b) }
```

Variadic C-FFI calls are supported via `extern "c"` with a trailing
`...` parameter; see [§14](./14-interoperability.md).

### 2.3 Default and named arguments

```aether
fn greet(name: String, greeting: String = "hi", excited: Bool = false) -> String {
    let end = if excited { "!" } else { "." };
    format("{greeting}, {name}{end}")
}

greet("ada")
greet("ada", excited: true)
greet("ada", greeting: "howdy")
```

- Arguments may be supplied positionally or by name.
- Named arguments may appear in any order after all positional
  arguments.
- A named argument that does not match any parameter is `E1105`.
- Defaults are evaluated at the call site each call (no memoization),
  in the caller's scope.

## 3. Closures

A closure is a function value together with a captured environment.
Closures have three flavors based on how they capture:

| Capture mode | Trait | Re-callable |
|---|---|---|
| by `&` (default for non-mutating uses) | `Fn` | many times |
| by `&mut` (default for mutating uses) | `FnMut` | many times |
| by move (with `move` keyword) | `FnOnce` | once |

A closure's trait is the *most permissive* that the closure's body
requires; this is inferred at the call site. A closure with no
captures coerces to `fn` and may be stored in a `fn`-typed slot.

### 3.1 Capture inference

For each variable `v` used (read or written) inside a closure body,
the compiler decides the capture mode per-use:

- A *read* of `v` captures `&v`.
- A *write* of `v` captures `&mut v`.
- A *move out of `v`* (e.g. `return v`) captures `v` by value.

With the `move` keyword, every capture is by value (with `Clone`
invoked if the variable is used by reference after the closure is
constructed). This is the only form permitted for closures passed to
`spawn` (§4.1).

### 3.2 Lifetime of captures

Captures live as long as the closure value lives. The borrow
checker (§03 6.4) ensures that a `&T` or `&mut T` capture does not
outlive the borrowed binding. Because the GC owns all heap data, a
`move` closure's captured `Box<T>` is reclaimed when the closure is
reclaimed.

### 3.3 Closure representation

At the VM level (§10), a closure is a pair of:

- a *prototype pointer* (the function body's bytecode), and
- an *environment*: a heap-allocated record holding the captured
  values, in capture-declaration order.

Calling a closure copies the environment pointer into a fresh frame
and jumps to the prototype's entry. There is no distinction between
closures and ordinary functions at the bytecode level: every
function carries an environment pointer (which is null for
non-capturing closures and for `fn` items).

## 4. Async and concurrency

### 4.1 `async fn` and `Future`

`async fn f(args) -> T` desugars to:

```aether
fn f(args) -> Future<Output = T> {
    Future::from_closure(|ctx: &mut Task| {
        // body, with `await` desugared as Task::yield_
    })
}
```

A `Future` is a state machine with two methods on the `Future`
trait:

```aether
trait Future {
    type Output;
    fn poll(&mut self, ctx: &mut Task) -> Poll<Self::Output>;
}
enum Poll<T> { Ready(T), Pending }
```

`await` desugars as a `poll` loop:

```aether
let x = future.await;
// becomes:
loop {
    match Task::poll_on(future, ctx) {
        Ready(v) => { x = v; break; }
        Pending  => { Task::yield_(ctx); }
    }
}
```

The compiler is responsible for transforming `async fn` bodies into
state machines, splitting the function at each `await` point. Each
`await` is a potential suspension point; locals live across the
await inside the future's state-machine storage (the "frame").

### 4.2 The task scheduler

A **task** is a unit of async execution. Tasks are cooperatively
scheduled by a runtime. The default runtime (`aether.toml` →
`[runtime] mode = "cooperative"`) is single-threaded: the runtime
polls ready tasks in turn and never preempts a task between
suspension points. The optional `work-stealing` runtime spawns one
worker thread per CPU and migrates tasks between them; tasks marked
`Send` may run on any worker.

A program's `main` runs as a task. The runtime is created
automatically; for advanced use cases a program may construct its
own `Runtime` and spawn tasks onto it (see §4.4).

### 4.3 Channels

```aether
let (tx, rx) = Channel::<Int>::unbounded();
spawn async {
    for i in 0..10 { tx.send(i).await; }
};
while let Some(i) = rx.recv().await {
    println(i);
}
```

- `Channel::unbounded()` returns a sender and a receiver that share
  an unbounded queue. The sender is `Clone`; the receiver is not.
- `Channel::bounded(n)` returns a bounded channel; `send` blocks
  (awaits) when the buffer is full.
- `send` and `recv` are async; they suspend the calling task until
  the channel can accept/deliver.
- Closing a sender (`drop(tx)`) makes `recv` eventually return
  `None`. Closing the receiver makes `send` return an `Err` with
  the value back.

### 4.4 `spawn` and `JoinHandle`

```aether
let handle: JoinHandle<Int> = spawn async { compute() };
let result = handle.await;       // Ready(Int) or panics if the task panicked
```

- `spawn` schedules the given future on the runtime and returns a
  `JoinHandle<T>`. The future starts on the next scheduler tick; it
  does not run inline at the `spawn` call.
- Awaiting the handle yields the future's result. If the task
  panicked, awaiting re-raises the panic in the awaiter's task
  (recoverable via `try`).
- A handle may be dropped without awaiting; the task continues to
  completion. Detached tasks are tracked by the runtime for
  cancellation on `Runtime::shutdown`.
- A task may be cancelled by `handle.cancel()`, which causes the
  task's next `await` to raise `Cancelled`.

### 4.5 `select!`

```aether
select! {
    v = rx1.recv() => println("got {v} from rx1"),
    v = rx2.recv() => println("got {v} from rx2"),
    _ = Timer::after(1.seconds()) => println("timeout"),
}
```

`select!` is a built-in macro that polls each branch's future
concurrently and runs the body of the first to become `Ready`. The
other branches' futures are dropped (or, if they implement
`Cancel`, their `cancel` method is invoked). Branches are polled
in declaration order on the first iteration to break ties.

The full grammar is in [§13 §3 Built-in macros](./13-tooling.md#built-in-macros).

## 5. Concurrency safety

- Aether does not have Rust's `Send`/`Sync` discipline at the type
  level by default: any value can be sent between tasks. This is
  safe *only* because the GC owns all heap data and the runtime
  serializes GC access. Unsafe concurrent mutation of shared
  mutable state is still possible via `Rc`/`RefCell`, but the
  runtime catches the obvious cases at task boundaries
  (`TaskBoundaryCheck`).
- For real concurrent sharing, the stdlib provides `Arc<T>` (atomic
  reference count), `Mutex<T>`, and `RwLock<T>` (§12). Use of
  `Rc`/`RefCell` across a `spawn` boundary is a runtime error
  `E1200` at the point of cross-task transfer.

## 6. Conformance

A conformant implementation MUST:

- preserve `async fn` semantics: an async function's body suspends
  at `await` points and resumes from the same state,
- provide a default runtime that schedules at least one task at a
  time,
- ensure that a panic inside an async task is observable via the
  corresponding `JoinHandle.await` (i.e. it does not silently
  disappear),
- not deadlock on a future that polls itself synchronously; the
  runtime MUST detect this and panic with `SelfPoll`.
