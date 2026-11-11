# 01 — Overview & Design

> **Status:** 🔒 Stable
> **Subsystem:** cross-cutting
> **Spec version:** 0.1

## 1. TL;DR

Aether is a statically-typed, expression-oriented language with
algebraic data types, pattern matching, first-class async/await, and a
garbage-collected bytecode VM. The compiler is small enough to read in
an afternoon; the VM is small enough to extend in a weekend.

## 2. A 30-second program

```aether
// hello.ae
mod hello;

pub fn main() {
    let name = "world";
    println(format("hello, {name}"));
}
```

Run it with `aether run hello.ae`. The compiler will:

1. Lex `hello.ae` into a token stream ([§02](./02-lexical-structure.md)).
2. Parse the token stream into an AST ([§04](./04-expressions.md),
   [§05](./05-statements-and-declarations.md)).
3. Resolve names and infer types ([§03](./03-type-system.md),
   [§06](./06-modules-and-packages.md)).
4. Check exhaustiveness, definite-assignment, and trait conformance.
5. Lower the AST to bytecode ([§10](./10-vm-and-bytecode.md)).
6. Hand the bytecode to the VM, which executes it under a GC
   ([§11](./11-memory-and-gc.md)).

Each step is a separate module under `aether/core` or `aether/vm`; the
boundaries are described in [§09 Compiler Pipeline](./09-compiler-pipeline.md).

## 3. Design pillars

### 3.1 Boring on purpose

Aether's surface syntax is a careful blend of Rust, Swift, and ML
idioms. A programmer who knows any two of those should be able to read
idiomatic Aether without a tutorial. Where Aether diverges from its
predecessors, the divergence is in service of one of the other pillars.

### 3.2 Expression-oriented

Almost everything is an expression:

```aether
let abs_x = if x < 0 { -x } else { x };

let label = match status {
    Ok(_)  => "ok",
    Err(e) => e.to_string(),
};
```

