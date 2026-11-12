# Aether v3 coroutine runtime — RFC-001 implementation

> **Status:** v3.0 (TS-side scheduler with JS-generator suspend/resume). The v3.1 milestone will lift suspend/resume into the bytecode VM itself.
> **Spec:** [RFC-001 async/await](../../../docs/rfcs/rfc-001-async-await.md) — "Runtime: executor and suspend/resume"
> **Code:** [`coroutine.ts`](coroutine.ts) (≈ 1120 LOC) · [`coroutine.test.ts`](coroutine.test.ts) (66 tests)

## What this is

The v2 async runtime (`aether/vm/async/async.ts`, 505 LOC) is a thin wrapper over JS `Promise`. Every "await" returns a Promise; the caller (host code) consumes it with `await` in JS. That gives the right *API shape* — spawn, channel, select, join, race, cancel — but the wrong *semantics*: there is no real suspend/resume of an Aether closure mid-execution. The JS call stack can't be paused, so every async operation leaks out as a Promise that Aether's tree-walker can't itself consume.

This directory ships the v3 coroutine runtime. Each Aether coroutine is a real suspendable computation — when it awaits another coroutine, it parks itself on that coroutine's awaiter list and control returns to the scheduler; when the awaited coroutine completes, the scheduler restores the awaiter and resumes it with the resolved value. Channels park a sender when the buffer is full and a receiver when the buffer is empty; `select` waits for the first of N channels to become ready. Structured concurrency (`join`, `race`, `timeout`) and cancellation round out the API.

The runtime is **synchronous** from the Aether caller's perspective — `await`/`recv`/`send` return the resolved value inline. Aether programs that use the builtins look like normal synchronous code; the scheduler interleaves the coroutines underneath. This is the same model as Python's `asyncio` (single-threaded, cooperative) and Rust's `tokio` current-thread runtime; the same trade-offs apply (no parallelism, but full concurrency).

## The suspend/resume design

### v3.0: TS-side scheduler with JS generators

Each coroutine wraps a JS `function*` generator. The generator's `yield` is the suspend point. The scheduler drives the generator one step at a time via `iterator.next()`. When the coroutine wants to await another coroutine, it `yield`s a value of the form `{ kind: "await", co: target }`; the scheduler's `handleYield` parks the yielding coroutine on `target.awaiters` and arranges for it to be re-enqueued when `target` completes. Channels and structured concurrency work the same way — each "blocking" operation is a `yield` that hands a typed signal to the scheduler.

This is real suspend/resume in the sense that matters: the coroutine's state (local variables, the point in the body where it suspended) is preserved across the suspension, and the scheduler — not the JS call stack — controls when the coroutine resumes. The coroutine's body code is structured around the suspend points (`yield` expressions), so the *intent* is visible at every suspension.

What it is *not*: the suspension is at the JS-generator level, not the bytecode-VM level. The JS generator's stack frame is a JS object held alive by the iterator; it isn't an Aether VM `Frame` snapshot. That distinction matters for v3.1 (below).

### v3.1: bytecode-level suspend/resume (planned)

The next milestone replaces the JS-generator body with a real VM frame snapshot. RFC-001 § "Runtime: executor and suspend/resume" specifies the design: a new `Await` opcode snapshots the current frame (`{ func, ip, regs, upvalues }`), parks the coroutine on the awaited future's awaiter list, and throws a `SuspendSignal` to unwind the JS call stack back to the scheduler's dispatch loop. When the awaited future resolves, the scheduler restores the snapshot (builds a new `Frame` from the saved `regs` + `ip` + `upvalues`), writes the resolved value into the awaited-result register, and re-enters the dispatch loop at the saved IP.

The data structures in `coroutine.ts` are designed for this transition. `Coroutine.frame` is a `VmFrame | null` whose shape (`func`, `ip`, `registers`, `upvalues`) mirrors what the v3.1 `Await` opcode will write. The scheduler's run queue, awaiter lists, channel waiters, and `suspendReason` discriminator are all reuse-ready — the only change v3.1 makes is how the body is driven (JS generator → VM frame restore). The `spawnFrame(frame)` method already exists as the v3.1 entry point; in v3.0 it wraps the frame in a trivial `spawnFn` for telemetry, but the contract is in place.

