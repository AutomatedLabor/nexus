# Aether Language Specification — Index

> **Status:** Draft 0.1 — under active development.
> **Stability:** No part of this specification is frozen. Sections marked
> 🔒 *Stable* are intended to remain backward compatible; sections marked
> 🧪 *Experimental* are subject to change without notice.
> **Canonical location:** [`docs/spec/`](.) inside the ATLAS monorepo.

---

## 1. What is Aether?

Aether is a small, statically-typed, expression-oriented programming
language with first-class async/await, algebraic data types, and a
garbage-collected bytecode VM. It is designed to be **embeddable**,
**teachable**, and **auditable**: the entire language fits in a single
compiler crate (`aether/core`), a single VM crate (`aether/vm`), a curated
standard library (`aether/stdlib`), and a single toolchain
(`aether/tools`).

Aether programs are compiled to a compact bytecode intermediate
representation and executed by a stack-based virtual machine with a
tricolor, generational garbage collector. An AST-walking interpreter
(`aether/core/eval`) is provided for REPL, LSP, and debugging scenarios
where compilation latency matters more than throughput.

## 2. Design pillars

1. **Boring on purpose.** Aether borrows syntax and semantics from
   Rust, Swift, ML, and TypeScript. Familiar constructs should behave in
   the familiar way; novelty is reserved for places where it earns its
   keep.
2. **Expression-oriented.** Most constructs — including `if`, `match`,
   and blocks — are expressions. Statements exist, but they are thin.
3. **Static by default, dynamic when asked.** Types are inferred
   everywhere a human could infer them; explicit annotations are
   required only at module boundaries and on `pub` declarations.
4. **Errors are values.** `Result<T, E>` and `Option<T>` are ordinary
   enums; the `?` operator is ordinary syntax sugar. Panics exist but
   are reserved for invariant violations.
5. **Async is first-class, not bolted on.** `async fn` returns a
   `Future`; the runtime is pluggable; the default scheduler is
   single-threaded and cooperative for predictability.
6. **Auditable surface.** The compiler, VM, stdlib, and toolchain are
   sized so that one engineer can hold the whole system in their head.
   Subsystems are isolated under stable directory boundaries
   (see §5).

## 3. Non-goals

Aether explicitly does **not** aim to:

- Replace systems languages. There is no manual memory management, no
  zero-cost-abstraction doctrine, and no inline assembly.
- Be a drop-in scripting language for an existing host. Aether is
  embeddable, but its idioms are its own.
- Support arbitrary compile-time metaprogramming. There is no macro
  system beyond `select!`, `format!`, and a small fixed set of built-ins.
- Prioritize raw peak throughput over compiler responsiveness. The
  compiler must stay interactive on a laptop.

## 4. Audience

This specification is written for **implementers** — the engineers
writing the compiler, VM, stdlib, and tooling — and for **advanced
users** who need a precise reference. A separate, friendlier
introductory track lives under [`docs/tutorials/`](../tutorials/) and
[`docs/guides/`](../guides/).

## 5. Document map

Each spec document maps to a directory under [`aether/`](../../aether/).
The mapping is intentional: a reader who wants to implement or audit a
subsystem should be able to read the matching spec, then read the
matching directory, with no surprises about where things live.

| # | Document | Subsystem | Status |
|---|----------|-----------|--------|
| 00 | [Index](./00-index.md) | — | 🔒 Stable |
| 01 | [Overview & Design](./01-overview.md) | — | 🔒 Stable |
| 02 | [Lexical Structure](./02-lexical-structure.md) | `core/lexer` | 🧪 Experimental |
| 03 | [Type System](./03-type-system.md) | `core/types`, `core/sema` | 🧪 Experimental |
| 04 | [Expressions](./04-expressions.md) | `core/ast`, `core/parser` | 🧪 Experimental |
| 05 | [Statements & Declarations](./05-statements-and-declarations.md) | `core/ast`, `core/parser` | 🧪 Experimental |
| 06 | [Modules & Packages](./06-modules-and-packages.md) | `core/sema` | 🧪 Experimental |
| 07 | [Functions, Closures & Async](./07-functions-closures-async.md) | `core/ast`, `core/eval`, `vm` | 🧪 Experimental |
| 08 | [Error Handling](./08-error-handling.md) | `core/ast`, `core/eval` | 🧪 Experimental |
| 09 | [Compiler Pipeline](./09-compiler-pipeline.md) | `core/*` | 🔒 Stable |
| 10 | [VM & Bytecode](./10-vm-and-bytecode.md) | `vm/*` | 🧪 Experimental |
| 11 | [Memory & GC](./11-memory-and-gc.md) | `vm/gc` | 🧪 Experimental |
| 12 | [Standard Library](./12-stdlib.md) | `stdlib/*` | 🧪 Experimental |
| 13 | [Tooling](./13-tooling.md) | `tools/*` | 🧪 Experimental |
| 14 | [Interoperability & FFI](./14-interoperability.md) | `vm`, host bindings | 🧪 Experimental |
| 15 | [Conformance & Tests](./15-conformance-and-tests.md) | `tools/test`, `tests/aether` | 🔒 Stable |
| 16 | [Glossary](./16-glossary.md) | — | 🔒 Stable |

Companion material:

- Design rationales and trade-offs: [`docs/decisions/`](../decisions/)
- End-user tutorials: [`docs/tutorials/`](../tutorials/)
- Task-oriented guides: [`docs/guides/`](../guides/)
- Reference snippets: [`docs/examples/`](../examples/)
- API reference (generated): [`docs/reference/`](../reference/) — produced
  by `aether docgen` (see [§13 Tooling](./13-tooling.md)).

## 6. Notation conventions

Throughout this specification:

- The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and
  **MAY** are used in the RFC 2119 sense.
- Grammar productions are written in an EBNF-like notation:

  ```
  Rule      ::= Alt1 | Alt2
  Alt1      ::= "token" NonTerminal*
  NonTerminal ::= IDENT | INT | STRING
  ```

  Quoted strings are terminal tokens; unquoted capitalized names are
  terminals supplied by the lexer (see
  [02-lexical-structure.md](./02-lexical-structure.md)).

- Code examples are Aether source unless stated otherwise:

  ```aether
  fn main() {
      println("hello, aether");
  }
  ```

- Bytecode examples use the assembly form defined in
  [10-vm-and-bytecode.md §Assembly form](./10-vm-and-bytecode.md#assembly-form).
- Line and column numbers are 1-based; byte offsets are 0-based.

## 7. Versioning

The spec is versioned as `MAJOR.MINOR`. `MAJOR` is bumped when a change
breaks existing conformant programs. `MINOR` is bumped for additive
changes. Each document carries its own status tag; the spec version as a
whole is the maximum of its parts. The current spec version is **0.1**.

## 8. How to read this spec

- **First time:** read [01-overview.md](./01-overview.md), then skim
  [09-compiler-pipeline.md](./09-compiler-pipeline.md) for the big
  picture, then dive into the topic you care about.
- **Implementing the front-end:** 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09.
- **Implementing the VM:** 09 → 10 → 11 → 14.
- **Writing stdlib:** 03 → 07 → 08 → 12.
- **Writing tooling:** 09 → 13 → 15.

## 9. Open questions

Open questions are tracked inline with the marker **`Q:`** and a short
ID, e.g. `Q-LAYOUT-1`. They are collected in
[`docs/decisions/open-questions.md`](../decisions/open-questions.md)
when that file exists. Resolved questions become entries in
[`docs/decisions/`](../decisions/) as Architecture Decision Records
(ADRs).
