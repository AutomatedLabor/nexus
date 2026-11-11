# Aether FAQ

> Audience: anyone with a question about Aether.
> Prerequisites: nothing. Just curiosity.

This is a list of 50+ real questions, with answers, that
people ask about Aether. The questions are grouped:

- **1. What and why** (Q1-12)
- **2. The language** (Q13-26)
- **3. The implementation** (Q27-36)
- **4. Performance and limits** (Q37-43)
- **5. v1 vs v2** (Q44-50)
- **6. Getting involved** (Q51-54)

If your question is not here, see
[glossary.md](glossary.md) for terms,
[error-catalog.md](error-catalog.md) for compiler/runtime
errors, or
[../tutorials/getting-started.md](../tutorials/getting-started.md)
for the beginner path.

## 1. What and why

### Q1. What is Aether?

Aether is a statically-typed, expression-oriented programming
language with first-class algebraic data types, pattern
matching, generics, and a small curated standard library.
The v1 implementation is a tree-walking interpreter that runs
in the browser, so there is no install step. You open the
playground and you are programming.

The language draws from Rust (syntax for `enum`, `match`,
`Result`/`Option`, `?`), Swift (bidirectional type
inference), ML (expression-orientation, ADTs), and TypeScript
(string interpolation ergonomics, `as` casts).

### Q2. Why another language?

Because most existing languages are either too big (Rust,
Swift, TypeScript) or too untyped (Lua, Python, JavaScript).
Aether is intentionally small — small enough to hold in your
head, small enough to implement in a weekend, small enough to
audit end-to-end — but typed and expression-oriented like its
larger cousins.

The goal is not to replace Rust or TypeScript. The goal is to
be the smallest language that hits a useful point in the design
space: typed, expression-oriented, ADTs, pattern matching,
generics, GC. If you want any of those without the weight of
the big languages, Aether is for you.

### Q3. Is Aether fast?

No. Aether v1 is a tree-walking interpreter running in the
browser. Typical overhead is 100-1000x over native code for
tight loops. The v1 evaluator has a step limit (1,000,000
steps by default) that bounds how long a program can run.

The v2 plan adds a bytecode VM with a generational GC; the
expected speedup is 10-100x. See
[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md).

For now, Aether v1 is a teaching language. For production
use, wait for v2.

### Q4. Can I use Aether in production?

No, not in v1. v1 is a teaching language and a specification.
It has no packages, no file I/O (in the playground), no
network access, no async, no FFI. It is meant for learning
the language and writing small programs in the playground.

The v2 plan adds packages, file I/O, async, FFI, and a
bytecode VM. Production use should wait for v2; see
[../rfcs/](../rfcs/) for the roadmap.

### Q5. How is Aether different from Rust?

Aether borrows Rust's syntax (`enum`, `match`, `Result`,
`Option`, `?`, `let`/`let mut`, `fn`, `->`) but does not have
its ownership system. Aether v1 uses a garbage collector; v2
will add a borrow checker as an opt-in mode. See
[../guides/migration-from-rust.md](../guides/migration-from-rust.md)
and
[../tutorials/ownership.md](../tutorials/ownership.md).

### Q6. How is Aether different from TypeScript?

Aether is statically typed like TypeScript (with `strict:
true`), but has nominal types (not structural), immutability
by default, no `null`, no exceptions, no async (in v1). See
[../guides/migration-from-typescript.md](../guides/migration-from-typescript.md).

### Q7. How is Aether different from Python?

Aether is statically typed, immutable by default, has no
classes, no exceptions, no `None`, no async. Python is
dynamically typed, mutable by default, has classes,
exceptions, `None`, and async. See
[../guides/migration-from-python.md](../guides/migration-from-python.md).

### Q8. How is Aether different from Go?

Aether is statically typed like Go, but uses `Result<T, E>`
and `?` instead of `(T, error)` and `if err != nil`. Aether
v1 has no goroutines or channels (v2 will). Aether has
first-class enums with data; Go uses `iota`. See
[../guides/migration-from-go.md](../guides/migration-from-go.md).

### Q9. How is Aether different from Lua?

Aether is statically typed; Lua is dynamically typed. Aether
has algebraic data types and pattern matching; Lua has
tables. Aether v1 has no coroutines; Lua has them. Aether's
goal of being embeddable is similar to Lua's; see
[../spec/14-interoperability.md](../spec/14-interoperability.md)
for the embedding plan.