## The API surface

```ts
class CoroutineScheduler {
  spawn(body): Coroutine;         // body is a JS generator function
  spawnFn(fn): Coroutine;         // fn is a sync () -> Value
  spawnFrame(frame): Coroutine;   // frame is a VmFrame snapshot (v3.1)

  await(co): Value;                // drive scheduler until co completes; return its value
  yield(value): void;              // from inside a coroutine body (parity with spec)
  resume(co): Value;               // step a suspended coroutine past its yield
  send(target, value): void;       // dispatch: send into a coroutine OR send on a channel
  cancel(co): void;                // mark cancelled; awaiters woken with cancelled state

  run(): Value;                    // drive scheduler until the root coroutine completes
  setRoot(co): Coroutine;          // declare which coroutine is "the root"

  channel(capacity): Channel;      // capacity 0 = unbounded; >0 = bounded (suspends if full)
  recv(ch): Value | undefined;     // host-side recv (drives scheduler if needed)
  select(chs): SelectResult;       // wait for the first ready channel

  join(cos): Value[];              // wait for all
  race(cos): Value;                // wait for the first
  timeout(ms): Coroutine;          // completes after N ms (uses Date.now())

  // Telemetry
  getCoroutine(id): Coroutine | undefined;
  getChannel(id): Channel | undefined;
  allCoroutines(): Coroutine[];
  completionOrder(): number[];
  coroutineCount(): number;
  channelCount(): number;
  startedAt(): number;
}
```

### Dispatching `send`

The spec calls for two `send` operations:
- `send(co: Coroutine, value: Value): void` — send a value into a suspended coroutine (resume with the value, generators-style).
- `send(ch: Channel, v: Value): void` — send a value on a channel (suspends the sender if the buffer is full).

Both are named `send`. The implementation dispatches on the runtime shape of the first argument:
- If it's a `Coroutine` (has `state`/`iterator`/`awaiters` fields), call `sendCoroutine`.
- If it's a `Channel` (has `buf`/`recvWaiters`/`sendWaiters` fields), call `sendChannel`.
- Else throw `send: expected a Coroutine or Channel`.

This is unusual (the host language usually distinguishes overloads by parameter types, not by runtime shape), but it matches the spec's API exactly: there is one `send` builtin and it figures out which operation to perform based on what the caller passes.

### The run queue

The scheduler's run queue is a plain JS array (`runQueue: Coroutine[]`). `stepOnce()` shifts the first ready coroutine, advances its iterator one step via `iterator.next()`, and either:
1. Completes the coroutine (`result.done === true`): set state to `done`, stash `result.value` on `co.value`, wake awaiters.
2. Passes the yielded value to `handleYield()`, which decides whether to park the coroutine (on an awaiter list, channel waiter list, etc.) or re-enqueue it (if the yield resolved immediately, e.g., a channel send when the buffer has room).

`run()` (and the internal `runUntil(target)`) drain the queue until the target coroutine's state becomes `done`/`error`/`cancelled`. If the queue empties without progress — a coroutine is parked on an await that will never resolve — the scheduler throws a deadlock error rather than spinning.

### Channels: buffered, multi-producer, multi-consumer

A channel is a tagged object `{ id, buf, capacity, recvWaiters, sendWaiters, closed }`:
- `capacity = 0` means unbounded (the default). `send` never blocks.
- `capacity > 0` means bounded. `send` parks the sender when `buf.length === capacity`.
- `recvWaiters` is the list of coroutines parked on `recv` while the buffer was empty.
- `sendWaiters` is the list of coroutines parked on `send` while the buffer was full.

