# Aether Async Runtime — `aether/vm/async`

> Cooperative async scheduling for Aether v2 — a real, host-side runtime that
> drives JS Promises under the hood. Maps 1:1 to RFC-001's `async`/`await`/
> `spawn`/`channel`/`select` keywords so the future native v2 `await` is a
> drop-in replacement.

## 1. What this is

`aether/vm/async/async.ts` is a **real** cooperative async runtime: it spawns
tasks on the JS microtask queue, supports buffered channels with blocking
`send`/`recv`, `select` over channel ops with optional timeout, `join` and
`race` over task groups, and `cancel` for task-cancellation. Everything is
implemented on top of JS `Promise` — there's no fake scheduler, no busy-wait
loop, no `setInterval` polling. Tasks really run concurrently on the
microtask queue; channels really block (Promise pending) when full or empty;
`select` really races operations.

The runtime exposes one class — `AsyncRuntime` — and one host registration
helper — `registerAsyncBuiltins`. Aether scripts themselves cannot call these
directly from the v1 sync evaluator (they'd return `[object Promise]`); they're
for host TypeScript code (the playground's "Run async demo" button, the CLI's
`aether repl` session, stdlib `async` functions driven from outside). The API
surface is the same shape as RFC-001, so when the v2 bytecode VM lands native
suspend/resume, the language keywords map cleanly to these primitives.

## 2. The JS-async limitation (documented up front)

True synchronous `await` is **impossible in JS**. A synchronous function that
"blocks until a Promise resolves" would either:

1. Spin on a busy-wait loop, deadlocking the microtask queue (so the awaited
   Promise never actually runs its `.then` callback), or
2. Use JS generators + a custom scheduler — but Aether's evaluator and the
   v2 bytecode VM aren't generator-based, and rewriting every evaluator
   function as a generator is a major refactor with its own quirks.

So this runtime exposes **async-then** semantics: every "blocking" primitive
returns a `Promise` that the caller (host code, or the future `await`
keyword) consumes. The `AsyncRuntime.await(id)` method is named after the
RFC-001 `await` keyword but it **returns a `Promise<Value>`, not a `Value`**.
Host code uses `await runtime.awaitAsync(id)`; the future v2 `await` keyword
will compile to a bytecode VM instruction that suspends the frame (captures IP
+ operand stack), registers a continuation with the awaited future, returns
control to the executor, and resumes the frame when the future resolves.

This is the standard CPS / generator / coroutine implementation that every
real async runtime uses (Python `asyncio`, Rust `tokio`, Kotlin coroutines,
Go goroutines). The v1 tree-walker doesn't have it because there's no place
to stash a half-evaluated AST node + its environment chain. The v2 bytecode
VM has neither problem because the IP and operand stack are explicit data,
not JS call-stack frames — see `docs/rfcs/rfc-001-async-await.md` § "Runtime:
executor and suspend/resume" for the design.

## 3. Public API

```ts
export interface Task {
  id: number;
  state: "pending" | "running" | "done" | "error";
  value?: Value;
  error?: string;
  cancelled: boolean;
  promise: Promise<Value>;
}

export interface Channel {
  id: number;
  buf: Value[];
  capacity: number;
  recvers: Array<{ resolve, reject }>;
  senders: Array<{ value, resolve, reject }>;
  closed: boolean;
}

export interface SelectResult { index: number; value?: Value; }

export class AsyncRuntime {
  spawn(fn: () => Value | Promise<Value>): Task;
  awaitAsync(taskId: number): Promise<Value>;
  await(taskId: number): Promise<Value>;  // alias for awaitAsync

  channel(capacity?: number): Channel;
  send(ch: Channel, v: Value): Promise<void>;
  recv(ch: Channel): Promise<Value | undefined>;
  close(ch: Channel): void;
  select(ops: Array<{ ch, op: "recv"|"send", value? }>, timeoutMs?): Promise<SelectResult>;

  timeout(ms: number): Task;
  defer(fn: () => Value | Promise<Value>): Task;
  join(taskIds: number[]): Promise<Value[]>;
  race(taskIds: number[]): Promise<Value>;
  cancel(taskId: number): void;

  getTask(id): Task | undefined;
  getChannel(id): Channel | undefined;
  allTasks(): Task[];
  taskCount(): number;
  channelCount(): number;
}

export function registerAsyncBuiltins(reg: (name, fn) => void): void;
```

## 4. How the runtime maps to RFC-001

| RFC-001 surface        | Runtime API         | Notes                                           |
|------------------------|---------------------|-------------------------------------------------|
| `async fn f() -> T`    | `spawn(() => T)`    | Wraps fn in `Promise.resolve().then(fn)`.       |
| `await future`         | `awaitAsync(id)`    | Returns a Promise; v2 will use native suspend.  |
| `spawn(future)`        | `spawn(fn)`         | Schedules on the microtask queue immediately.   |
| `channel<T>()`         | `channel(0)`        | Capacity 0 = unbounded (RFC-001 default).      |
| `channel<T>(cap)`      | `channel(cap)`      | Bounded: `send` blocks while full.              |
| `ch.send(v)`           | `send(ch, v)`       | Hands to a waiting recv or buffers; blocks if full. |
| `ch.recv()`            | `recv(ch)`          | Drains buffer or blocks; `undefined` on closed. |
| `ch.close()`           | `close(ch)`         | Future `send` rejects; pending `recv` gets `undefined`. |
| `select(ops, ms)`      | `select(ops, ms)`   | First op wins; `index === -1` on timeout.       |
| `join(handles)`        | `join(ids)`         | `Promise.all` over the handles' promises.       |
| `race(handles)`        | `race(ids)`         | `Promise.race`; losers keep running.            |
| `handle.cancel()`      | `cancel(id)`        | Marks the handle; future `await` rejects.      |
| `timeout(ms)`          | `timeout(ms)`       | Task resolving `null` (unit) after `ms`.       |

### 4.1 Channel semantics

RFC-001 specifies:

> `ch.send(v)` returns `Future<()>`. It resolves immediately for an unbounded
> channel with no waiters; it suspends if the channel is bounded and full.
> `ch.recv()` returns `Future<Option<T>>`. `Some(v)` for a value; `None` when
> the channel is closed and empty.

Our runtime implements exactly this:

- **Unbounded (capacity 0):** `send` always resolves immediately — buffer or
  hand-to-waiter. `recv` blocks (Promise pending) when the buffer is empty and
  the channel is open; resolves with `undefined` (the `None` shape) when the
  channel is closed and the buffer has drained.
- **Bounded (capacity > 0):** `send` blocks when the buffer is full; the
  pending sender is woken when a `recv` frees a slot. `recv` is the same as
  for unbounded.
- **Hand-to-waiter:** if a `recv` is waiting when a `send` arrives, the value
  goes directly to the recv (no buffer push), which is the CSP-style
  rendezvous handshake that unbounded channels in Go/Rust use.

### 4.2 Select semantics

RFC-001:

> `select(ops)` returns a `Future<SelectResult>` that resolves with the first
> operation that completes. `SelectResult` has `index: int` (which op) and
> `value: any` (the value, for `recv`). With a timeout, `index == -1` means
> timeout.

Our `select` races all the ops' underlying Promises via a single shared
`finish()` closure that's idempotent (`settled` flag) — the first op to
resolve wins, subsequent ops' results are dropped. With `timeoutMs`, a
`setTimeout` calls `finish(-1)` after the delay.

**Limitation:** the losing ops' channel waiters are not removed from the
channel's `recvers`/`senders` queues — we can't cancel a pending
`Promise.resolve` in JS. The waiter stays in the queue until either a future
`send`/`recv` resolves it (the result is dropped because `finish()` already
settled) or the channel is closed (the recv resolves with `undefined`,
dropped). The v2 bytecode VM will support true op cancellation via a
`CancellationToken` passed to each op (RFC-001 § "Open questions (1.
Cancellation)").

### 4.3 Cancellation

RFC-001 § "Open questions (1. Cancellation)":

> Should `JoinHandle` support cancellation? ... the planned API is
> `handle.cancel()` plus a `CancellationToken` passed to the spawned future.

Our `cancel(id)` implements the first half — it marks the task handle so
future `awaitAsync`/`join`/`race` calls on that id reject with
`task cancelled`. The task's underlying Promise still resolves (or rejects)
on its own — we don't kill the microtask; the spawned closure has to observe
the cancellation flag via its own polling. The `CancellationToken` parameter
to the spawned closure is a v2 follow-up; for v1 host-only use, the closure
can check `runtime.getTask(id)?.cancelled` if it wants cooperative
cancellation.

We deliberately don't reject the underlying Promise on cancel — that would
create an unhandled rejection if the closure has already resolved by the time
`cancel(id)` runs. The cancellation is purely a flag for future
`awaitAsync`/`join`/`race` callers.

## 5. The v2 plan for suspend/resume via VM bytecode

The v2 bytecode VM (RFC-002) is the runtime that will eventually support
true suspend/resume. The design, summarized from RFC-001 § "Runtime: executor
and suspend/resume":

1. The frame is captured (registers, operand stack, instruction pointer).
2. A continuation is registered with the awaited future, to be called when it
   resolves.
3. The frame is suspended — control returns to the executor.
4. When the future resolves, the continuation is called with the resolved
   value, the frame is restored, and execution resumes from after the `await`.

The bytecode VM has explicit `ip`, `regs`, and `operand stack` (per
`aether/vm/interpreter/vm.ts`), so capturing/restoring a frame is just
snapshotting those arrays. The tree-walker doesn't have this — its "frame" is
the JS call stack, which can't be snapshotted. That's why this runtime is
host-only for v1.

The executor is a single-threaded work queue. It runs ready tasks in FIFO
order, suspending each as it awaits. There's no preemption — a task runs
until it awaits or finishes. This is cooperative multitasking, like Python's
`asyncio` or Rust's `tokio` (current-thread runtime).

When the v2 bytecode VM's suspend/resume lands, the language keywords
`async fn`, `await`, `spawn`, `channel`, `select` will compile to:

| Keyword           | Bytecode VM instruction                         |
|-------------------|-------------------------------------------------|
| `async fn f`      | (desugar) `fn f` returning a `Future<T>` handle  |
| `await e`         | `Suspend e → reg`, register continuation        |
| `spawn e`         | `SpawnTask e → reg`, schedule on the work queue |
| `channel(cap?)`   | `MakeChannel cap → reg`                         |
| `ch.send(v)`      | `Send ch, v → reg` (suspends if buffer full)     |
| `ch.recv()`       | `Recv ch → reg` (suspends if buffer empty)      |
| `ch.close()`      | `Close ch`                                      |
| `select(ops, ms)` | `Select opsTable, ms → reg`                     |
| `handle.cancel()` | `Cancel handle`                                 |

Each `Suspend`/`Send`/`Recv`/`Select` instruction captures the current frame
into a JS object and yields control back to the executor's work queue. The
executor stores the continuation along with the channel/future it's waiting
on; when that channel/future resolves, the executor re-enqueues the
continuation. This is exactly how `tokio::spawn` + `tokio::sync::mpsc` work
in Rust, and how `asyncio.create_task` + `asyncio.Queue` work in Python.

The host runtime in this file is the **prototype** of that executor — same
shape, same API, same semantics — but implemented over JS Promises instead of
bytecode VM frames. The v2 work is to replace the JS Promise layer with the
bytecode VM's own suspend/resume.

## 6. Error handling

- A spawned closure that throws → task state becomes `"error"`,
  `task.error` becomes the error message, `awaitAsync` rejects with the same
  error.
- `send` on a closed channel rejects with `send on closed channel`.
- `recv` on a closed empty channel resolves with `undefined` (the RFC `None`
  shape), not a rejection — distinguishing "no more values" from "error."
- `awaitAsync`/`join`/`race` on an unknown task id rejects with
  `unknown task id N`.
- `awaitAsync`/`join`/`race` on a cancelled task id rejects with
  `task cancelled`.

## 7. Usage from host TypeScript

```ts
import { AsyncRuntime } from "aether/vm/async/async";

const rt = new AsyncRuntime();

// Spawn two tasks that communicate over a channel.
const ch = rt.channel();
const producer = rt.spawn(async () => {
  for (let i = 0; i < 5; i++) await rt.send(ch, i);
  rt.close(ch);
});
const consumer = rt.spawn(async () => {
  let sum = 0;
  while (true) {
    const v = await rt.recv(ch);
    if (v === undefined) break;
    sum += v as number;
  }
  return sum;  // 0+1+2+3+4 = 10
});

await rt.awaitAsync(producer.id);   // producer finishes
const total = await rt.awaitAsync(consumer.id);
console.log(total);  // 10
```

```ts
// select with timeout
const ch1 = rt.channel();
const ch2 = rt.channel();
const sel = await rt.select([
  { ch: ch1, op: "recv" },
  { ch: ch2, op: "recv" },
], 1000);
if (sel.index === -1) console.log("timeout");
else console.log(`got ${sel.value} from channel ${sel.index}`);
```

```ts
// join + race + cancel
const t1 = rt.spawn(() => 1);
const t2 = rt.spawn(() => 2);
const t3 = rt.spawn(() => 3);
const all = await rt.join([t1.id, t2.id, t3.id]);  // [1, 2, 3]

const slow = rt.timeout(1000);
const fast = rt.spawn(() => "fast");
const first = await rt.race([slow.id, fast.id]);  // "fast"

rt.cancel(slow.id);
await expect(rt.awaitAsync(slow.id)).rejects.toThrow(/cancelled/);
```

## 8. registerAsyncBuiltins

The `registerAsyncBuiltins(reg)` helper registers all the async primitives
into a host-side sink (same shape as the eval `RunOptions.builtins` map or
the stdlib `register` callback). The names are prefixed with `async_` so
they don't collide with the v1 sync builtins (`channel`, `send`, etc. —
which throw under v1 because the sync evaluator can't await them).

```ts
import { registerAsyncBuiltins } from "aether/vm/async/async";

const builtins: Record<string, (...args: any[]) => any> = {};
registerAsyncBuiltins((name, fn) => { builtins[name] = fn; });

const id: number = builtins["async_spawn"](() => 42);
const v = await builtins["async_await"](id);  // 42
```

The `async_runtime` builtin exposes the underlying `AsyncRuntime` instance
so callers can call the typed methods (`getTask`, `allTasks`, etc.).

## 9. Testing

`async.test.ts` has 44 tests covering:

- `spawn` + `awaitAsync`: sync fn, async fn, double-await idempotence,
  unknown id, error state, `getTask`, `allTasks`, monotonic ids.
- Channels: unbuffered handshake, buffered (default), FIFO order,
  hand-to-waiter rendezvous.
- Bounded capacity: capacity 2 holds 2 + blocks 3rd, blocked sender wakes on
  recv, capacity 0 unbounded.
- Close: send after close rejects, recv after close = `undefined`,
  drain-then-undefined, releases recv waiters, rejects send waiters,
  idempotent close.
- Select: first recv wins, send op wins, timeout returns -1, race.
- Timeout: resolves after ms, value is `null`, defer.
- Join: in-order, order preserved, rejects on first error, unknown id,
  cancelled id.
- Race: first wins, unknown id, loser continues.
- Cancel: marks flag, awaitAsync rejects, no-op unknown, post-finish cancel.
- Telemetry: `taskCount`, `channelCount`.
- `registerAsyncBuiltins`: registers names, end-to-end works.

Run with:

```
bunx vitest run aether/vm/async
```

## 10. Why not generators

A natural alternative is to use JS generators as the suspend primitive:
`async fn` compiles to `function*`, `await` compiles to `yield`, and the
executor drives each generator with `.next()` / `.next(resolvedValue)`. This
is how `co`, `babel-runner`, and many test harnesses work.

We don't take this path for two reasons:

1. **Generators don't preserve stack across yields.** A `yield` returns to
   the caller's `.next()` frame; the generator's local variables are saved
   but the JS call stack is unwound. Calling another generator from inside
   one requires `yield*` or a manual trampoline — neither composes with
   Aether's "function call" semantics cleanly. Aether functions should call
   each other; if both are async, the inner one's suspension has to bubble
   up through every caller's stack. This is the same "function color"
   problem RFC-001 § "Drawbacks" calls out — generators don't solve it.

2. **The v2 bytecode VM doesn't need them.** The VM has its own explicit
   IP/operand-stack; suspending is "save the frame, return to the
   executor" — a plain JS object copy. No generator machinery, no
   trampoline, no function color. The host runtime in this file mirrors
   that design (using Promises as the suspend primitive) so the eventual
   bytecode VM transition is mechanical.

## 11. What's NOT here (and why)

- **No `async fn` syntax in Aether yet.** The lexer/parser don't recognize
  `async` as a keyword. Adding it is a parser change (RFC-001 § "Detailed
  design / `async fn` and `await`") that lands with the bytecode VM
  suspend/resume work.
- **No `await` keyword in Aether yet.** Same reason — it's a parser change
  + a sema check (await is only valid inside `async fn`) + a VM instruction.
- **No structured concurrency (`scope { ... }`).** RFC-001 specifies it; we
  don't implement it yet because the host runtime doesn't have a notion of
  "scope" — it's just a flat task registry. The v2 bytecode VM will own the
  scope construct.
- **No `CancellationToken`.** Mentioned in RFC-001 § "Open questions" as
  planned. The current `cancel(id)` is the half without the token; the
  spawned closure has to poll `runtime.getTask(id).cancelled` itself.
- **No multi-threaded parallelism.** RFC-001 is explicit: Aether v2 stays
  single-threaded per evaluator. `spawn` schedules on the microtask queue,
  not on a new thread. True parallelism needs Web Workers (browser) or
  `worker_threads` (Node) and is a v3+ item.

## 12. Cross-references

- `docs/rfcs/rfc-001-async-await.md` — the design RFC (syntax, type system,
  runtime, executor).
- `docs/rfcs/rfc-002-bytecode-vm.md` — the v2 bytecode VM with suspend/resume.
- `aether/stdlib/async/index.ts` — the v1 stdlib `async` module (host-only,
  throws from sync Aether; this runtime is its real backing).
- `aether/vm/interpreter/vm.ts` — the bytecode VM that will host the native
  v2 `await` instruction.
- `aether/core/eval/eval.ts` — the v1 tree-walker; synchronous, no async.
- `docs/decisions/adr-01-tree-walking-interpreter-for-v1.md` — the v1
  decision (sync runtime; async is v2).
- `docs/tutorials/concurrency.md` — the v1 vs v2 concurrency tutorial.