### Q10. How is Aether different from Swift?

Aether borrows Swift's bidirectional type inference and
`async`/`await` ergonomics (planned for v2). Swift has
reference counting (ARC) and a borrow checker; Aether v1 has
GC; v2 will add a borrow checker.

### Q11. How is Aether different from OCaml / Haskell?

Aether borrows the expression-orientation and ADTs from ML.
Aether does not have type classes (Haskell) or functors
(OCaml); traits are planned for v2. Aether does not have
lazy evaluation. Aether is meant to be smaller and more
approachable than either.

### Q12. Who is Aether for?

Three audiences:

1. **Learners** who want a small, real, end-to-end language
   implementation to read and extend.
2. **Embedders** who want a typed scripting layer inside a
   larger host (planned for v2).
3. **Educators** who want a small, statically-typed language
   for teaching.

Aether is not for performance-critical systems, real-time
systems, or production servers in v1.

## 2. The language

### Q13. What is `let mut`?

`let mut` introduces a mutable binding — one you can
reassign. The default `let` is immutable. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§1.

### Q14. Is there a `null`?

No. Use `Option<T>` for "may be absent". There is no `null`
literal. The compiler enforces this: you cannot use an
`Option<T>` as a `T`. See
[../tutorials/error-handling.md](../tutorials/error-handling.md)
§2.

### Q15. Are there exceptions?

No. Use `Result<T, E>` for "may fail". There is no
`throw`/`catch`. The `?` operator propagates errors. See
[../tutorials/error-handling.md](../tutorials/error-handling.md)
§3.

### Q16. What is `panic`?

`panic(msg)` aborts the current task with a message. It is
unrecoverable in v1. Use it for invariant violations, not
for ordinary failures. See
[../tutorials/error-handling.md](../tutorials/error-handling.md)
§4.

### Q17. Does Aether have classes?

No. Use `struct` for data and free functions for behavior.
Methods on structs are planned for v2 (via `impl` blocks); see
[../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).

### Q18. Does Aether have inheritance?

No. Use composition with closures or struct embedding
(embedding is planned for v2). See
[../guides/migration-from-typescript.md](../guides/migration-from-typescript.md)
§6.2 for the closure pattern.

### Q19. Does Aether have interfaces / traits?

Not in v1. Use `enum` + `match` for dispatch. Traits are
planned for v2; see
[../spec/03-type-system.md](../spec/03-type-system.md) §4.

### Q20. Does Aether have generics?

Yes. Aether has parametric polymorphism with `fn id<T>(x: T)
-> T { x }`. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§7.

### Q21. Does Aether have async?

Not in v1. v1 is single-threaded and synchronous. The v2 plan
adds `async fn`, `await`, `spawn`, channels, and `select`. See
[../tutorials/concurrency.md](../tutorials/concurrency.md)
and
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md).

### Q22. Does Aether have macros?

Not in v1. Macros are planned for v2; see
[../spec/13-tooling.md](../spec/13-tooling.md).

### Q23. What is the difference between `enum` and `struct`?

An `enum` is a closed set of alternatives (a sum type). A
`struct` is a record with named fields (a product type). Use
`enum` when a value can be one of N things; use `struct` when
a value has a fixed set of fields. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§5-6.

### Q24. What is `Result` and `Option`?

`Option<T>` is an enum with `Some(T)` and `None` variants —
"may be absent". `Result<T, E>` is an enum with `Ok(T)` and
`Err(E)` variants — "may fail". See
[../tutorials/error-handling.md](../tutorials/error-handling.md).

### Q25. What is the `?` operator?

`expr?` unwraps an `Option<T>` or `Result<T, E>`. If it is
`Some(v)` / `Ok(v)`, it produces `v`. If it is `None` / `Err(e)`,
it early-returns from the enclosing function. See
[../tutorials/error-handling.md](../tutorials/error-handling.md)
§2.4 and §3.3.

### Q26. What is `as`?

`expr as T` is an explicit type conversion. The most common
uses are `n as int` (truncate a float), `n as float` (widen
an int), `n as string` (convert to string). See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§3.5.

## 3. The implementation

