# Aether vs 10 Languages — A Comparison Reference

> **Audience.** This document is for someone who already knows at
> least one mainstream typed language and is wondering whether, when,
> and why to reach for Aether. It compares Aether v0.1 to ten other
> languages across typing discipline, memory model, concurrency,
> generics, ADTs, stdlib, FFI, and the niche each fills.

## 1. Introduction

Aether is a **browser-runnable, statically-typed, expression-oriented**
language with algebraic data types, pattern matching, generics,
closures, and a small inline standard library. Its current public
implementation (the "v1 playground") is a **tree-walking interpreter**
written in TypeScript that compiles Aether source in the browser and
runs it on the same JS engine that runs the page. The interpreter is
deliberately small — small enough to read in an afternoon — and is
intended for teaching, exploration, and small in-page scripting.

The longer-term roadmap, recorded as RFCs in `docs/rfcs/`, calls for a
**bytecode VM** (rfc-002) with a register-based ISA, a generational
GC, an **async/await runtime** (rfc-001), and a **module system**
(rfc-003). Those are not the language this document is comparing —
they are the language Aether is becoming. We note where the spec
disagrees with the v1 playground, but the comparison is grounded in
the v1 implementation that ships today.

Aether is not, and is not trying to be, a replacement for any of the
ten languages below. It occupies a specific niche: a typed language
you can embed in a web page, run on the playground without an install
step, and read end-to-end in a day. Where Aether is similar to one of
the others, that similarity is usually deliberate and acknowledged in
the spec (`01-overview.md` lists Rust, Swift, ML, Lua, TypeScript, and
Go as direct inspirations). Where it differs, the difference is
usually in service of smallness, browser-runnability, or the
teaching mission.

| Language     | Typing discipline      | Memory model              | Concurrency model                  | Compile target       | Generics | ADTs  | Stdlib size | FFI         | Aether similarity |
|--------------|------------------------|---------------------------|------------------------------------|----------------------|----------|-------|------------|-------------|-------------------|
| **Aether**   | static, inferred, rank-1| GC (tricolor, planned); tree-walk v1 | sync v1; async v2 (planned) | tree-walk interpreter (TS); bytecode VM (planned) | yes  | yes (recursive enums) | tiny (inline) | none v1; planned | — |
| **Rust**     | static, inferred       | ownership + borrow        | async + threads + Send/Sync        | native (LLVM)        | yes  | yes | large      | C FFI       | **high** (syntax, ADTs, Result/Option, ?) |
| **TypeScript** | static, structural    | GC (V8)                   | event loop; async/await; workers   | JS (V8/JSC/SM)      | yes  | via unions | large   | JS interop  | **high** (web target, syntax ergonomics) |
| **Go**       | static, nominal        | GC                        | goroutines + channels             | native               | no (1.18+: yes) | via interfaces | large | C cgo      | medium (channel-shaped async runtime planned) |
| **Python**   | dynamic                | GC (refcount + cycle)     | GIL + threading; asyncio          | bytecode (CPython)   | duck typing | via dataclasses | huge | ctypes/cffi | low |
| **Kotlin**   | static, inferred       | GC (JVM)                  | coroutines + JVM threads          | JVM bytecode        | yes  | via sealed classes | large | JVM/JNI | medium (coroutines, expression-oriented) |
| **Swift**    | static, inferred       | ARC (owned)               | async/await + actors + GCD        | native (LLVM)        | yes  | yes (enums w/ payloads) | large | C interop | **high** (bidirectional inference, async ergonomics) |
| **OCaml**    | static, inferred (HM)  | GC                        | async (5.x); effects              | native + bytecode   | yes  | yes | medium     | C FFI       | **high** (ML heritage, expression-orientation, ADTs) |
| **Haskell**  | static, inferred (HM)  | GC                        | STM, green threads                | native (GHC)        | yes  | yes | large      | C FFI       | medium (ADTs, type inference; Aether is strict and impure) |
| **Elixir**   | dynamic                | GC (BEAM)                 | actor processes                   | BEAM bytecode       | via behaviours | via pattern-matched tuples | large | NIFs | low (no static types) |
| **Julia**    | dynamic, gradual       | GC                        | tasks + multi-threading           | native (LLVM JIT)   | via parametric types | via parametric types | large | C ccall | low (different niche) |

The matrix is a quick orientation; each language gets a full section
below.

---

## 2. Aether vs Rust

### Philosophy

Rust is a systems programming language with three interlocking
commitments: **zero-cost abstractions**, **compile-time memory
safety without GC**, and **fearless concurrency**. The ownership
and borrow system is its defining feature — every value has a single
owner, borrows are either shared (`&T`) or exclusive (`&mut T`), and
the compiler rejects data races at compile time. Rust trades
ergonomics for guarantees: it's harder to write than Go, but the
compiler is a strict reviewer that catches an entire class of bugs
other languages punt to runtime.

Aether borrows heavily from Rust's surface syntax: `enum`, `match`,
`Result<T, E>`, `Option<T>`, the `?` error-propagation operator,
`let mut` versus `let`, `fn`. A reader who knows Rust can read
Aether's examples in one pass.

### Strengths

Rust's strengths are: a **mature borrow checker** that prevents use-
after-free, double-free, iterator invalidation, and concurrent
mutation at compile time; a **trait system** that's somewhere between
Haskell typeclasses and Go interfaces; a **rich pattern-matching
system** with exhaustiveness checking and guards; a **package
ecosystem** (cargo) that's the gold standard for compiled languages;
and an **LLVM backend** that produces code competitive with C.

### How Aether is similar

- Same `enum` and `match` syntax (and semantics — `match` is an
  expression, arms evaluate to a value).
- Same `Result<T, E>` / `Option<T>` types in the standard library;
  Aether's playground has both defined as built-in enums.
- Same `?` error-propagation operator — in Aether, `expr?`
  unwraps an `Ok`/`Some` or returns the `Err`/`None` from the
  enclosing function (modeled as a JS exception internally).
