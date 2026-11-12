# 05. Async Safety Proof Outline

## Theorem statement

**Theorem (Async Safety).**  For a well-typed Aether async program:

1. **Resumption type preservation.**  Each `await fut` either
   resumes with `v : T` (where `fut : Future<T>`) or returns a panic
   to the enclosing function.
2. **Local state preservation.**  The coroutine's local state is
   preserved across suspensions.
3. **No data races.**  Only one coroutine runs at a time (no
   parallel execution in v1; cooperative scheduling).
4. **No borrow violation through suspend.**  (v2) No `&mut` borrow
   is held across an `await` point.

## Background: the async runtime

Aether's async runtime (in `aether/vm/async/async.ts`) is a state
machine over coroutines.  Each coroutine is in one of four states:
`Ready`, `Running`, `Suspended(κ)`, `Done(v)`, `Panicked(p)`.  A
continuation `κ` is a reified stack frame: `(e, ρ, κ′)` where `e`
is the current expression, `ρ` is the local environment, and `κ′`
is the surrounding continuation.

The runtime maintains a **ready queue** `Q` of coroutines.  The
polling loop dequeues one coroutine at a time, runs it until it
suspends, completes, or panics, then dequeues the next.

## Proof outline

### Step 1: The future type

A `Future<T>` is a value of type `Future<T>` (a built-in generic
type).  At runtime, it's a coroutine state machine.  By the typing
rule `T-Future`, a future's type is `Future<T>` where `T` is the
type of the value the future will eventually produce.

### Step 2: Polling type preservation

`poll(fut) : Future<T> -> Poll<T>` where `Poll<T> = Pending |
Ready(T)`.  The poll function:

- If the coroutine is `Running` or `Suspended`, returns `Pending`.
- If the coroutine is `Done(v)`, returns `Ready(v)`.
- If the coroutine is `Panicked(p)`, propagates the panic.

**Lemma (Poll-Type-Preservation).**  If `fut : Future<T>` and
`poll(fut) = Ready(v)`, then `v : T`.

Proof: the coroutine's body has return type `T` (by `T-Future`'s
hypothesis).  By the type-safety of the body (Progress +
Preservation), the body either evaluates to a value `v : T`, panics,
or diverges.  In the first case, the coroutine transitions to
`Done(v)`, and `poll` returns `Ready(v)`.  So `v : T`.  ✓.

### Step 3: Await type preservation

`await fut` for `fut : Future<T>` yields `T`.  Steps:

- If `poll(fut) = Pending`: by `E-Await-Pending`, `await fut`
  yields `Pending`.  The coroutine suspends; the await will be
  re-evaluated later.  ✓.
- If `poll(fut) = Ready(v)`: by `E-Await-Ready`, `await fut` yields
  `v`.  Since `v : T` (by Poll-Type-Preservation), the result has
  type `T`.  ✓.

**Theorem (Resumption-Type-Preservation).**  At each `await`, the
type is preserved: either the await yields `v : T` (where `fut :
Future<T>`), or the coroutine panics.

Proof: by the cases above.  ✓.

### Step 4: No-concurrency

The runtime's polling loop dequeues one coroutine at a time and
runs it until it suspends, completes, or panics.  So at most one
coroutine is `Running` at a time.

**Theorem (No-Concurrency).**  At most one coroutine is in state
`Running` at any time.

Proof: by the runtime's `R-Start` rule (dequeues one), `R-Step`
rule (continues the running one), and `R-Suspend`/`R-Done`/
`R-Panic` rules (terminates the running one).  ✓.

### Step 5: No-data-races corollary

**Corollary (No-Data-Races).**  No two coroutines simultaneously
access shared mutable state.

Proof: by No-Concurrency, only one coroutine runs at a time.  So
no two coroutines access anything simultaneously.  ✓.

(This is the simplest async-safety argument: with single-threaded
cooperative scheduling, data races are impossible.  v3 with
parallel executors will need `Send`/`Sync` traits to maintain this
guarantee.)

### Step 6: Local state preservation