### Q27. How is Aether implemented?

Aether v1 is a tree-walking interpreter written in TypeScript.
The compiler is in `aether/core/` (lexer, parser, sema, eval).
The stdlib is in `aether/stdlib/`. The playground is a Next.js
app. See
[../tutorials/tooling.md](../tutorials/tooling.md) for the
full stack.

### Q28. Why TypeScript?

Because it runs in the browser (which is where the
playground lives) and because the type system catches
real bugs in the compiler itself. The full rationale is in
[../decisions/adr-10-browser-runnable-core.md](../decisions/adr-10-browser-runnable-core.md).

### Q29. Why tree-walking?

Because it is the simplest possible interpreter: ~1000 lines
of TypeScript, no compilation step, no VM. The trade-off is
speed (100-1000x slower than native). See
[../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md).

### Q30. When will the bytecode VM ship?

It is the v2 plan. The RFC is at
[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md).
No date; this is a small team.

### Q31. How big is the compiler?

The v1 compiler (lexer + parser + sema + eval) is about 5000
lines of TypeScript. The stdlib is another 3000 lines. The
test suite is about 7000 lines. See
[../tutorials/tooling.md](../tutorials/tooling.md) §4.

### Q32. How many tests are there?

Over 700 tests in the v1 implementation. They cover every
public surface of the compiler and stdlib. See
[../decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md).

### Q33. What is the step limit?

The v1 evaluator has a step counter that increments once per
AST node visited. The default limit is 1,000,000 steps.
Programs that exceed the limit abort with
`execution step limit exceeded (1000000)`. See
[../tutorials/performance.md](../tutorials/performance.md)
§3.

### Q34. Can I configure the step limit?

Yes, via the `maxSteps` option to `run()` or
`compileAndRun()`:

```ts
compileAndRun(source, { maxSteps: 10_000_000 });
```

Be careful: a higher limit means the playground can become
unresponsive if your program runs too long.

### Q35. What is the GC?

Aether v1's GC is delegated to the host JavaScript runtime. All
Aether values are JavaScript values; the JS GC reclaims them
when they become unreachable. The v2 plan adds an
Aether-specific GC (tricolor, generational); see
[../spec/11-memory-and-gc.md](../spec/11-memory-and-gc.md).

### Q36. What is the compiler pipeline?

`source → lex → parse → check → run`. See
[../tutorials/getting-started.md](../tutorials/getting-started.md)
§7 and
[../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md).

## 4. Performance and limits

### Q37. How fast is Aether v1?

Slow. About 100-1000x slower than native code. See
[../tutorials/performance.md](../tutorials/performance.md)
§1.

### Q38. Why is Aether so slow?

Because v1 is a tree-walking interpreter running in the
browser. Each AST node visit is a JavaScript function call.
There is no JIT for Aether itself; the JS JIT helps but only
so much. See
[../tutorials/performance.md](../tutorials/performance.md).

### Q39. What is the biggest program Aether v1 can run?

Roughly: any program that completes within 1,000,000 steps
(default) or 100,000,000 steps (max configured). For tight
loops, that is about 10,000-1,000,000 iterations. For
recursive calls, it is about 100,000-1,000,000 calls. See
[../tutorials/performance.md](../tutorials/performance.md)
§3.

### Q40. How do I make my Aether program faster?

- Use `reduce`/`map`/`filter` instead of manual loops.
- Use `join` instead of `+` for strings in loops.
- Use `while` instead of recursion for linear loops.
- Hoist loop invariants.
- Use closed forms where possible.

See [../tutorials/performance.md](../tutorials/performance.md)
§4.

### Q41. Does Aether have a step counter?

Yes. The playground's Inspector has a Steps tab that shows
the step count for the last run. See
[../tutorials/tooling.md](../tutorials/tooling.md) §2.

### Q42. What is the Benchmarks view?

A view in the playground that runs a small set of benchmarks
and reports the step count for each. See
[../tutorials/performance.md](../tutorials/performance.md)
§5.

### Q43. Is the step count wall-clock time?

No. Step count is deterministic — the same program always
takes the same number of steps. Wall-clock time varies with
the JS engine, the JIT, GC pressure, and so on. Use step
count for predictability; use wall-clock for "is this fast
enough?".

## 5. v1 vs v2