- Same `let mut` distinction: `let x = 5;` is immutable, `let mut x
  = 5;` is mutable. (Aether's `mut` is enforced by the runtime, not
  a borrow checker; there's no aliasing analysis.)
- Same `fn` declaration syntax with `->` return type.
- Closures capture by reference implicitly (Aether captures by
  environment lookup, which is closer to JavaScript than to Rust's
  `move`/`Copy` distinction).

### How Aether differs

- **Memory**: Rust uses ownership and borrow; Aether uses GC
  (tricolor, generational, *planned* — v1 is a tree-walking
  interpreter on the JS heap, so it inherits V8's GC). Aether has
  no borrow checker, no lifetime parameters, no `&`/`&mut`.
- **Performance**: Rust compiles to native code competitive with C;
  Aether v1 is a tree-walking interpreter — orders of magnitude
  slower. The v2 plan (RFC-002) is a register-based bytecode VM with
  a JIT-less interpreter loop; even that will be slower than Rust.
- **Async**: Rust has `async fn` returning `Future<Output=T>`,
  pinning, `Send`/`Sync` bounds. Aether v1 is **synchronous only** —
  there is no scheduler, no `await`, no `spawn`. RFC-001 plans an
  async runtime for v2.
- **Modules**: Rust has a mature `mod`/`use`/`pub` module system with
  crates and packages. Aether v1 has **no modules** — the
  playground runs one source file. RFC-003 plans a module system.
- **FFI**: Rust has a C FFI and `extern "C"`. Aether v1 has **no
  FFI** — the runtime is closed inside the JS engine.
- **Concurrency**: Rust has threads, channels, `Send`/`Sync`. Aether
  v1 has none; v2 plans cooperative async.
- **Macros**: Rust has declarative and procedural macros. Aether has
  a fixed set of built-in macros (`format!`, `println!`, `panic!`).
- **No `unsafe`**: Aether has no escape hatch for memory-unsafe
  operations because the language is already memory-safe via GC.

### When to choose Aether over Rust

- You want to teach someone what an algebraic data type or pattern
  match *is*, and you don't want them to fight the borrow checker.
- You want to ship a small typed script in a web page (Aether runs
  in the browser via the playground).
- You're writing a DSL or a configuration language where the
  target audience needs to read the implementation.
- You want to read a complete language implementation in a
  weekend — Aether's compiler is ~5k LOC of TypeScript; Rust's
  rustc is ~500k LOC.

### When to choose Rust over Aether

- You need native performance, predictable memory, or low-latency.
- You need a real concurrent program (threads, channels, locks).
- You need to call into C, or to be called by C.
- You need a real package ecosystem — Aether v1 has no modules, no
  package manager, no crates.
- You need async I/O today (Aether v1 has none).
- You need a borrow checker to catch use-after-free and data
  races — Aether relies on GC.

---

## 3. Aether vs TypeScript

### Philosophy

TypeScript is **JavaScript with types**. Its mission is to add a
gradual, structural type system on top of the existing JS runtime
without changing the runtime semantics, so that any valid JS is
valid TS (modulo `--strict`). The type system is large and pragmatic
— it includes union types, intersection types, conditional types,
mapped types, template literal types, and a host of utility types
that exist for the same reason C++ template metaprogramming exists:
to express at the type level what would otherwise be boilerplate at
runtime. TS compiles to JS by erasing types; the runtime is the JS
runtime.

Aether and TypeScript share the browser-runnable niche and a
similar expression-oriented ergonomics. They differ sharply on type
discipline (Aether is strict and inferred; TS is gradual and
explicit) and on ADTs (Aether has real enums with payloads; TS uses
union types and discriminated unions).

### Strengths

TypeScript's strengths: **mature ecosystem** (npm, Deno, Bun, every
JS library has TS types); **structural typing** that lets you
compose interfaces without ceremony; **best-in-class tooling**
(LSP, ts-server, tsc, eslint); **web-native** — TS runs in every
browser via V8/JSC/SpiderMonkey; **gradual typing** lets you ship
untyped code during prototyping and tighten later.

### How Aether is similar

- Both compile to / run on a JS engine. Aether v1 is a TypeScript
  project that runs in the browser; TS compiles to JS that runs in
  the browser. The v2 bytecode VM will still target the JS engine
  (the VM is itself a TS module).
- Both have `let`/`const` (Aether: `let`/`let mut`), arrow functions
  (`fn(x: int) -> int { … }` vs `(x: number) => number`), template
  strings (`f"...{x}..."` vs `` `...${x}...` ``), and a similar
  expression-oriented feel.
- Both have first-class closures that capture their environment.
- Both have a `Promise`-like abstraction (Aether: planned v2 `Future`;
  TS: `Promise`).
- Aether's `enum` and `match` roughly correspond to TS's
  discriminated unions with `switch (e.kind)` blocks, but Aether's
  pattern matching is checked for exhaustiveness and binds payloads
  inline; TS has no exhaustiveness check by default.

### How Aether differs

- **Type discipline**: Aether is statically typed with bidirectional
  inference (HM-ish); TS is gradual — `any` is a first-class type,
  and many programs are mostly `any` in practice. Aether has no
  `any` (RFC-006 mentions an opt-in `dynamic` for v2 FFI glue).
- **ADTs**: Aether has real algebraic data types — `enum Option<T>
  { Some(T), None, }` is a tagged union with first-class pattern
  matching. TS uses union types (`type Option<T> = { kind: "Some",
  value: T } | { kind: "None" })`), which work but require
  discriminated-union boilerplate and don't have exhaustiveness
  checking.
- **Inference**: Aether infers local types bidirectionally; TS
  infers but frequently needs annotations in places where HM-style
  inference would not. Aether does not infer struct field types —
  they must be declared on the struct.
- **Memory**: Both are GC'd. Aether's GC is planned as tricolor and
  generational for v2; v1 piggybacks on V8's GC.
- **Async**: TS has `async`/`await` on the JS event loop today.
  Aether v1 has **no async**; v2 plans it.
- **Modules**: TS uses ES modules (`import`/`export`). Aether v1
  has **no modules** — one source file per program.
- **FFI**: TS FFI is "any JS library you want". Aether v1 has no
  FFI; v2 plans to expose host functions.
- **stdlib**: TS has the entire JS standard library plus Node/Bun
  built-ins. Aether's stdlib is intentionally tiny: `print`,
  `range`, `len`, `str`, `int`, `min`, `max`, `abs`, `sqrt`,
  `push`, `pop`, `map`, `filter`, `reduce`, plus a handful of
  modules in `aether/stdlib/` that aren't wired to the v1
  playground.
- **Compile target**: TS compiles to JS (type erasure). Aether v1
  is interpreted directly; v2 compiles to bytecode for a custom
  VM (not JS).

### When to choose Aether over TypeScript

- You want a real ADT and pattern matching — TS's discriminated
  unions are workable but lack exhaustiveness.
- You want a stricter type system than TS's gradual one — no
  implicit `any`, no `unknown` escapes.
- You want a small language to teach with — TS is the size of a
  small book; Aether is the size of a long README.
- You want to read the entire language implementation. TS is
  spread across `tsc` (closed source, large), `v8`, and the TS spec
  (long). Aether is in `aether/core/` (~5k LOC of TS).

### When to choose TypeScript over Aether

- You need a real production web app — Aether v1 can't call
  `fetch`, can't render to the DOM, can't make a network request.
- You need to interop with the JS ecosystem (npm packages).
- You need async I/O today.
- You need a module system today.
- You need gradual typing (some `any` is fine; strictness everywhere
  is too much).

---

## 4. Aether vs Go

### Philosophy

Go is **boring on purpose**. The designers wanted a language that
1000 engineers could read and write together without surprise —
small surface, simple grammar, no operator overloading, no
inheritance, no generics (until 1.18), no exceptions (errors are
values). The result is a language with a fast compiler, a tiny
spec, opinionated formatting (`gofmt`), and a runtime with built-in
concurrency primitives (goroutines, channels) and a concurrent GC.
Go is the language of cloud infrastructure — Docker, Kubernetes,
Terraform are written in Go.

Aether and Go share a "small surface" philosophy but diverge on
type system (Aether has generics, ADTs, and pattern matching; Go
added generics in 1.18 but no ADTs) and on the concurrency model.

### Strengths

Go's strengths: a **blazing-fast compiler**; **single static
binaries**; **goroutines** (lightweight user threads with a
work-stealing scheduler); **channels** for typed communication
between goroutines (CSP style); a **concurrent GC** with sub-
millisecond pause times in recent versions; a **mature standard
library** (net/http, encoding/json, context, sync); a **strong
tooling baseline** (gofmt, go vet, golangci-lint, delve).

### How Aether is similar

- Both favor a small surface area. Aether's spec is ~15 short
  pages; Go's spec is a single 80-page PDF.
- Both have `if cond { … } else { … }` blocks that look almost
  identical.
- Both have `range` — Go's `for i := range arr { … }` is close to
  Aether's `for i in arr { … }` (though Go's `range` is dual-mode:
  index, value, or both; Aether's is single-mode: value).
- Aether's planned v2 async runtime (RFC-001) borrows the
  channel/select idea from Go: `select!` is one of the planned
  macros.
- Both prefer explicit over implicit — Go doesn't have implicit
  constructors or destructors; Aether doesn't have implicit type
  coercions (a `int` is not implicitly a `float`).

### How Aether differs

- **Generics**: Aether has first-class generics from day one
  (`enum Result<T, E>`, `fn id<T>(x: T) -> T { x }`). Go added
  generics in 1.18 (2022) but the syntax is heavier (`func id[T
  any](x T) T { return x }`) and constraints are explicit.
- **ADTs**: Aether has `enum Option<T> { Some(T), None, }` with
  pattern matching and exhaustiveness. Go has no ADTs — the
  idiom is to use an interface with multiple implementations
  and a type switch (`switch e := x.(type) { case Some: … }`),
  which is more verbose and not exhaustiveness-checked.
- **Error handling**: Go uses `(T, error)` returns with
  `if err != nil { return err }` boilerplate. Aether uses
  `Result<T, E>` with the `?` operator (like Rust), which
  propagates errors implicitly.
- **Memory**: Both are GC'd. Go's GC is concurrent and
  generational-ish; Aether v1 inherits V8's GC, v2 plans a
  tricolor generational collector.
- **Concurrency**: Go has goroutines and channels in the
  language and runtime today. Aether v1 has none; v2 plans
  async/await with a cooperative runtime, no goroutine-style
  preemption.
- **Modules**: Go has a mature module system (`go.mod`, `go.sum`,
  `import`). Aether v1 has none; v2 plans one (RFC-003).
- **Performance**: Go compiles to native code; Aether v1 is a
  tree-walking interpreter. Even v2's bytecode VM will be slower
  than Go.
- **Tooling**: Go ships `gofmt`, `go vet`, `go test`, `go build`
  in a single binary. Aether has a playground, an interpreter,
  and a small set of inline builtins.
- **Implicit zero values**: Go initializes every variable to
  its zero value. Aether requires explicit initialization (`let
  x: int = 0;`).

### When to choose Aether over Go

- You want ADTs and pattern matching — Go's interfaces and type
  switches are a poor substitute.
- You want a typed language you can run in a browser without a
  WASM compile step.
- You want generics with the ergonomic brevity of Rust/ML, not
  the explicit-constraint style of Go 1.18+.
- You want to read a language implementation — Go's runtime is
  ~100k LOC of C + Go; Aether is ~5k LOC of TS.

### When to choose Go over Aether

- You need real concurrency today (goroutines, channels).
- You need native performance and a single static binary.
- You need a real standard library (`net/http`, `encoding/json`).
- You need to deploy to a server or a container — Aether v1 is
  browser-only.
- You need a real module system and a real package manager
  today.
- You need to write a long-running service.

---

## 5. Aether vs Python

### Philosophy

Python is **batteries-included dynamic scripting**. Its design
motto is "there should be one — and preferably only one — obvious
way to do it" (which Python violates often). The language is
dynamically typed, late-bound, and famously beginner-friendly.
Python's superpower is its library ecosystem — numpy, pandas,
PyTorch, requests — and its role as the **glue language** for
scientific computing, ML, and ops automation. Recent versions
have added optional type hints (PEP 484) and pattern matching
(PEP 634, structural), but the type system remains gradual and
optional.

Aether and Python are almost opposite on the typing axis (Aether
is strict static; Python is dynamic with optional hints) but
similar in their role as **small, embeddable, scripting-friendly**
languages.

### Strengths

Python's strengths: **massive ecosystem** (PyPI, ~500k packages);
**dynamic typing** that's productive for prototyping; **clean
syntax** that reads like pseudocode; **first-class functions** and
**list/dict/set comprehensions**; **mature tooling** (pytest, pip,
virtualenv, mypy, ruff); **ubiquity** in ML, data, scripting,
education.

### How Aether is similar

- Both are small, embeddable languages that prioritize readability.
- Both have first-class functions and closures.
- Both have list-literal syntax (`[1, 2, 3]`) and string
  interpolation (`f"...{x}..."` in Aether; `f"...{x}..."` in Python
  3.6+ — the syntax is identical).
- Both have `range` and `len` as builtin functions.
- Both have a `match` statement (Python 3.10+). Aether's `match`
  is more ML-like (expressions, exhaustiveness); Python's is more
  Perl-like (statements, structural patterns, no exhaustiveness).
- Both have `print`/`println` as builtins.

### How Aether differs

- **Type discipline**: Aether is statically typed with bidirectional
  inference (no annotations needed in many places); Python is
  dynamically typed with optional PEP 484 hints that aren't
  enforced at runtime. Aether has no `any`; Python has `Any` and
  uses it everywhere.
- **Memory**: Both are GC'd (CPython uses refcounting + a cycle
  collector; Aether v1 inherits V8's GC, v2 plans a tricolor
  generational collector).
