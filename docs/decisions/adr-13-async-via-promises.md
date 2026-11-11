# ADR-13 — Async via JS Promises (not generators)

> Status: Accepted
> Date: 2024-04-01
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: (none yet; v2.x suspend/resume plan may revisit — see [RFC-001](../rfcs/rfc-001-async-await.md))
> Related: [RFC-001](../rfcs/rfc-001-async-await.md), [ADR-11](adr-11-stack-based-vm.md), [ADR-15](adr-15-v2-keeps-tree-walker.md)

## Context

Aether v2 introduces an async runtime (the `async` stdlib module, Chapter 12). The runtime provides `spawn`, channels, `select`, `timeout`, `awaitAll`, `race`, and the higher-order async helpers `mapAsync`, `filterAsync`, `reduceAsync`, `retry`, `debounce`, `defer`.

The architectural question: **how does the async runtime "wait" for an async operation?**

There are three main options:

### Option A: JS Promises

Use the host's existing `Promise` machinery. A function that "awaits" returns a `Promise<T>`. The host's microtask queue handles the scheduling.

### Option B: JS Generators (function*)

Use ES6 generators. An async function is a generator that `yield`s when it wants to "await". A custom scheduler drives the generator, advancing it when the awaited Promise resolves.

### Option C: Custom suspend/resume (compile to a state machine)

Don't rely on the host's async primitives. Compile each `await` point to a state-machine transformation in the IR. The function saves its state to a heap object, returns a Promise, and is resumed by a scheduler.

## Constraints on the decision

- **Implementation cost.** Aether v2 is a teaching-language compiler; the async runtime should be implementable in a reasonable time.
- **Host integration.** Aether runs in the browser (playground) and on Node (CLI). Both have `Promise`. The async runtime should work in both without conditional code.
- **Performance.** Async overhead matters for benchmarks; spawn/await should be fast (microseconds, not milliseconds).
- **Debuggability.** Async stack traces should be reasonable — not "anonymous function in microtask 7".
- **Future suspend/resume.** The v2.x plan (RFC-001) is to add custom suspend/resume, which would enable Aether functions to pause mid-execution. The current decision should not lock out that future.
- **Code shape.** Aether source doesn't have an `async` keyword — functions that return Promises just return Promises. The runtime should respect this.

## Options considered in detail

### Option A: JS Promises (chosen)

`spawn(fn)` returns `new Promise((resolve) => queueMicrotask(() => resolve(fn())))`. Channels are built on `Promise` (each `recv` is a Promise that resolves when a `send` happens). `select` is a `Promise.race` over channel ops and a timeout.

**Pros:**