### Q44. What is v1 vs v2?

v1 is the current implementation: tree-walking interpreter,
browser-only, single-threaded, no packages, no async, no
borrow checker, GC. v2 is the planned upgrade: bytecode VM,
packages, async/await, borrow checker (opt-in), traits,
methods. See
[../rfcs/](../rfcs/) for the v2 RFCs.

### Q45. When will v2 ship?

No date. This is a small team. The v2 RFCs are the roadmap;
they will be implemented in some order over some time.

### Q46. Will v1 programs work in v2?

Yes. The v2 plan is backward compatible: every v1 program
should run unchanged on v2. The new features (async, traits,
methods) are additive; they do not break existing programs.

### Q47. What will v2 add that v1 does not have?

- A bytecode VM (10-100x speedup).
- A package manager and module system.
- `async fn`, `await`, `spawn`, channels, `select`.
- A borrow checker (opt-in).
- Traits and methods on structs.
- A REPL, LSP, formatter, linter, build tool.
- FFI for calling native code.

See [../rfcs/](../rfcs/) for the RFCs.

### Q48. What will v2 keep from v1?

- The language syntax (mostly).
- The type system (additive).
- The standard library (mostly).
- The expression-oriented design.
- The `Option`/`Result`/`?` error model.
- The tree-walking interpreter (kept for REPL/LSP/debug, where
  latency matters more than throughput).

### Q49. Why is v1 so limited?

Because v1 prioritized *shipping something runnable* over
*implementing everything*. A small team can build a
tree-walking interpreter in a weekend; a borrow checker takes
months; a bytecode VM takes years. v1 is the 80% of the
language that gets you 80% of the value with 20% of the work.
See [../decisions/](../decisions/) for the design decisions.

### Q50. Should I learn v1 or wait for v2?

Learn v1 now. The language syntax is the same; the v2
additions are additive. What you learn in v1 will transfer
directly to v2. The tutorials are written for v1; the RFCs
describe what v2 will add.

## 6. Getting involved

### Q51. How do I report a bug?

Open an issue in the project's issue tracker. Include:

1. The Aether source that reproduces the bug.
2. The expected behavior.
3. The actual behavior (error message, output, or step
   count).
4. The browser and OS you are using.

See the project README for the link.

### Q52. How do I contribute?

1. Clone the repo and run `bun install`.
2. Run `bun test` to verify the test suite passes.
3. Read the spec section that matches your interest.
4. Read the implementation file that matches.
5. Make your change and add or update tests.
6. Open a pull request.

See [../tutorials/tooling.md](../tutorials/tooling.md) §8 for
the workflow.

### Q53. Is there a code of conduct?

Yes, the standard contributor covenant. See the project
README.

### Q54. Is there a community?

Not yet in v1. The v2 plan includes a Discord and a mailing
list. For now, the issue tracker is the place for
discussions.

## 7. Random specifics

### Q55. Why is there no `++` operator?

Because `++` is a side effect disguised as an expression. In
Aether, mutation is explicit (`let mut` and `=`). The
equivalent of `x++` is `x = x + 1` or `x += 1`. This is the
same choice Rust made.

### Q56. Why is `/` always float division?

Because the alternative (`/` is int division when both
operands are int) is a footgun. In Python, `7 / 2 == 3`
surprises people coming from JavaScript. In Aether, `7 / 2`
is always `3.5`. For integer division, use `(7 / 2) as int`
or `7 / 2 as int`.

### Q57. Why does `-7 % 3 == 2` (not -1)?

Because Aether follows Python's modulo sign rule: the result
always has the same sign as the divisor. This is the only
correct choice for a predictable language. The alternative
(C-style: result has the sign of the dividend) is faster but
less consistent. See
[../spec/04-expressions.md](../spec/04-expressions.md) §6.

### Q58. Why is `let` immutable by default?

Because immutability by default catches bugs (typos that
overwrite a value you meant to keep) and makes code easier to
read (you know the binding will not change). The same choice
Rust made. See
[../tutorials/ownership.md](../tutorials/ownership.md) §3.1.

### Q59. Why no exceptions?

Because exceptions are a hidden control-flow mechanism that
makes code hard to reason about. `Result<T, E>` puts the
possibility of failure in the type, where the compiler can
help you handle it. The `?` operator keeps the boilerplate
small. See
[../tutorials/error-handling.md](../tutorials/error-handling.md).