- **Performance**: CPython is a bytecode interpreter ~10-50× slower
  than native code. Aether v1 is a tree-walking interpreter ~10×
  slower than CPython. So Aether v1 is ~100-500× slower than
  native code, and ~10-50× slower than Python.
- **Concurrency**: Python has the GIL (global interpreter lock)
  for CPython threads, plus `multiprocessing`, plus `asyncio`.
  Aether v1 has no concurrency; v2 plans async/await.
- **Modules**: Python has a mature module system (`import`,
  packages, `__init__.py`, pip). Aether v1 has none.
- **Stdlib**: Python's stdlib is **huge** — `os`, `sys`, `json`,
  `re`, `collections`, `itertools`, `functools`, `subprocess`,
  `socket`, `http`, `asyncio`, etc. Aether's stdlib is **tiny**
  (~15 inline builtins).
- **Pattern matching**: Python's `match` (3.10+) is structural
  pattern matching with destructuring, but no exhaustiveness
  checking. Aether's `match` is an expression with exhaustiveness
  checking on enum types.
- **ADTs**: Python has no first-class ADTs; the idiom is dataclasses
  + Union types (with `match` since 3.10). Aether has `enum` with
  payloads and `match`.
- **FFI**: Python has `ctypes`, `cffi`, and Cython. Aether v1 has
  no FFI.