The only constructs that are *statements* in the strict sense — i.e.
that do not produce a value — are declaration forms (`let` without a
value, `fn`, `type`, `struct`, `enum`, `trait`, `impl`, `mod`, `use`)
and `return`, `break`, `continue`, `raise`. They produce the
[never type](./03-type-system.md#never-type) `!`, which can be coerced
to any other type, so they can still appear inside expression position.

### 3.3 Static by default, dynamic when asked

Type inference is bidirectional (a la Hindley-Milner with rank-1
generalization, plus Swift-style contextual typing for literals and
closures). Annotations are required only where the inference algorithm
cannot reconstruct the type from local information:

- on `pub` declarations (module boundary),
- on `enum`/`struct` field types,
- on `trait` method signatures,
- on function parameters when a default value is not enough context.

A small, opt-in `dynamic` escape hatch exists for FFI glue and tests;
its semantics are specified in [§14 Interoperability](./14-interoperability.md).

### 3.4 Errors are values

`Result<T, E>` and `Option<T>` are ordinary enums defined in the
`core::result` and `core::option` modules. The `?` postfix operator is
ordinary syntax sugar:

```aether
fn read_config(path: String) -> Result<Config, IoError> {
    let bytes = fs::read(path)?;          // early-returns Err(IoError)
    let text  = String::from_utf8(bytes)?; // early-returns Err(IoError)
    Ok(parse_config(text))
}
```

Panics exist (`panic!(...)`, `unreachable!(...)`, array out-of-bounds,
integer overflow in `debug` mode) and are unrecoverable in the sense
that they abort the *current task*, not the whole process. See
[§08 Error Handling](./08-error-handling.md).

### 3.5 Async is first-class

`async fn` returns a `Future<Output = T>`. `await` is a postfix
operator (`expr.await`) that suspends the current task. Futures are
*not* threads; they are state machines that the compiler produces and
the runtime polls. The default runtime is single-threaded and
cooperative — for predictability — but a multi-threaded work-stealing
runtime is provided as an opt-in (`aether.toml` →
`[runtime] mode = "work-stealing"`). See
[§07 Functions, Closures & Async](./07-functions-closures-async.md).

### 3.6 Auditable surface

The whole language is intended to be implementable by a small team in a
small amount of code. The directory structure under `aether/` mirrors
the spec:

```
aether/
├── core/         # compiler front-end
│   ├── lexer/    # 02-lexical-structure.md
│   ├── parser/   # 04/05
│   ├── ast/      # 04/05 (data structures)
│   ├── types/    # 03
│   ├── sema/     # 03 + 06 (name resolution, inference)
│   ├── checker/  # 03 (exhaustiveness, borrow, trait conformance)
│   └── eval/     # AST interpreter (REPL/LSP/debug)
├── vm/           # runtime
│   ├── codegen/  # AST → bytecode (10)
│   ├── bytecode/ # ISA, encoders, decoders (10)
│   ├── vm/       # the interpreter loop (10)
│   └── gc/       # tricolor, generational collector (11)
├── stdlib/       # curated standard library (12)
│   ├── math/  regex/  encoding/  datetime/  collections/
│   ├── io/    async/  crypto/   string/    text/
└── tools/        # developer tooling (13)
    ├── repl/  formatter/ linter/ build/
    ├── test/  lsp/        docgen/  bench/
```

A reader who wants to know "where is X implemented?" should be able to
guess the file from the spec, and vice versa.

## 4. Target users

Aether is designed for three overlapping audiences:

1. **Application authors** who want a typed language with predictable
   performance, good async, and a small stdlib they can read.
2. **Embedders** who want to ship Aether as a scripting layer inside a
   larger host (e.g. ATLAS). Embedding is specified in
   [§14](./14-interoperability.md).
3. **Educators and learners** who want a small, real, end-to-end
   language implementation to read and extend.

## 5. Comparison with neighbors

| Feature | Aether | Rust | TypeScript | Lua |
|---|---|---|---|---|
| Static types | yes, inferred | yes, inferred | yes, structural | no |
| Algebraic data types | yes | yes | via unions | via tables |
| Pattern matching | yes, exhaustive | yes | no | no |
| Memory | GC (tricolor, generational) | ownership + borrow | GC | GC |
| Async | first-class, runtime-pluggable | yes, runtime-pluggable | yes, V8 runtime | coroutines |
| Embeddability | first-class | via C FFI | via V8 | first-class |
| Stdlib size | curated, ~10 modules | large | large | tiny |
| Compile latency | interactive | medium | fast | n/a (interpreted) |

Aether does not aim to beat any of these on their home ground. It aims
to be the smallest language that hits a useful point in the design
space.

## 6. Scope of the v0.1 spec

This document set describes the language intended to be implemented in
the first stable release, **Aether 0.1**. The following are explicitly
deferred to later versions:

- **Macros.** No user-defined macros. A fixed set of built-in macros
  (`format!`, `println!`, `select!`, `panic!`, `unreachable!`,
  `todo!`, `assert!`, `assert_eq!`) is specified in
  [§13 Tooling](./13-tooling.md).
- **Compile-time function evaluation (CTFE).** Constant evaluation is
  limited to literal folding and `const fn`-style constant propagation
  of pure integer and string expressions.
- **SIMD / explicit vectorization.** Not in 0.1.
- **Native code generation.** The VM is the only execution backend in
  0.1. An LLVM or Cranelift backend is a future-work item.
- **Reflection.** Types are erased at runtime; reflection is limited
  to trait objects and `dynamic` values (§14).

## 7. Stability promise

For the 0.1 series:

- A conformant compiler **MUST** accept every program that this spec
  describes as well-formed, and **MUST** reject every program that this
  spec describes as ill-formed.
- A conformant VM **MUST** execute accepted programs with the
  observable behavior described by this spec, modulo resource limits
  (memory, stack depth, time) which are implementation-defined.
- The standard library API surface listed in
  [§12](./12-stdlib.md) **MUST** remain backward-compatible within the
  0.x series. Breaking changes are gated behind a 1.0 release.

## 8. Related work

Aether draws ideas from, in roughly decreasing order of attribution:

- **Rust** — syntax for `enum`, `match`, `Result`/`Option`, `?`, traits.
- **Swift** — bidirectional type inference, `async`/`await` ergonomics.
- **ML (SML/OCaml)** — expression-orientation, ADTs, parametric
  polymorphism with rank-1 generalization.
- **Lua** — embeddability posture, register-vs-stack VM pragmatism.
- **TypeScript** — string interpolation ergonomics, `as` casts.
- **Go** — channel semantics for the `async` runtime.

Specific borrowing is acknowledged inline in each section.