### Q60. Why no `null`?

Because `null` is a runtime footgun. `Option<T>` puts the
possibility of absence in the type, where the compiler can
help you handle it. See
[../tutorials/error-handling.md](../tutorials/error-handling.md)
§2.

### Q61. Why `f"..."` for interpolation (not `` `...` ``)?

Two reasons:

1. `f"..."` is the Python convention, which many people
   know.
2. `` `...` `` in JavaScript is reserved for tagged template
   literals, which Aether does not have. Using it for
   interpolation would be confusing.

### Q62. Why are closure parameter types required?

Because the v1 type inference algorithm does not infer
closure parameter types from the body. This is a v1
limitation; v2 may relax it. See
[../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md).

### Q63. Why no method syntax (e.g., `xs.push(4)`)?

Because v1 has no methods on structs. Methods are planned
for v2 (via `impl` blocks); see
[../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).
For now, use the free function: `push(xs, 4)`.

### Q64. Why is `match` not exhaustive-checked in v1?

Because the exhaustiveness check requires more flow analysis
than the v1 sema has. v2 will enforce it; see
[../spec/03-type-system.md](../spec/03-type-system.md) §6.6.
In v1, the convention is to always include a `_` arm or cover
all variants explicitly.

### Q65. Why is there a step limit?

To prevent infinite loops from hanging the browser tab. The
limit is configurable; see
[../tutorials/performance.md](../tutorials/performance.md)
§3.

### Q66. Can I call JavaScript from Aether?

Not in v1. v1 has no FFI. The v2 plan includes FFI for
calling JavaScript (and other host languages); see
[../spec/14-interoperability.md](../spec/14-interoperability.md).

### Q67. Can I call Aether from JavaScript?

Yes, via the compiler API. See
[../tutorials/tooling.md](../tutorials/tooling.md) §3 for
the public surface.

### Q68. Can I write a server in Aether?

Not in v1. v1 has no network access, no file I/O (in the
playground), no async. v2 will add these; see
[../rfcs/](../rfcs/).

### Q69. Can I write a game in Aether?

Maybe, in the playground, if the game is small enough to fit
in the step limit and does not need real-time input. v1 is
not a serious game language.

### Q70. Can I write a CLI in Aether?

Not in v1. v1 has no file I/O or process control. v2 will
add these.

### Q71. Can I write a compiler in Aether?

Yes, in principle. Aether is Turing-complete and has enough
data structures (enums, structs, maps, arrays). The step
limit is the constraint; for a small compiler, it should be
fine.

### Q72. Can I write a web app in Aether?

Not in v1. v1 has no DOM access, no fetch, no async. v2 may
add DOM bindings; see
[../spec/14-interoperability.md](../spec/14-interoperability.md).

### Q73. Why is the stdlib so small?

Because the v1 priority was "shipping something runnable",
not "implementing every function under the sun". The stdlib
has ~200 functions across 10 modules, which is enough for
most small programs. The v2 plan expands it; see
[../spec/12-stdlib.md](../spec/12-stdlib.md).

### Q74. Where can I read the spec?

At [../spec/](../spec/). Start with
[00-index.md](../spec/00-index.md) and follow the document
map.

### Q75. Where can I read the tutorials?

At [../tutorials/](../tutorials/). Start with
[getting-started.md](../tutorials/getting-started.md).

### Q76. Where can I read the RFCs?

At [../rfcs/](../rfcs/). The RFCs describe the v2 plan.

### Q77. Where can I read the design decisions?

At [../decisions/](../decisions/). The ADRs explain why v1
is the way it is.

### Q78. Where can I read the guides?

At [../guides/](../guides/). The guides are opinionated
tours: idioms, anti-patterns, and migration maps.

### Q79. What does the name "Aether" mean?

It is a reference to the luminiferous aether, the
hypothetical medium for light that 19th-century physics
disproved. The name signals that Aether is a thought
experiment as much as a real language — a "what if we made
a small typed language?" exploration.

### Q80. Is Aether done?

No. v1 is shipped; v2 is planned. The language will keep
evolving. See
[../rfcs/](../rfcs/) for the roadmap and
[../decisions/](../decisions/) for the design log.