### When to choose Aether over Python

- You want a statically-typed language with ADTs and exhaustiveness.
- You want to catch type errors before runtime (Aether's checker
  runs in the playground as you type).
- You want to ship a typed script that runs in a browser without
  a Python-WASM compile step.
- You want a small language to teach types and ADTs.

### When to choose Python over Aether

- You need the scientific computing ecosystem (numpy, pandas,
  PyTorch, matplotlib).
- You need a real standard library.
- You need a real package manager (pip).
- You need to interop with C/C++ (ctypes, Cython, pybind11).
- You need a mature async story (asyncio).
- You need to write a long-running service.

---

## 6. Aether vs Kotlin

### Philosophy

Kotlin is **the modern JVM language** — a statically-typed,
expression-oriented language that compiles to JVM bytecode (and to
JS, and to native via Kotlin/Native). Designed by JetBrains as a
pragmatic replacement for Java, Kotlin keeps the JVM ecosystem but
adds null safety, coroutines, sealed classes, data classes,
extension functions, and a more concise syntax. It's the official
language for Android.

Aether and Kotlin share expression-orientation and a coroutine
story (Aether's is planned for v2), but differ on runtime (JVM vs
JS), type system (Kotlin is nominally-typed with null-safety as a
first-class concern; Aether is structurally-typed for functions and
nominally-typed for ADTs), and the ADT ergonomics (Kotlin's sealed
classes work but aren't as clean as Aether's enums).

### Strengths

Kotlin's strengths: **null safety** (the type system distinguishes
`String?` from `String`, and the compiler enforces null checks);
**coroutines** (a mature, well-documented async story with
`Dispatchers`, `Flow`, structured concurrency); **JVM interop**
(seamless with Java libraries); **concise syntax** (data classes,
extension functions, scope functions, smart casts); **multiplatform**
(JVM, JS, Native); **mature tooling** (IntelliJ, Ktor, Gradle).

### How Aether is similar

- Both are expression-oriented (an `if` or `match` is an expression).
- Both have `when`/`match` as a switch-like expression with
  exhaustive arms (Kotlin's `when` is exhaustive over sealed classes;
  Aether's `match` is exhaustive over enums).
- Both have `enum` with payloads (Kotlin's `enum class` is more
  limited; Kotlin's `sealed class` is closer to Aether's `enum`).
- Both have first-class generics and type inference.
- Both have `Result<T>` (Kotlin's stdlib has `Result<T>`; Aether's
  stdlib has `Result<T, E>`).
- Both have coroutines/async (Aether v2 planned; Kotlin today).
- Both prefer `val`/`var` (Kotlin) and `let`/`let mut` (Aether) —
  same immutability distinction.

### How Aether differs

- **Runtime**: Kotlin compiles to JVM bytecode (and JS, and
  native). Aether v1 is a tree-walking interpreter on V8; v2 will
  be a custom bytecode VM on JS.
- **Null safety**: Kotlin has null-safety as a first-class type
  system feature (`String?` vs `String`). Aether has no `?` types —
  nullability is handled by `Option<T>` (an enum), like Rust.
- **Memory**: Kotlin on the JVM uses the JVM's GC. Aether v1
  uses V8's GC; v2 plans its own.
- **Concurrency**: Kotlin has coroutines today (Dispatchers.IO,
  Flow, structured concurrency). Aether v1 has no concurrency;
  v2 plans async/await.
- **Modules**: Kotlin has packages (`package foo.bar`) and is
  typically built with Gradle. Aether v1 has no modules; v2 plans
  a module system (RFC-003).
- **Stdlib**: Kotlin's stdlib is **large** (collections, sequences,
  coroutines, IO, math, time). Aether's is tiny.
