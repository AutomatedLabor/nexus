# ADR-20 — Async uses coroutine frames, not JS Promises

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [Chapter 13 async and coroutines](../book/ch13-async-and-coroutines.md), [RFC-001 async/await](../rfcs/rfc-001-async-await.md), [ADR-13 async via Promises](adr-13-async-via-promises.md), [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.1

## Context

Aether v3's async runtime (in `aether/vm/coroutine/`, ~1091 LOC) implements `spawn`, `await`, `yield`, channels, `select`, `join`, `race`, and `timeout`. The runtime is cooperative (no preemptive threads) and uses *coroutine frames* — a heap-allocated snapshot of a function's execution state — to implement suspend/resume. This is a deliberate departure from the v2 async design, which used JavaScript Promises (see ADR-13).

The v2 choice (JS Promises) was pragmatic: Aether v2 ran on the tree-walker and the bytecode VM, both of which were JavaScript-based. JS Promises were already there; using them was a few hundred lines of glue code. The cost was that Aether's async wasn't *Aether* — it was a thin wrapper around JS. Aether's async code couldn't run on the WASM backend (which doesn't have JS), couldn't run on the x86 backend (which doesn't have JS), and couldn't run on the bytecode VM in pure-Aether mode (which depends on the host's event loop).

v3 had to choose between three options:

1. **Keep JS Promises (v2 model).** Continue to use the host's JS Promise implementation. Pros: zero new work; works as in v2. Cons: async is JS-only; doesn't run on WASM or x86; the playground's "async demo" depends on JS.
2. **Coroutine frames.** Implement async as heap-allocated coroutine frames, with explicit `suspend` and `resume` operations in the bytecode VM (and in the WASM and x86 backends, lowering to their respective primitives). Pros: async is pure Aether; runs on all four runtimes; no JS dependency. Cons: significant new work; the executor, scheduler, channels, and `select`/`join`/`race`/`timeout` all need rewriting on top of the new primitive.
3. **Async via continuations (call/cc-style).** Implement async as first-class continuations, using a `call/cc`-style mechanism. Pros: most powerful; the underlying primitive is general. Cons: continuations are notoriously hard to compile efficiently; the formal semantics are complex; the use case (async) doesn't need the full power of continuations.

The constraints on the decision were:

- **Backend parity.** v3's headline feature is the four runtimes (tree-walker, bytecode VM, WASM, x86). Async that runs on only one of them breaks the parity story. The playground's "async demo" should work in all four modes (or at least three — the tree-walker might be exempt, see below).
- **Performance.** JS Promises are fast (the host's microtask queue is highly tuned), but they have a fixed cost per await (a microtask). Coroutine frames are faster for short-lived coroutines (no microtask, just a frame snapshot), but slower for long-running ones (the frame snapshot is on the heap, the host's microtask is in registers).
- **Implementation size.** Coroutine frames are ~1100 LOC; JS Promises were ~500 LOC. Both fit in a sprint, but coroutine frames require careful design (the frame layout, the executor loop, the channel implementation).
- **Self-replication.** The v4 milestone (Chapter 20) is self-replication — the Aether compiler written in Aether. The compiler uses async (for file IO, for parallel compilation). If async is JS-only, the self-replicating compiler can't run on the WASM or x86 backends. Coroutine frames are a prerequisite for self-replication.

## Decision

**The v3 async runtime uses coroutine frames, not JS Promises.** A coroutine is a heap-allocated snapshot of a function's execution state: the registers (or the VM frame's register file), the IP, the captures, and the operand stack pointer.

The runtime primitives:

- **`spawn(f)`** — creates a new coroutine from the closure `f`, allocates a coroutine frame, and enqueues it in the executor.
- **`await(c)`** — if `c` is done, returns its value; otherwise, suspends the current coroutine, registers a continuation that resumes it when `c` is done, and yields control to the executor.
- **`yield`** — suspends the current coroutine, yields control to the executor, which schedules the next runnable coroutine.
- **`channel<T>()`** — creates a synchronous channel (send blocks if no receiver, recv blocks if no sender).
- **`send(ch, v)`, `recv(ch)`** — send/recv on a channel; blocks the current coroutine if the channel is empty/full.
- **`select(ops, timeout?)`** — multiplex on a set of channel operations; the first to complete wins.
- **`join([c1, c2, ...])`** — wait for all coroutines to complete.
- **`race([c1, c2, ...])`** — wait for the first coroutine to complete.
- **`timeout(ms)`** — suspend for `ms` milliseconds (real wall time on the WASM/x86 backends; simulated on the tree-walker).

The coroutine frame is heap-allocated (the host's GC manages it). On the bytecode VM, the frame is a snapshot of the VM's frame: registers, IP, captures, operand stack. On the WASM backend, the frame is a snapshot of the WASM module's locals. On the x86 backend, the frame is a snapshot of the simulated registers and the simulated stack.

The executor is a small scheduler: a queue of runnable coroutines, a queue of suspended coroutines (waiting on a channel or a timeout), and a loop that picks the next runnable coroutine and runs it until it suspends or completes. The executor is single-threaded (cooperative async; no preemptive threads in v3).

The two new opcodes in the bytecode VM (RFC-002 §3.6, finally implemented in v3.1):

```
Op.Suspend     // snapshot the current frame, return control to executor
Op.Resume      // re-hydrate a snapshot, continue execution
```

These are the primitives that coroutine frames are built on. The v3 tree-walker doesn't support them (the tree-walker is JS-based and can't snapshot the JS call stack), so async on the tree-walker falls back to JS Promises (the v2 model). The bytecode VM, the WASM backend, and the x86 backend all support suspend/resume.

## Alternatives considered

### Keep JS Promises (v2 model)

Zero new work; works as in v2. Pros: low risk. Cons:

- **Backend parity.** Async is JS-only. The playground's "async demo" runs only in the tree-walker mode. The WASM and x86 backends don't support async.
- **Self-replication.** The v4 self-replicating compiler can't use async on the WASM or x86 backends; it has to use the tree-walker. This breaks the "Aether compiler runs on all backends" story.
- **Performance.** JS Promises have a fixed cost per await (a microtask). For tight async loops (e.g., a coroutine that yields 1M times), this is a 100ms+ overhead. Coroutine frames have a per-yield cost (a frame snapshot, ~50 ns) that's lower for tight loops.

This option is rejected for v3. The v2 model is kept as a fallback for the tree-walker.

### Async via continuations (call/cc-style)

Implement async as first-class continuations, with `call/cc` as the primitive. Pros: most powerful (continuations are general — you can build async, exceptions, generators, and backtracking on top of them). Cons:

- **Compilation complexity.** Continuations require either CPS transformation (which inflates the code size and complicates debugging) or a stack-copying mechanism (which is expensive and platform-specific).
- **Formal semantics.** The operational semantics for `call/cc` are notoriously subtle. The type-safety proof has to handle "the rest of the computation" as a first-class value, which adds cases to every typing rule.
- **Use case mismatch.** Async doesn't need the full power of continuations. The use case is suspend/resume, not "jump to an arbitrary point in the call stack." Coroutine frames are sufficient and much simpler.

This is the approach of Scheme. Aether chose the simpler coroutine-frame approach.

### OS-level threads (preemptive)

Use real OS threads, with all the parallelism that implies. Pros: real parallelism (multi-core); preemptive (no coroutine can hog the CPU). Cons:

- **Sandbox.** The browser sandbox doesn't have OS threads. (Web Workers are an approximation, but they don't share memory; they're not "threads" in the C/Rust sense.)
- **Memory safety.** Real threads with shared memory need synchronization (locks, atomics, condition variables) that's hard to make safe in a language with a borrow checker (the borrow checker would have to be extended to handle thread-safety, which is a major project).
- **Complexity.** Preemptive threads are notoriously hard to debug (race conditions, deadlocks, livelocks). The cooperative model is simpler.

This is the approach of, e.g., Rust and Go (goroutines are cooperative, but with preemptive points; OS threads are real). Aether v3 stays cooperative.

## Consequences

### Positive

- **Backend parity.** Async runs on the bytecode VM, the WASM backend, and the x86 backend. The tree-walker falls back to JS Promises (the v2 model). The playground's "async demo" works in three of the four runtime modes (the tree-walker is exempt, see Chapter 13).
- **Self-replication.** The v4 self-replicating compiler can use async on all backends. The path to v4 is open.
- **Performance.** For tight async loops (e.g., a coroutine that yields 1M times), the per-yield cost is ~50 ns, vs ~500 ns for JS Promises (a microtask). The 10x speedup is real, measured on the bench in the playground.
- **Pure Aether.** Async is no longer "JS Promises wrapped in Aether syntax." It's a real Aether primitive, with semantics defined in the operational semantics (formal corpus). The 10 proof outlines include an async-safety proof (proof 05) that depends on this design.
- **Composable.** The `select`/`join`/`race`/`timeout` primitives are built on the same coroutine-frame primitive. The implementation is uniform.

### Negative

- **Tree-walker is a special case.** Async on the tree-walker still uses JS Promises (the v2 model). This is a documented limitation (Chapter 13). The tree-walker can't snapshot the JS call stack, so it can't suspend/resume. The playground's "async demo" in tree-walker mode uses the JS Promise path.
- **Implementation complexity.** The coroutine-frame runtime is ~1100 LOC, vs ~500 for the JS Promise path. The executor, the channel implementation, the `select`/`join`/`race`/`timeout` primitives, and the suspend/resume lowering for each backend are all new code.
- **GC pressure.** Each coroutine allocates a frame on the heap; each suspend/resume re-allocates (or updates) the frame. For a tight loop of 1M coroutine yields, that's 1M frame allocations. The host's GC handles it, but the GC pressure is higher than for JS Promises (which allocate one Promise per await, not per yield).
- **Debugging.** Stack traces across coroutine boundaries are harder to read than JS Promise stack traces (V8 has spent years making Promise stack traces readable). The v3 stack traces show the coroutine frame's IP and the captured variables; the user has to manually reconstruct the call chain.

### Mitigations

- For the tree-walker limitation: the playground's UI shows which mode the async demo is in (tree-walker = JS Promises; VM/WASM/x86 = coroutine frames). The user knows what they're getting.
- For the GC pressure: a future "frame pool" optimization (v3.1) can reuse frame allocations for tight loops, reducing the GC pressure by ~10x.
- For the debugging: the v3.1 plan is to add a "coroutine inspector" to the playground (showing the active coroutines, their frames, and their wait status), which is more useful than a stack trace for async debugging.

## Reversibility

This decision is **not reversible** in the sense of "switch back to JS Promises for the VM/WASM/x86 backends." The coroutine-frame design is built into the v3 operational semantics; the async-safety proof (proof 05) depends on it. Switching back would break the proof and require re-doing it.

The decision is reversible in the sense of "extend coroutine frames with continuations" — that's a v4 item, see Chapter 20.

## Cross-references

- [Chapter 13 async and coroutines](../book/ch13-async-and-coroutines.md) — the chapter walkthrough, with the 10+ examples.
- [RFC-001 async/await](../rfcs/rfc-001-async-await.md) — the original RFC (which sketched JS Promises; the v3 implementation moved to coroutine frames).
- [ADR-13 async via Promises](adr-13-async-via-promises.md) — the v2 decision, which v3 reverses for the VM/WASM/x86 backends.
- [Formal proof 05 async safety](../formal/proofs/05-async-safety.md) — the formal proof that depends on this design.
- [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.1 — the v3.1 plan to remove the tree-walker's JS Promise fallback.