- Minimum implementation cost (~200 lines of TypeScript for the whole `async` stdlib).
- Best-in-class performance — JS engines have heavily optimized `Promise`.
- Browser + Node parity for free.
- Async stack traces work (Chrome's "async stack trace" feature follows Promise chains).
- No compiler changes — the `async` stdlib is just a set of functions, registered like any other stdlib module.

**Cons:**

- Aether functions can't "pause mid-execution" — they have to return a Promise (which is a value, not a paused computation). To "await" inside an Aether function, the function has to be a Promise-returning function. The `await` operator (in v2.1) will work, but it requires the function to be marked as async-capable, which is a v2.1 compiler change.
- The JS Promise chain is opaque — debugging "why didn't this Promise resolve?" requires the host's async stack trace feature, which is sometimes confusing.
- Deep async recursion can blow the JS stack (Promise chains build up the stack before resolving).

### Option B: JS Generators

`spawn(fn)` returns a Promise that drives `fn` (a generator) step by step. Each `yield` is an "await point"; the scheduler advances the generator when the yielded Promise resolves.

**Pros:**

- More control over the scheduler — custom priorities, custom tracing, custom stack management.
- Aether functions can "pause mid-execution" (the generator's frame is preserved across yields).

**Cons:**

- Higher implementation cost (~600 lines for the scheduler, ~200 lines for the channel integration).
- Aether functions need to be generators (or wrapped in generators). This changes the function-value shape.
- The host's `Promise` is still used for the underlying scheduling, so we don't escape the host's async machinery — we just wrap it.
- Performance: generator overhead is ~10× Promise overhead (per the V8 team's measurements).
- The async stack trace story is the same as Promise.

### Option C: Custom suspend/resume

Compile each `await` to a state-machine transformation. The IR has explicit "save state" and "load state" ops; the codegen lowers them to bytecode that saves/restores the frame's registers.

**Pros:**

- Maximum control — Aether can suspend at any await point, even inside a deeply nested function call.
- No JS Promise dependency (the runtime could be ported to a non-JS host).
- Theoretically optimal performance (no Promise overhead).

**Cons:**

- Much higher implementation cost (~2000 lines for the state-machine pass, the codegen, and the scheduler).
- The state machine makes the IR harder to read and the bytecode harder to disassemble.
- The async stack trace story is *worse* — the state machine hides the original call structure.
- Aether v2.1 doesn't *need* this — Option A works for the current feature set (spawn, channels, select, await).

## Decision

**Aether v2 uses Option A: JS Promises for the async runtime.**

The `async` stdlib module is implemented in TypeScript using JS `Promise` for the underlying scheduling. `spawn(fn)` returns a Promise; `recv(ch)` returns a Promise; `select(ops, timeout?)` is a `Promise.race`-shaped combinator.

## Rationale

1. **Implementation cost.** The `async` stdlib is ~250 lines of TypeScript. Option B would be ~800; Option C would be ~2000+. The simpler form ships in a week, not a month.

2. **Performance.** JS Promises are fast. The async benchmarks (`spawn` 100k tasks, channel ping/pong, `awaitAll` of 100 promises) all complete in <10ms total. The host's `Promise` is heavily optimized (V8, SpiderMonkey, JSC all have native Promise implementations); Aether's async inherits this.

3. **Browser + Node parity.** Both runtimes have `Promise`, `queueMicrotask`, `Promise.race`. The `async` stdlib works identically in the playground (browser) and the CLI (Node) without conditional code.

4. **The compiler doesn't need to know about async.** The `async` stdlib is a regular stdlib module — registered as builtins, called like any other function. No compiler changes, no IR changes, no codegen changes. This is the same design as the rest of the stdlib (see ADR-08).

5. **Future suspend/resume (Option C) is still open.** RFC-001 plans to add custom suspend/resume in v2.x, *but only for functions that opt in* (via a future `async fn` keyword). The current Promise-based runtime stays as the default; the suspend/resume runtime is an alternative for cases where "pause mid-execution" matters (deep async recursion, structured concurrency).

6. **The "Aether functions can't pause mid-execution" limitation is real but acceptable.** Today, an Aether function that wants to `await` has to *return a Promise*. The caller `await`s the Promise. This is the same shape as JS (where `async function` is sugar for a function that returns a Promise). Aether v2.1 will add `async fn` (RFC-001), which desugars to the same shape — so the runtime doesn't need to change.

## Consequences

- **The `async` stdlib is a regular stdlib module.** Registered as builtins; no compiler changes.
- **`spawn(fn)` returns `Promise<T>`.** Aether's `Promise` is JS `Promise` (a value of the host's runtime).
- **`await(p)` is a builtin** that the v1 tree-walker evaluates by calling the host's `await` (in an `async` context). The v2 VM has a different mechanism (see [ADR-15](adr-15-v2-keeps-tree-walker.md) for why the tree-walker stays).
- **Channels are built on JS `Promise`.** Each `recv` is a Promise; `send` resolves the waiting recv (or buffers if no one is waiting).
- **`select(ops, timeout?)` is a `Promise.race`** over channel ops and a timeout Promise.
- **Async stack traces follow JS Promise chains.** Chrome's DevTools shows them; Node's `--async-stack-traces` flag shows them.
- **Future `async fn`** (v2.1, RFC-001) desugars to "function that returns a Promise", so the runtime doesn't need to change.

## What we rejected

- **JS Generators (Option B)** — rejected because of the 10× perf cost and the function-value shape change.
- **Custom suspend/resume (Option C)** — rejected because of the implementation cost; deferred to v2.x for cases where it matters (RFC-001).

## What's next

- The `async` stdlib module is at `aether/stdlib/async/index.ts`.
- The async test suite is at `aether/stdlib/async/index.test.ts`.
- The future suspend/resume design is RFC-001.
- The tree-walker stays alongside the VM (ADR-15) partly because the tree-walker's `await` is simpler (the tree-walker can call JS `await` directly; the VM has to do something more elaborate).