- **Performance**: Kotlin on JVM is JIT-compiled and fast (close
  to Java). Aether v1 is slow; v2 will be slower than Kotlin/JVM.
- **Interoperability**: Kotlin interops seamlessly with Java.
  Aether v1 has no FFI; v2 plans host-function FFI.
- **ADTs**: Kotlin's `sealed class` is the ADT analog, but
  verbose — each variant is a separate class. Aether's `enum {
  Some(T), None }` is one declaration.
- **Pattern matching**: Kotlin's `when` is exhaustive over sealed
  classes but doesn't bind payloads as cleanly. Aether's `match`
  binds payloads inline (`Expr::Add(a, b) => …`).

### When to choose Aether over Kotlin

- You want a cleaner ADT story — Aether's `enum` with payloads
  and `match` is more ML-like than Kotlin's `sealed class`.
- You want to run in a browser without a Kotlin/JS compile step.
- You want a small language to read end-to-end.
- You prefer `Option<T>` to `T?`.

### When to choose Kotlin over Aether

- You need the JVM ecosystem (Java libraries, Spring, Ktor).
- You need real concurrency today (coroutines).
- You need null-safety as a type system feature.
- You need to deploy to Android.
- You need a real module system and package manager.
- You need native performance (Kotlin/Native compiles to LLVM).

---

## 7. Aether vs Swift

### Philosophy

Swift is **Apple's modern systems language** — a statically-typed,
expression-oriented language with ADTs, pattern matching, generics,
protocols, and async/await. Designed to replace Objective-C, Swift
compiles to native code via LLVM and runs on iOS, macOS, Linux, and
Windows. Its type system is one of the most sophisticated in any
mainstream language — bidirectional inference, associated types in
protocols, opaque return types, existential types, and a borrow
checker-lite (the `inout`/`mutating` distinction). Memory is managed
by **automatic reference counting (ARC)** — not GC, not borrow
checking, but compile-time-validated strong/weak references.

Aether and Swift share the most syntactic and semantic DNA of any
pair in this list. The spec's `01-overview.md` lists Swift as a
direct inspiration for "bidirectional type inference, async/await
ergonomics". A reader who knows Swift can read Aether almost without
a tutorial.

### Strengths

Swift's strengths: a **sophisticated type system** (associated types,
protocols, opaque types, result builders); **ADTs with payloads**
(enums carry data and have methods); **pattern matching** with
exhaustiveness; **ARC** for predictable memory without GC pauses;
**async/await** with actors for safe concurrency; **native
performance** via LLVM; **mature tooling** (Xcode, Swift Package
Manager, SourceKit-LSP).

### How Aether is similar

- Same `enum` and `match` syntax and semantics — Swift's `enum
  Expr { case num(Int); case add(Expr, Expr); … }` is close to
  Aether's `enum Expr { Num(int), Add(Expr, Expr), … }`.
- Same exhaustiveness checking on `switch`/`match`.
- Same `let`/`var` distinction (Aether: `let`/`let mut`).
- Same `Optional<T>` (Aether: `Option<T>`) — both use an enum,
  not a nullable type.
- Same `Result<T, E>` with `try?` / `?`-like propagation.
- Same `if`-as-expression (`let x = if cond { a } else { b }`).
- Same `async`/`await` ergonomics (Aether v2 plans postfix
  `expr.await`, like Swift's `expr.await` — both chose postfix
  rather than the JS prefix `await expr`).
- Same bidirectional type inference (Swift's was a direct
  inspiration per the spec).
- Same protocol/trait-style polymorphism (planned for Aether v2
  via RFC-006's `dynamic`/trait system).

### How Aether differs

- **Memory**: Swift uses **ARC** (compile-time reference counting
  with weak/strong distinction). Aether uses **GC** (planned for
  v2 as tricolor generational). ARC has predictable pauses at
  release time; GC has occasional longer pauses. Swift has no
  cycles (programmers use `weak`); Aether's GC handles cycles.
- **Performance**: Swift compiles to native code via LLVM and is
  competitive with C++. Aether v1 is interpreted (slow); v2 will
  be bytecode-interpreted (still slower).
- **Runtime**: Swift has a tiny runtime (the Swift runtime
  library is small). Aether v1 runs on V8 (large); v2 will run
  on its own VM in a JS host.
- **Concurrency**: Swift has `async`/`await` and **actors** for
  safe shared-state concurrency today. Aether v1 has no
  concurrency; v2 plans `async`/`await` (RFC-001) but no actors.
- **Modules**: Swift has a mature module system (SwiftPM, modules,
  `import`). Aether v1 has none; v2 plans one (RFC-003).
- **Stdlib**: Swift's stdlib is large (Foundation, Collections,
  Concurrency, Dispatch). Aether's is tiny.
- **FFI**: Swift interops seamlessly with C and Objective-C.
  Aether v1 has no FFI.
- **Protocols**: Swift has `protocol` with associated types and
  default implementations. Aether has traits (planned for v2
  via RFC-006) but they're not in v1.
- **Compile target**: Swift compiles to native code (LLVM). Aether
  v1 is interpreted; v2 compiles to its own bytecode.
- **Macros**: Swift has result builders and macros (5.9+).
  Aether has a fixed set of built-in macros.

### When to choose Aether over Swift

- You want to run in a browser without a Swift-WASM compile step.
- You want a small language to read in a day — Swift's
  implementation is many millions of LOC.
- You want GC rather than ARC (no `weak`/`unowned` dances).
- You want to teach ADTs and pattern matching without the
  complexity of protocols, associated types, and result builders.

### When to choose Swift over Aether

- You need to deploy to iOS, macOS, or Apple platforms.
- You need native performance.
- You need a real protocol system with associated types.
- You need async/await and actors today.
- You need to interop with C or Objective-C.
- You need a real module system and package manager today.

---

## 8. Aether vs OCaml

### Philosophy

OCaml is **the ML family's pragmatic member** — a statically-typed,
inferred, expression-oriented language with Hindley-Milner type
inference, algebraic data types, pattern matching, and a strong
functional bias but with imperative and OO features when needed.
OCaml is the spiritual ancestor of F# and the inspiration for
Rust's type system and Aether's expression-orientation. It's used
in academia (proof assistants like Coq), in finance (Jane Street),
and increasingly for tooling (the Merlin LSP server, Dune build
system, the js_of_ocaml JS compiler).

Aether and OCaml share the most semantic DNA of any pair in this
list: HM-style inference, ADTs, pattern matching, expression-
orientation, closures. Aether is essentially "OCaml-flavored Rust
for the browser".

### Strengths

OCaml's strengths: **Hindley-Milner type inference** (the gold
standard — most programs need no annotations at all); a **mature
module system** with functors (first-class modules and module-level
computation); a **native compiler** (ocamlopt) competitive with C
for some workloads; a **fast compiler** with incremental rebuilds;
a **mature ecosystem** for formal methods (Coq, Why3, Frama-C);
**effects** (since 5.x) for delimited continuations.

### How Aether is similar

- Both are **expression-oriented** (an `if` or `match` is an
  expression that returns a value).
- Both have **algebraic data types** with payloads and
  **pattern matching** with exhaustiveness checking.
- Both have **HM-style type inference** (Aether's is bidirectional,
  which is a superset of HM).
- Both have **first-class closures** that capture their
  environment.
- Both have **`let`/`let rec`/`let mut`-ish** binding forms (OCaml
  has `let` and `let ref`; Aether has `let` and `let mut`).
- Both have **`Option<'a>` and `Result`** types in the stdlib.
- Both have a **small core** designed to be read end-to-end.