When a coroutine suspends, its continuation captures the local
environment `ρ` and the current expression `e`.  On resumption, the
runtime restores `ρ` and continues from `e`.  The type of `e` is
preserved (it's the same expression, in the same environment).

**Theorem (Resumption-Preservation).**  If a coroutine's body has
type `T`, then resuming the coroutine after a suspension produces
a value of type `T` (or panics).

Proof: by induction on the number of suspensions.  At each
suspension, the continuation's type is `T` (by IH on the body's
typing).  On resumption, the continuation's type is `T`.  By
type-safety, the resumption yields `v : T` or panics.  ✓.

### Step 7: Borrow-across-await (v2)

In v2, the borrow checker rejects `&mut` borrows held across
`await`.  The static analysis: any `await` point inside a function
discharges all live `&mut` borrows.

**Lemma (No-Mut-Borrow-Across-Await).**  At any `await` point, no
`&mut` borrow is live.

Proof: the borrow checker's analysis treats `await` as a
"discharge point" — all `&mut` borrows are required to have their
last use before the `await`.  If the program would borrow `&mut x`
and then `await` (without using the borrow before), the analysis
rejects it.  ✓.

**Theorem (No-Borrow-Violation-Through-Suspend).**  No `&mut`
borrow is held across a coroutine suspension.

Proof: by No-Mut-Borrow-Across-Await, no `&mut` borrow is live at
the `await` point.  So no `&mut` borrow is held across the
suspension.  ✓.

(The operational reason: while the coroutine is suspended, another
coroutine could observe the borrowed location.  The borrow
checker's static analysis rules this out.)

## Assumptions

1. Single-threaded (no parallel async).  v3 may add parallel
   executors with `Send`/`Sync` traits.
2. No preemption (the coroutine yields only at `await`).  So the
   coroutine's state is consistent at each suspension point.
3. The runtime's continuation capture is correct (no state is
   dropped).  This is a runtime invariant, not a typing invariant.
4. The runtime's resume is correct (no state is corrupted).  Same.
5. The coroutine's body is well-typed (a `T-Future` hypothesis).
6. v2: the borrow checker runs and rejects `&mut` across `await`.

## Key lemmas

1. **Poll-Type-Preservation**: `poll(fut) = Ready(v)` implies `v
   : T` when `fut : Future<T>`.
2. **Resumption-Type-Preservation**: at each `await`, the type is
   preserved.
3. **No-Concurrency**: at most one coroutine runs at a time.
4. **No-Data-Races**: (corollary) no data races.
5. **Resumption-Preservation**: resuming after suspension produces
   a value of type `T` or panics.
6. **No-Mut-Borrow-Across-Await** (v2): no `&mut` borrow is live
   at an `await` point.

## What's mechanized vs hand-waved

- **Mechanized** (in future Coq/Lean work): the polling state
  machine, the no-concurrency invariant (a structural property of
  the runtime's loop), the resumption-type-preservation (an
  induction on suspensions).  Estimated Coq effort: ~6000 lines.
- **Hand-waved**: the runtime's continuation capture/restore
  correctness (depends on the runtime's data structures, which are
  tested but not mechanically verified).  The borrow checker's
  discharge at `await` (assumed sound; see `03-borrow-safety.md`).
  The single-threaded invariant (a runtime property, not a typing
  property).

## Conclusion

Async safety is the guarantee that Aether's async runtime
preserves types across suspensions and doesn't introduce data
races.  The proof reduces to:

1. Poll-Type-Preservation: `poll` returns `Ready(v : T)`.
2. Resumption-Type-Preservation: `await` yields `v : T` or panics.
3. No-Concurrency: only one coroutine runs at a time.
4. No-Data-Races: (corollary) no data races.
5. Resumption-Preservation: resuming after suspension produces `v
   : T` or panics.
6. No-Mut-Borrow-Across-Await (v2): the borrow checker rules out
   `&mut` across `await`.

The proof is paper-style; full mechanization is future work.  The
key lemmas are the polling state machine's invariants and the
type-safety of the coroutine's body.  The mechanization is
straightforward (model the runtime's state machine in Coq, prove
the invariants, derive the theorems).

The v1 limitations (single-threaded, no preemption) are documented;
v3 will address them with parallel executors and `Send`/`Sync`
traits.  The v2 borrow-across-await check is a static-analysis
guarantee that complements the runtime's no-concurrency invariant.