The handshake is symmetric:
- `send` first checks for a waiting receiver; if there is one, hands the value directly (the receiver's `recv` completes immediately with the sent value, the sender re-enqueues without parking).
- Else, if the buffer has room, pushes the value and re-enqueues.
- Else (bounded buffer full), parks the sender on `sendWaiters`. The value is stashed on `co.sendValue` so when a future `recv` frees a slot, the scheduler knows what to enqueue.

`recv` is the mirror: take from `buf`, wake a parked sender if there is one (push its `sendValue` into the now-free slot), re-enqueue the receiver with the value. If `buf` is empty and the channel is closed, return `undefined` (the RFC-001 `Option::None` shape). If `buf` is empty and the channel is open, park on `recvWaiters`.

`select(chs)` scans the channels for an immediately-ready one (a buffered value or a parked sender). If none is ready, the host-side `select` throws (it can't park outside a coroutine); from inside a coroutine, the body yields `{ kind: 'channel_select', chs }` and the scheduler parks until any of the channels becomes ready. The first ready channel wins; the result is `{ ch, v }`.

### Structured concurrency

- `join(cos)` waits for all of `cos` to complete, returns their values in order. The first error or cancellation propagates.
- `race(cos)` waits for the first to complete (or error or cancel). The losing coroutines keep running — the caller can `cancel()` them to stop. The scheduler doesn't auto-cancel; this matches the `Promise.race` semantics in JS and the `tokio::select!` semantics in Rust.
- `timeout(ms)` is a coroutine that completes (with `null`, the Aether `unit`) after `ms` milliseconds. v3.0 uses `Date.now()` for wall-clock math and re-enqueues the sleeping coroutine immediately — the `ms` is a hint, not a real timer. v3.1 will integrate with the host's timer (a `setTimeout`-driven wake queue) so the scheduler can actually wait.

### Cancellation

`cancel(co)` is cooperative: it sets `co.cancelled = true` and `co.state = "cancelled"`, removes the coroutine from the run queue, wakes its awaiters with the cancelled state (so they propagate), and detaches it from any channel waiter lists. The coroutine's JS generator is not killed — JS generators can't be killed from outside — but the scheduler will not resume it. If the coroutine is currently mid-step (which can only happen during `stepOnce`, which is synchronous), the cancel takes effect after the step.

This is the RFC-001 § "Open questions (1. Cancellation)" design: the spawned future observes the cancellation flag via its own polling. A spawned closure that loops forever without checking `cancelled` will run to completion; a well-behaved one polls `co.cancelled` (or yields a `{ kind: 'yield', value: ... }` and observes the next `sendValue` to see a cancel signal) and exits.

### Builtins — wiring into the Aether evaluator

`registerCoroutineBuiltins(reg, opts)` registers the coroutine builtins into a host-side sink. The sink shape is `(name, fn) => void`, the same as the evaluator's `RunOptions.builtins` map. The registered builtins:

| Builtin         | Signature (Aether side)                              | What it does                                                                 |
|-----------------|------------------------------------------------------|------------------------------------------------------------------------------|
| `spawn`         | `(fn) -> Coroutine`                                  | Wrap `fn` (an Aether closure) in a coroutine. Returns a handle.              |
| `await`         | `(co) -> Value`                                      | Drive the scheduler until `co` completes. Returns its value.                |
| `yield`         | `(v) -> Value`                                       | No-op from Aether (v3.0); returns `v` so it's harmless to call.             |
| `resume`        | `(co) -> Value`                                      | Step a suspended coroutine past its yield.                                    |
| `send`          | `(co, v) -> ()` or `(ch, v) -> ()`                   | Send into a coroutine or on a channel. Dispatches on the first arg.         |
| `cancel`        | `(co) -> ()`                                         | Mark the coroutine as cancelled.                                             |
| `channel`       | `(cap?) -> Channel`                                  | Create a channel (default capacity 0 = unbounded).                          |
| `send_ch`       | `(ch, v) -> ()`                                      | Send on a channel (explicit channel variant; avoids the dispatch ambiguity).|
| `recv`          | `(ch) -> Value`                                      | Receive a value from a channel. Returns `null` if closed-and-drained.        |
| `select`        | `(chs) -> SelectResult`                              | Wait for the first ready channel.                                            |
| `join`          | `(cos) -> Value[]`                                   | Wait for all coroutines; return their values.                                |
| `race`          | `(cos) -> Value`                                     | Wait for the first coroutine; return its value.                              |
| `timeout`       | `(ms) -> Coroutine`                                  | Spawn a coroutine that completes after `ms` ms.                              |
| `coroutine_count` | `() -> int`                                        | Number of coroutines spawned so far.                                         |
| `channel_count` | `() -> int`                                          | Number of channels created so far.                                          |

Coroutine and channel handles are Aether structs:
```aether
// Coroutine handle:
{ __struct: "Coroutine", fields: { id: int } }
// Channel handle:
{ __struct: "Channel", fields: { id: int } }
// select result:
{ __struct: "SelectResult", fields: { ch: Channel, v: any } }
```

The evaluator's `installInlineBuiltins` (in `eval.ts`) calls `registerCoroutineBuiltins` with `this.callValue` as the `opts.callValue` parameter. This lets `spawn` invoke an Aether closure (which is a tagged `{ __closure, fn, env }` object, not directly callable from JS) through the evaluator's closure-calling path. From host code, `callValue` is omitted and defaults to a direct `fn()` call (works for JS functions only).

A singleton scheduler is created per evaluator instance. Aether programs that use `spawn`/`await`/etc. operate on that single scheduler; multiple `run()` calls on the same evaluator would share state. This is intentional — the spec calls for "a singleton CoroutineScheduler" — and matches the v2 runtime's per-evaluator singleton pattern.

## Mapping to RFC-001

RFC-001 § "Runtime: executor and suspend/resume" specifies the design. This implementation provides:

| RFC-001 element                                    | v3.0 implementation                                                |
|-----------------------------------------------------|---------------------------------------------------------------------|
| Frame capture (registers, operand stack, IP)        | `Coroutine.frame` of type `VmFrame { func, ip, registers, upvalues }` — populated by `spawnFrame`, used for telemetry in v3.0, will be the suspend snapshot in v3.1. |
| Continuation registered with the awaited future     | The awaiter is pushed onto `target.awaiters`; when the target completes, `wakeAwaiters` re-enqueues each awaiter with `target.value` as its `sendValue`. |
| Frame is suspended — control returns to the executor | The coroutine's JS generator yields; `stepOnce` returns; the dispatch loop's `while (queue not empty)` continues with the next ready coroutine. |
| Frame restored; execution resumes after the `await` | The scheduler re-enqueues the awaiter with `sendValue = target.value`; on the next step, `iterator.next(sendValue)` advances past the `yield { kind: 'await', ... }` expression, with the awaited value returned by `yield`. |
| Single-threaded executor, FIFO run queue            | `runQueue: Coroutine[]`, shifted from the front in `stepOnce`.      |
| Cooperative — no preemption                          | A coroutine runs until it yields, returns, or throws. The scheduler never preempts. |
| Channels — unbounded default; bounded via capacity  | `channel(0)` (default) is unbounded; `channel(N > 0)` is bounded.    |
| `select` races a list of channel ops                | `select(chs)` scans for an immediately-ready channel; from inside a coroutine, `yield { kind: 'channel_select', chs }` parks on all of them and resumes when any becomes ready. |
| Structured concurrency (`scope { ... }`)            | Not yet implemented at the language level; `join`/`race`/`timeout` are the package-level equivalents. The language `scope` is a v3.1 item that builds on these primitives. |
| Cancellation                                        | `cancel(co)` is cooperative; the coroutine observes `co.cancelled` and exits gracefully. |

The v3.0 implementation faithfully maps every RFC-001 runtime element. The single deviation is the suspend mechanism: JS generators (v3.0) vs. bytecode-level frame snapshots (v3.1). The v3.0 surface is identical from the Aether caller's perspective; the v3.1 swap is an internal implementation change.

## How the suspend/resume works (a worked example)

Consider this Aether program:
```aether
fn producer() -> int { 42 }
fn main() -> () {
  let co = spawn(producer);
  let v = await(co);
  print(v);
}
```

When `main` runs:
1. `spawn(producer)` is called. The builtin wraps the `producer` closure in a coroutine via `sched.spawnFn(() => callValue(producer, []))`. A `Coroutine` object is created with `state: "pending"`, `iterator: <generator>`, and pushed to `runQueue`. The builtin returns a `{ __struct: "Coroutine", fields: { id } }` handle.
2. `await(co)` is called. The builtin resolves the handle, gets the `Coroutine`, and calls `sched.await(co)`.
3. `sched.await(co)` calls `runUntil(co)`. The while loop:
   - Iteration 1: `co.state === "pending"`. `stepOnce()` dequeues `co`, sets `state = "running"`, calls `co.iterator.next(undefined)`.
   - The generator runs `callValue(producer, [])`. This calls `producer()` through the evaluator, which returns 42.
   - The generator does `return 42`. `iterator.next()` returns `{ done: true, value: 42 }`.
   - `stepOnce` sets `co.state = "done"`, `co.value = 42`. `wakeAwaiters(co)` is called (no awaiters).
   - Back in the while loop: `co.state === "done"` → exit.
4. `await` returns `co.value` (42). The builtin returns it to Aether.
5. `print(42)` is called. Output: `"42"`.

The whole thing happens synchronously: the JS call stack that started at `main` returns to Aether after the `await` call, with 42 as the value. From Aether's perspective, `await(co)` is just a function call that returned 42.

Now consider a more interesting example with channels:
```aether
// In a coroutine body:
let ch = channel(1);
spawn(fn() -> () {
  // producer
  send_ch(ch, 1);
  send_ch(ch, 2);
});
let a = recv(ch);  // 1
let b = recv(ch);  // 2
print(a + b);
```

The producer coroutine is spawned. When it tries to `send_ch(ch, 2)` and the buffer is full (capacity 1, already has 1), the channel-send operation parks the producer on `ch.sendWaiters`. The scheduler returns to the awaiter (the main coroutine that's currently calling `recv(ch)`); the receiver takes the buffered value, which frees a slot, which wakes the producer; the producer's `send_ch(ch, 2)` completes and the value lands in the buffer. The next `recv(ch)` returns 2.

The interesting bit is that all this happens in the JS generator stack: the producer's `send_ch(ch, 2)` is a `yield { kind: 'channel_send', ch, value: 2 }`, which suspends the producer's generator. The scheduler returns to the consumer, which had `yield { kind: 'channel_recv', ch }`; the consumer's `recv(ch)` resolves with the buffered value, and the consumer's generator is re-enqueued and advanced. The producer is woken later when a slot frees. From JS's perspective, no Promise is involved — it's all synchronous generator stepping.

## Testing

The test file (`coroutine.test.ts`) has 66 tests across 9 describe blocks:

- `spawn + await` (12 tests): basic spawn/await, error propagation, idempotency, monotonic ids, parent tracking, telemetry.
- `yield + resume` (7 tests): generators-style yield + resume, send value into yield, error on resume of non-yield-suspended coroutine, infinite-yield loop.
- `channel` (11 tests): buffered send/recv, unbounded channel, ids, deadlock detection, blocking send and recv, producer/consumer exchange with bounded and unbounded channels.
- `select` (5 tests): first ready channel wins, second-channel ready case, no-channel-ready case, parked-sender unblocking, three-channel case.
- `join` (5 tests): all values, completion order independence, error propagation, empty list, coroutines with intermediate yields.
- `race` (4 tests): first wins, first-by-completion-order, deadlock detection, empty list.
- `timeout` (4 tests): basic spawn, awaitable in another coroutine, race against a slow coroutine, telemetry.
- `cancel` (7 tests): mark cancelled, await throws, queue removal, awaiter cancellation, no-op on done, scheduler skipping, channel waiter detachment.
- `End-to-end Aether programs` (11 tests): spawn + await via the evaluator, channel round-trip, join, race, timeout, cancel, telemetry, multi-step pipeline, idempotent await.

The end-to-end tests use `compile()` (the public Aether pipeline) to lex/parse/check/run an Aether program with the coroutine builtins auto-registered in the evaluator. Each test asserts the program's output and absence of errors.

## File layout

```
aether/vm/coroutine/
  coroutine.ts        — the runtime (≈ 1120 LOC)
  coroutine.test.ts   — 66 tests
  README.md           — this document
```

## Future work — v3.1 and beyond

### Bytecode-level suspend/resume (v3.1)

The big change is moving the suspend mechanism from the JS generator to the VM frame. Steps:
1. Add an `Await` opcode to `aether/vm/bytecode/bytecode.ts`. Operands: `a = result reg`, `b = future reg`.
2. In the codegen (`aether/vm/codegen/codegen.ts`), emit `Await` for `await expr` expressions in async functions. The codegen already has the IR node for `await`; it just needs an opcode mapping.
3. In the VM (`aether/vm/interpreter/vm.ts`), handle `Op.Await`:
   - Snapshot the current frame into a `VmFrame`.
   - Park the coroutine on the awaited future's awaiter list.
   - Throw a `SuspendSignal` (new) that unwinds the JS call stack back to the scheduler.
4. In the scheduler, when an awaited future resolves, restore the snapshot: build a new `Frame` from the saved `VmFrame`, write the resolved value into the `result reg`, and re-enter the dispatch loop at the saved IP.

The `Coroutine.frame` field, the `VmFrame` interface, and the `spawnFrame(frame)` method are all in place for this. The `Iterator<Yielded, Value, Value>` type will be replaced by a "frame restorer" that knows how to resume the VM at the saved IP — basically a closure that captures the snapshot and re-enters `execFrame`.

### Real timers (v3.1)

`timeout(ms)` and `sleep(ms)` need to actually wait. v3.0 re-enqueues the sleeping coroutine immediately (the `ms` is a hint). v3.1 will integrate with a `setTimeout`-driven wake queue: a min-heap of `(wakeAt, coroutine)` pairs. The scheduler's `run()` loop checks the heap on each iteration and re-enqueues any whose `wakeAt` has passed. For tests that don't want to actually wait, a virtual clock (a manual `advance(ms)` method) will be provided.

### Language-level `scope { ... }` (v3.1)

RFC-001 specifies a `scope` block that auto-awaits all spawned tasks at scope exit. This is built on `join` (the v3.0 primitive). The v3.1 work:
1. Parser: `scope { ... }` is a new statement.
2. Sema: a `scope` block tracks the coroutines spawned inside it.
3. Codegen: at scope exit, emit an implicit `join` of the tracked coroutines.

### `async fn` syntax (v3.1)

The `async` keyword on a function declaration marks it as a coroutine; calling it returns a `Future<T>` (which is just a `Coroutine` handle in v3.0). The `await` keyword inside an `async fn` is the suspend point. v3.0 has this implicitly via the builtins (`spawn`/`await`); v3.1 adds the explicit syntax and the type-system support (`Future<T>`, `Channel<T>`, `JoinHandle<T>`).

## References

- [RFC-001 async/await](../../../docs/rfcs/rfc-001-async-await.md) — the spec this implements.
- [RFC-002 bytecode VM](../../../docs/rfcs/rfc-002-bytecode-vm.md) — the VM that v3.1 will extend with `Await`.
- [ADR-13 async via Promises](../../../docs/decisions/adr-13-async-via-promises.md) — the v2 design that this replaces.
- [`aether/vm/async/async.ts`](../async/async.ts) — the v2 runtime (Promise-based; kept for backward compat).
- [`aether/core/eval/eval.ts`](../../core/eval/eval.ts) — the evaluator that auto-registers the coroutine builtins.

## License

MIT — same as the Aether language.