### How Aether differs

- **Memory**: Both are GC'd. Aether v1 inherits V8's GC; v2 plans
  its own tricolor generational. OCaml's GC is a generational
  mark-and-sweep with a major-heap compactor.
- **Performance**: OCaml's native compiler (ocamlopt) produces
  code competitive with C for non-floating-point-heavy workloads.
  Aether v1 is interpreted (slow); v2 will be bytecode-interpreted
  (still slower).
- **Modules**: OCaml has one of the most sophisticated module
  systems in any language (functors, first-class modules,
  `include`, `open`). Aether v1 has **no modules**; v2 plans a
  simpler module system (RFC-003) without functors.
- **Async**: OCaml 5.x has `async` via effects (a delimited-
  continuation primitive). Aether v1 has no async; v2 plans
  async/await.
- **Concurrency**: OCaml 5.x has **domains** (parallel threads)
  via the effects runtime. Aether v1 has no concurrency; v2
  plans cooperative async (no parallelism).
- **Stdlib**: OCaml's stdlib is medium-sized and supplemented by
  `base`/`core` (Jane Street) and `containers`. Aether's is tiny.
- **FFI**: OCaml has a C FFI (`external`). Aether v1 has no FFI.
- **Object orientation**: OCaml has objects and inheritance
  (rarely used). Aether has no OOP — only structs and enums.
- **Mutability**: OCaml's `let ref` is the mutable-binding form;
  Aether's `let mut` is more Rust-like.
- **Compile target**: OCaml has both a bytecode interpreter and
  a native compiler. Aether v1 is a tree-walking interpreter;
  v2 will be a bytecode VM (no native target).

### When to choose Aether over OCaml

- You want to run in a browser — OCaml requires the js_of_ocaml
  compile step (which works but is a build step).
- You want Rust-like syntax (curly braces, semicolons-as-separators)
  rather than ML-like syntax (`let … in`, `match … with`).
- You want a small language to teach without the complexity of
  functors and first-class modules.
- You want a language with built-in web playground support.

### When to choose OCaml over Aether

- You need HM-style inference everywhere (Aether requires
  struct field types and enum field types to be declared).
- You need a sophisticated module system (functors, first-class
  modules).
- You need native performance (ocamlopt).
- You need to interop with C.
- You need real concurrency (domains in 5.x).
- You need a mature FP ecosystem (Coq, Why3, base/core).

---

## 9. Aether vs Haskell

### Philosophy

Haskell is **the pure functional language** — a statically-typed,
inferred, lazily-evaluated language with monads, type classes, and
a community that values **reasoning about programs mathematically**.
Haskell is the gold standard for type system features (GADTs, type
families, existential types, higher-rank polymorphism) and for
effectful programming via monads. It's used in academia, finance
(Standard Bank, Credit Suisse), and a small but dedicated industry
niche (Facebook's Sigma, Mercury).

Aether and Haskell share ADTs, pattern matching, and type inference,
but Aether is **strict, impure, and simpler**. Aether doesn't have
monads, type classes (planned for v2 as traits), laziness, or the
advanced type-system features.

### Strengths

Haskell's strengths: a **gold-standard type system** (rank-N
polymorphism, GADTs, type families, associated types); **type
classes** (the inspiration for Rust traits and Swift protocols);
**pure functional** with **monadic effects** that let you reason
about side effects categorically; **lazy evaluation** (which can
define infinite data structures); a **mature ecosystem** for
compilers, parsers, and formal reasoning; **STM** (software
transactional memory) for concurrency.

### How Aether is similar

- Both have **algebraic data types** with payloads and **pattern
  matching** with exhaustiveness.
- Both have **HM-style type inference** (Aether's is bidirectional,
  which is a superset).
- Both have **`let` bindings** that are expressions (Aether's `let`
  is a statement, but the expression-oriented style is similar).
- Both have **first-class closures**.
- Both have a **`Maybe`/`Option`** type and an **`Either`/`Result`**
  type in the stdlib.
- Both have a **type-class/trait** concept (Aether v2 plans traits
  via RFC-006).
