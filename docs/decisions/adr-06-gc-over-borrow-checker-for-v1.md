# ADR-06 — GC over borrow checker for v1

> Status: Accepted
> Date: 2023-09-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: (none yet; v2 borrow checker RFC is at
> [../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md))

## Context

Aether v1 had to pick a *memory management* strategy: how
does the runtime reclaim memory that is no longer needed?
The options were:

1. **Garbage collection (GC).** Allocate freely; let the
   runtime reclaim unreachable objects periodically. The
   Go, Java, JS, Python, ML approach.
2. **Ownership and borrowing.** Each value has exactly one
   owner; the compiler tracks borrows (`&T`, `&mut T`) and
   rejects programs that violate the borrow discipline. The
   Rust approach.
3. **Reference counting (RC).** Each value has a reference
   count; when the count drops to zero, the value is freed.
   The Swift (ARC) and Objective-C approach.
4. **Manual management.** The programmer allocates and
   frees. The C and C++ approach.

The constraints on the decision were:

- **Implementation size.** A borrow checker is a multi-month
  project; a GC is a single afternoon (because we can lean
  on the host JS runtime's GC). v1 had a weekend.
- **Teaching value.** A borrow checker is hard to teach;
  a GC is easy ("the runtime frees memory when it is no
  longer reachable"). For v1's teaching audience, GC is
  the right choice.
- **Ergonomics.** A borrow checker makes some code patterns
  hard to write (recursive data structures need `Box`,
  self-referential structs need `Pin`, etc.). A GC has no
  such restrictions. For a small teaching language,
  ergonomics matter.
- **Performance.** A GC has runtime overhead (pause times,
  allocation pressure). A borrow checker has zero runtime
  overhead. For v1 (the playground, small programs), the
  GC's overhead is invisible. For v2 (production), the
  borrow checker's zero-overhead promise matters.
- **Forward-compatibility with v2.** Whatever v1 does, v2
  has to be able to add a borrow checker without breaking
  v1 programs.

## Decision

**Aether v1 uses garbage collection.** All heap-allocated
values (strings, arrays, maps, closures, structs, enum
variants) are managed by the host JavaScript runtime's GC.
The Aether evaluator does no manual memory management.

The v1 type system enforces three "safety" properties that
together provide most of what a borrow checker would:

1. **Immutability by default.** `let` bindings cannot be
   reassigned.
2. **No null.** `Option<T>` replaces `null`.
3. **No exceptions.** `Result<T, E>` replaces
   `throw`/`catch`.

What v1 does *not* enforce: borrow discipline (multiple
mutable references are fine), use-after-move (there is no
move), lifetime constraints (there are no lifetimes), and
definite assignment (you can read an uninitialized
variable and get a runtime panic).

## Alternatives considered

### Ownership and borrowing (the v2 plan)

A borrow checker is the right answer for production
performance and safety. It eliminates a class of bugs
(use-after-free, data races) at compile time. The cost is
implementation complexity (months of work), teaching
burden (lifetimes, the borrow rules), and ergonomic
friction (some patterns are awkward).

For v1, the implementation cost was prohibitive. For v2,
the plan is to add it as an opt-in mode; see
[../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md).
The v1 GC remains for code that does not need the borrow
checker.

### Reference counting

RC has some of the GC's simplicity without pause times, but
it has its own problems: cycle handling (you need a cycle
collector anyway), the overhead of reference count updates
(per assignment), and the unpredictability of when
destructors run. For v1, leaning on the host JS GC is
strictly simpler than implementing RC.

### Manual management

Manual management (malloc/free) is wrong for a high-level
language. It puts the burden on the programmer, it is
unsafe (use-after-free, double-free, leaks), and it is
hostile to teaching. Aether v1 explicitly rules this out.

## Consequences

### Positive

- **Smallest possible v1.** The GC is the host's; we do
  not have to implement anything. The evaluator creates
  JavaScript objects and lets the host GC reclaim them.
- **No borrow checker errors.** v1 programs never fail
  to compile because of borrow rules. The user does not
  have to learn lifetimes, the `&`/`&mut` distinction,
  or the move semantics.
- **Recursive data structures are trivial.** `enum List<T>
  { Empty, Cons(T, List<T>) }` just works, no `Box`
  needed. The GC handles the indirection.
- **Closures are easy.** A closure captures its
  environment by reference; the GC keeps the captured
  variables alive as long as the closure is. No
  `move` keyword, no capture modes to think about.
- **Forward-compatible with v2.** The v2 borrow checker
  will be opt-in. v1 programs that use the GC will
  continue to work; v2 programs that opt into the borrow
  checker get the additional safety guarantees.

### Negative

- **GC pauses.** The host JS runtime's GC has pauses,
  typically sub-millisecond for the young generation but
  longer for old generations. For the playground this is
  invisible; for production it would matter.
- **Allocation pressure.** Each Aether value is a JS
  object, which has overhead (header, alignment). A
  program that creates millions of small objects will
  pressure the GC.
- **No `Drop`.** There is no destructor; you cannot run
  code when a value is freed. The v2 plan adds `defer` for
  resource cleanup (closing files, releasing locks); see
  [../spec/07-functions-closures-async.md](../spec/07-functions-closures-async.md).
- **No memory safety guarantees in the Rust sense.**
  Multiple mutable references are fine; you can have
  data races (in v2's async runtime). The v1 type
  checker does not catch these. The convention is to use
  `let mut` only when needed; the v2 borrow checker will
  enforce the discipline.
- **No control over memory layout.** The host JS engine
  decides the layout. This is fine for v1; v2 may want
  to control layout for FFI.

## Mitigations

- The [../tutorials/ownership.md](../tutorials/ownership.md)
  tutorial is explicit about what v1 has (GC, immutability
  by default, no null, no exceptions) and what it does not
  (no borrow checker, no lifetimes, no `Drop`).
- The [../guides/idiomatic-aether.md](../guides/idiomatic-aether.md)
  guide encourages `let mut` only when needed, which gives
  some of the borrow checker's discipline in v1.
- The v2 plan (see
  [../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md))
  adds the borrow checker as an opt-in mode. v1 code that
  does not need it stays as-is; v2 code that wants the
  extra safety opts in.

## Reversibility

The decision is **partially reversible**. The GC remains
the default in v2; the borrow checker is opt-in. v1 programs
that use the GC continue to work in v2. The only thing v2
changes is that programs can *also* opt into the borrow
checker for additional safety.

## Cross-references

- [../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md)
  — the v2 borrow checker plan.
- [../spec/11-memory-and-gc.md](../spec/11-memory-and-gc.md)
  — the spec for the v2 Aether-specific GC.
- [../tutorials/ownership.md](../tutorials/ownership.md)
  — the v1 memory model tutorial.
- [../decisions/adr-01-tree-walking-interpreter-for-v1.md](adr-01-tree-walking-interpreter-for-v1.md)
  — the related decision to use a tree-walker (which makes
  the GC delegation to the host trivial).