- Both have **type-driven dispatch** (Aether v1 uses nominal
  dispatch on enum variants; Haskell uses type classes).

### How Aether differs

- **Evaluation**: Haskell is **lazy** (call-by-need); Aether is
  **strict** (call-by-value). Lazy evaluation lets Haskell define
  infinite data structures and compose list operations efficiently,
  but makes performance hard to predict. Aether's strictness is
  more like Rust's.
- **Purity**: Haskell is **pure** (functions have no side effects
  except via monads like `IO`, `State`, `Reader`). Aether is **impure**
  (functions can mutate captured `mut` bindings, print, push to
  arrays). Aether doesn't have monads.
- **Type classes**: Haskell has a rich type class hierarchy
  (`Functor`, `Applicative`, `Monad`, `Foldable`, `Traversable`,
  `Monoid`, `Semigroup`, etc.). Aether v1 has no type classes; v2
  plans traits without the categorical hierarchy.
- **Memory**: Both are GC'd. Aether v1 inherits V8's GC; v2 plans
  its own. Haskell's GC is generational and parallel.
- **Performance**: Haskell's GHC produces competitive native code
  (with LLVM). Aether v1 is interpreted; v2 will be bytecode-
  interpreted.
- **Modules**: Haskell has a mature module system (`module …
  where …`, `import …`). Aether v1 has no modules; v2 plans a
  simpler one (RFC-003).
- **Async/concurrency**: Haskell has green threads, STM, `async`
  library, and lightweight parallelism. Aether v1 has no
  concurrency; v2 plans cooperative async.
- **Stdlib**: Haskell's base library is medium-large; containers,
  text, bytestring, vector are mature. Aether's stdlib is tiny.
- **FFI**: Haskell has a C FFI. Aether v1 has no FFI.
- **Macros/template Haskell**: Haskell has Template Haskell for
  compile-time metaprogramming. Aether has a fixed set of built-in
  macros.

### When to choose Aether over Haskell

- You want strict evaluation (predictable performance, no space
  leaks).
- You want impure functions (mutating an accumulator is fine).
- You want a smaller language — Haskell's type system is one of
  the largest in mainstream use.
- You want to run in a browser without GHCjs or Asterius.
- You don't want to explain monads to your team.

### When to choose Haskell over Aether

- You need a sophisticated type system (GADTs, type families,
  rank-N).
- You need type classes for categorical abstraction.
- You need laziness for infinite data or composition.
- You need native performance (GHC).
- You need STM or green threads for concurrency.
- You need a mature FP ecosystem (parsers, compilers, formal
  reasoning).

---

## 10. Aether vs Elixir

### Philosophy

Elixir is **the BEAM-flavored Lisp for the concurrent web** — a
dynamically-typed, functional language that runs on the Erlang VM
(BEAM) and inherits its **actor-model concurrency**, **supervision
trees**, and **hot code reloading**. Designed by José Valim as a
pragmatic Ruby-flavored syntax on top of BEAM, Elixir is the
language of Phoenix web framework, LiveView, and Nerves (embedded).
Its superpower is **fault-tolerant distributed systems** — BEAM
processes are isolated, killed on crash, and restarted by
supervisors.

Aether and Elixir are very different: Elixir is dynamic and
actor-based; Aether is static and synchronous (v1). They share a
small-language ethos but little else.

### Strengths

Elixir's strengths: a **mature actor-model runtime** (BEAM, used
in telecom for 30+ years); **supervision trees** for fault
tolerance; **hot code reloading** (deploy without restart);
**macro system** (real metaprogramming via Elixir macros); **Phoenix
LiveView** (real-time web without writing JS); **mature tooling**
(Mix, ExUnit, IEx).

### How Aether is similar

- Both favor a small, readable surface area.
- Both have first-class functions and closures.
- Both have pattern matching (Elixir's `case`/`with`/function-head
  matching is more pervasive than Aether's `match`).
- Both have `Enum.map`/`Enum.filter`/`Enum.reduce` (Aether has
  `map`/`filter`/`reduce` as inline builtins — directly inspired
  by Elixir/ML/Rust).
- Both have string interpolation (`"#{x}"` in Elixir; `f"{x}"` in
  Aether).

### How Aether differs

- **Type discipline**: Elixir is **dynamic** (no static types,
  Dialyzer is optional and conservative). Aether is **static**,
  with bidirectional inference.
- **Concurrency**: Elixir has **processes** (BEAM actors, millions
  per node) and **message passing**. Aether v1 has no
  concurrency; v2 plans cooperative async (no actor model).
- **Memory**: Both are GC'd. Elixir uses BEAM's per-process GC
  (no stop-the-world pauses — each process collects independently).
  Aether v1 inherits V8's GC; v2 plans a tricolor generational
  collector.
- **Performance**: BEAM is a register-based bytecode VM that's
  fast for I/O-heavy workloads and okay for CPU-bound ones. Aether
  v1 is interpreted; v2 will be bytecode-interpreted (similar
  shape to BEAM but no per-process GC).
- **Modules**: Elixir has a mature module system (`defmodule`,
  `def`, `defp`, `import`, `alias`, `use`). Aether v1 has no
  modules; v2 plans one (RFC-003).
- **Stdlib**: Elixir's stdlib is **large** (Enum, Stream, Map,
  Keyword, List, String, IO, File, System, Registry, Supervisor,
  Task, Agent, GenServer). Aether's is tiny.
- **Macros**: Elixir has a powerful macro system (quote/unquote,
  `defmacro`). Aether has a fixed set of built-in macros.
- **Pattern matching**: Elixir's pattern matching is everywhere
  (function heads, `case`, `with`, `receive`). Aether's is only
  in `match` expressions.
- **Fault tolerance**: Elixir/BEAM has supervision trees,
  restarts, and "let it crash" philosophy. Aether v1 has `panic`
  that aborts the program; v2 plans structured error handling
  via `Result`/`?`.
- **FFI**: Elixir has NIFs (native implemented functions) for C
  calls. Aether v1 has no FFI.

### When to choose Aether over Elixir

- You want static types (Elixir is dynamic; Dialyzer is optional).
- You want ADTs with exhaustiveness (Elixir uses tagged tuples,
  which work but aren't exhaustiveness-checked).
- You want to run in a browser (Elixir requires a server).
- You want a small language to teach types and ADTs.

### When to choose Elixir over Aether

- You need to build a fault-tolerant distributed system.
- You need real concurrency (millions of processes).
- You need a mature web framework (Phoenix, LiveView).
- You need hot code reloading.
- You need to interop with the Erlang ecosystem (OTP, Mnesia, etc.).
- You need a real module system and package manager.

---

## 11. Aether vs Julia

### Philosophy

Julia is **the language for technical computing** — a dynamically-
typed, JIT-compiled, multiple-dispatch language designed to be
"as fast as C, as easy as Python, as powerful as Lisp". Its
superpower is **multiple dispatch** (methods are selected by the
runtime types of all arguments, not just one), which makes it
natural to express mathematical operations on diverse types. Julia
is used in scientific computing, ML (Flux.jl), optimization
(JuMP.jl), and data science (DataFrames.jl).

Aether and Julia share almost no niche — Julia is dynamic and
numerical; Aether is static and general-purpose. They're listed
here for completeness; the comparison is brief.

### Strengths

Julia's strengths: **multiple dispatch** (clean, extensible
polymorphism); **JIT compilation** via LLVM (near-C performance
for numerical code); **first-class types** (types are values, can
be passed to functions, inspected at runtime); **unicode
identifiers** (mathematical notation directly in source);
**mature scientific ecosystem** (DifferentialEquations.jl,
Plots.jl, DataFrames.jl, Flux.jl).

### How Aether is similar

- Both have **first-class functions** and **closures**.
- Both have **`for x in iter`** syntax (Julia: `for x in iter`,
  Aether: `for x in iter`).
- Both have **type annotations** that are optional in some
  positions (Julia is dynamic with optional annotations; Aether
  is static with inference in some positions).
- Both have **`begin … end`** blocks (Aether uses `{ … }` but the
  concept is similar).

### How Aether differs

- **Type discipline**: Julia is **dynamic** with optional type
  annotations and JIT specialization. Aether is **static** with
  bidirectional inference and no runtime dispatch on types.
- **Dispatch**: Julia has **multiple dispatch** (methods selected
  by all argument types). Aether v1 has **single dispatch** via
  function overloading by arity (no method dispatch on types);
  v2 plans traits (single-dispatch via trait bounds).
- **Memory**: Both are GC'd. Julia uses a mark-sweep GC; Aether
  v1 inherits V8's GC; v2 plans tricolor generational.
- **Performance**: Julia JIT-compiles via LLVM and is competitive
  with C for numerical code. Aether v1 is interpreted; v2 will be
  bytecode-interpreted.
- **Numerics**: Julia has first-class numeric tower (BigFloat,
  Complex, Rational, DualNumbers, AutomaticDifferentiation).
  Aether has `int` and `float` and `sqrt`; that's it.
- **Modules**: Julia has a mature module system (`module … end`,
  `using`, `import`). Aether v1 has no modules; v2 plans one.
- **Stdlib**: Julia's stdlib is large (LinearAlgebra, Statistics,
  Dates, Distributed, Pkg, REPL). Aether's is tiny.
- **Async/concurrency**: Julia has `Tasks` (coroutines) and
  multi-threading. Aether v1 has no concurrency; v2 plans
  cooperative async.
- **FFI**: Julia has `ccall` for C functions. Aether v1 has no
  FFI.
- **Macros**: Julia has a macro system (`@macro ...`). Aether has
  a fixed set of built-in macros.

### When to choose Aether over Julia

- You want static types (Julia is dynamic).
- You want a small language to teach types and ADTs.
- You want to run in a browser (Julia requires a server or a
  WASM compile step).

### When to choose Julia over Aether

- You need numerical performance (LLVM JIT).
- You need multiple dispatch.
- You need the scientific ecosystem (DataFrames, Flux,
  DifferentialEquations).
- You need to interop with C.
- You need a real module system and package manager.
- You need to write long-running numerical services.

---

## 12. Conclusion: Aether's Place in the Language Ecosystem

Aether v0.1 is **not a production language**. It is a teaching,
exploration, and playground language — the smallest statically-
typed language that hits a useful point in the design space. Its
v1 implementation is a tree-walking interpreter written in
TypeScript, runs entirely in the browser, and inherits the JS
engine's GC. Its type system has the core features of a modern ML-
family language — algebraic data types, pattern matching with
exhaustiveness, generics, closures, and bidirectional inference —
without the bells and whistles (no traits, no functors, no type
classes, no macros, no async, no modules).

Aether is not a Rust replacement. Rust has a borrow checker,
native code, a real module system, a real package manager, a real
concurrency story, and a real ecosystem. Aether has none of those.
It can be a Rust *learning step*: someone who learns `enum`,
`match`, `Result`, `?`, and `Option` in Aether will recognize them
immediately in Rust, without fighting the borrow checker.

Aether is not a TypeScript replacement. TypeScript has the JS
ecosystem, gradual typing, mature tooling, and a 30-year runtime.
Aether has a tiny stdlib, no modules, and no npm. It can be a
TypeScript *learning complement*: someone who wants stricter types
than TS's gradual ones, or who wants real ADTs with exhaustiveness
checking, can experiment with Aether in the playground and take
the patterns back to TS.

Aether's niche is: **a typed language you can run in a browser
without an install step, read end-to-end in an afternoon, and use
to teach or explore algebraic data types, pattern matching, and
expression-orientation**. It is the language you reach for when
you want to write a small DSL, prototype a typed algorithm, or
show a colleague what an ADT is — and you don't want to fight
cargo, npm, opam, or stack overflows.

The v2 roadmap (RFCs 001-005) will add async, a module system, a
bytecode VM, and an LSP. Those will move Aether closer to OCaml
and Swift in capability. The teaching mission will remain: a small
language you can read end-to-end, with a spec small enough to read
in a day. Aether will not become Rust, will not become TypeScript,
will not become Swift. It will remain Aether — a small, typed,
browser-runnable teaching language that gets the core right.
