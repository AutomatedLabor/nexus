# Chapter 1 — Introduction

> Aether is a small, statically-typed, expression-oriented programming language with ML, Rust, and TypeScript influences. It runs today in two implementations: a tree-walking interpreter (v1) and a bytecode VM (v2). Both work. 1455 tests pass. This chapter is about what Aether *is*, why it exists, and how you can try it in 30 seconds.

---

## 1.1 What Aether is

Aether is a language for *teaching* and *exploring* what a "small but real" programming language looks like. It is not a production language; it has no ecosystem, no native compiler, no package registry — yet. It is, however, real in the sense that its compiler is built, its type checker is built, its tree-walking interpreter is built, its bytecode VM is built, its 18-module standard library is built, and its 1455-test suite passes. The playground runs in any modern browser. The CLI runs on Node or Bun.

The language has opinions:

- **Statically typed**, with Hindley-Milner-style inference for `let` bindings and generic instantiation for function calls. You can write `let x = 42` and the compiler infers `int`. You can write `let x: int = 42` and the compiler checks it. Both are valid.
- **Expression-oriented**, with `if/else`, `match`, and blocks all being expressions. `let x = if cond { 1 } else { 2 };` works. `match` is a real expression, not a glorified switch statement.
- **ML/Rust/TS influences.** ML: expression-orientation, `Option`/`Result`, pattern matching, type inference. Rust: ownership-by-RC (planned borrow checker in v2.2), `enum` ADTs, `?` operator. TypeScript: the syntax (mostly), the curly-brace-and-semicolon surface, the structural function types.
- **Two execution backends that agree.** v1 is a tree-walker; v2 is a stack-based bytecode VM with eight optimizer passes. Both run the same Aether programs. 13/15 canonical examples produce identical output. The two exceptions are the most exotic (regex backtracking and one deep-recursion benchmark) and have known root causes — see Chapter 9.

Aether is *not*:

- A replacement for Rust or TypeScript. It's a learning language, an experiment.
- A complete language. v2 is still adding features (WASM backend, native backends, borrow checker, full LSP, package manager are all planned — see §1.6).
- A "scripting" language in the duck-typing sense. It's statically typed. Python programmers used to `x = 42` then `x = "hi"` will be disappointed.

---

## 1.2 Why Aether exists

Aether exists for three reasons:

### 1.2.1 To teach "how a language works" without drowning in implementation

Most "implement a language" tutorials end at a calculator or a lisp. They skip types, or they skip a real standard library, or they skip a real VM. The result is that the student never sees how a *real* language comes together — the trade-offs, the cost of generics, the cost of pattern matching, the cost of a 30-module standard library. Aether is small enough to read in a weekend (the core is ~12k lines of TypeScript) but real enough that "how do you do `Result<T, E>`" is not hand-waved.

### 1.2.2 To explore the "two backends, one language" design space

Modern language implementations often have multiple backends: an interpreter for REPL and debug, a bytecode VM for production, an IR-based JIT for hot code, a native backend for AOT. Most teaching languages pick one. Aether deliberately keeps both: v1's tree-walker and v2's bytecode VM coexist, share an AST, share a type checker, and pass the same test suite. The design choice "which backend for which scenario" is then a live question — and one this book answers in Chapter 15.

### 1.2.3 To make the cost of features visible

Every feature in Aether has an implementation cost: lexer complexity, parser complexity, type-checker complexity, IR shape, VM opcode count, optimizer pass interaction, stdlib surface area. By keeping the language small and the implementation readable, the *cost* of adding (say) `async/await` becomes something you can see in the diff. The five new ADRs in `docs/decisions/` and three new RFCs in `docs/rfcs/` are an attempt to make these trade-offs explicit.

---

## 1.3 The v1 / v2 story

Aether was designed in two stages, but both stages ship today. There is no "v1 branch" — the v1 implementation and the v2 implementation live in the same repository and pass the same tests.

### v1 — the tree-walking interpreter

`aether/core/eval/eval.ts` is a 2k-line tree-walker. It takes a parsed AST and walks it, evaluating each node. There is no compilation step; there is no IR. The evaluator handles:
- All expressions: literals, operators, `if`, `match`, blocks, calls, indexing, field access, tuple access, casts, `?`, `range`, lambda.
- All statements: `let`, `let mut`, `const`, `fn`, `enum`, `struct`, type alias, `for`/`while`, `break`/`continue`, `return`, assignment, expression-statement.
- All inline builtins: `print`, `println`, `range`, `len`, `type_of`, `assert`, `assert_eq`, `panic`, `str`, `int`, `float`, `min`, `max`, `abs`, `sqrt`, `push`, `pop`, `map`, `filter`, `reduce`.
- A `PanicSignal` mechanism for unwinding on runtime errors. `panic(msg)` throws a `PanicSignal`; the top-level run loop catches it and converts it into a runtime error report.
- A step counter (default 1M, configurable) so infinite loops terminate.

### v2 — the bytecode VM

`aether/vm/` is the v2 implementation. The pipeline is:

```
  Source text
       │
       ▼
   Lexer ──► tokens
       │
       ▼
    Parser ──► AST
       │
       ▼
  Type checker (sema) ──► typed AST
       │
       ▼
  IR builder ──► IR (register-numbered, see ADR-12)
       │
       ▼
  8 optimizer passes (constant folding, DCE, CSE, inlining, TCO, LICM, strength reduction, branch simplification)
       │
       ▼
  Codegen ──► bytecode (80+ opcodes, see ADR-11)
       │
       ▼
  Stack-based VM interpreter
```

The v2 VM runs the same Aether source as v1. The playground has a toggle. The CLI has `aether run` (v1) and `aether run:vm` (v2). `fib(15) = 610` via either backend; the VM is faster (see Chapter 9 for the benchmark numbers).

### What's in v2 today

- **Bytecode VM.** Stack-based, ~80 opcodes, codegen from IR. Chapter 9 is the deep dive.
- **Eight optimizer passes.** Constant folding, dead-code elimination, common subexpression elimination, inlining, tail-call optimization, loop-invariant code motion, strength reduction, branch simplification. Chapter 10 walks through each.
- **Async runtime.** Channels, `select`, `timeout`, `spawn`. Chapter 12.
- **Module system.** `import { foo } from "./mod.ae";`, `pub fn`, `pub const`, `pub use`. Chapter 11.
- **CLI.** `aether run`, `run:vm`, `check`, `test`, `fmt`, `repl`, `new`, `build`. Chapter 13.
- **Formatter.** Idempotent, brace-depth-based indentation. Chapter 13.
- **Linter.** 30 rules (in progress). Chapter 13.

### What's planned for v2.x

- **WASM backend.** Compile Aether to WebAssembly so the playground runs without a JS interpreter. RFC-006.
- **Native backends.** LLVM or Cranelift backend for AOT compilation. RFC pending.
- **Borrow checker.** Move from RC-based ownership to borrow-checked ownership, Rust-style. RFC-004.
- **Full LSP.** Language Server Protocol support for VS Code, Neovim, Zed, Helix. RFC-007.
- **Package manager.** `aether.toml`, `aether add`, a registry. RFC-008.

The 1455 passing tests are the floor. Everything in v2 today is real and tested; everything in v2.x is designed but not built.

---

## 1.4 Who Aether is for

Aether is for:

- **Compiler-curious developers.** If you've read *Crafting Interpreters* or *Types and Programming Languages* and want to see what a slightly-larger-than-tutorial language looks like, with a real type checker and a real VM, Aether is for you. The whole implementation is ~25k lines of TypeScript and you can read it end to end.
- **Educators.** Aether's design — explicit v1/v2 split, explicit ADRs for every major decision, RFCs for future work, 1455 tests, a 60+ entry error catalog — is meant for teaching. You can assign "add a string-repeat optimizer pass" or "add a `zip3` stdlib function" as a week-long project; the test infrastructure and the docs make the contribution path clear.
- **People who want to see "small but real."** The playground is a single route, runs in any browser, has examples, a stdlib browser, a benchmarks view. You can be writing Aether in 30 seconds.

Aether is *not* for:

- **Production use.** There is no ecosystem. No `cargo`. No `npm`. The language is sound but the tooling is incomplete.
- **Performance-critical work.** Aether's VM is faster than its tree-walker, but it's not LuaJIT, it's not V8, it's not even close. Chapter 9's benchmark section is honest about this.
- **People who hate semicolons.** Aether has them. The formatter normalizes them. Chapter 13.

---

## 1.5 How to try it

You have three options.

### Option A — the playground (zero install)

Open the playground URL in any modern browser. The default view is the Playground; type Aether source in the editor on the left, hit Run, see output on the right. The Errors tab shows lex/parse/type/runtime errors. The Stats tab shows step count and elapsed milliseconds. The Examples view has 17 canned programs (Fibonacci, FizzBuzz, Quicksort, Brainfuck interpreter, JSON parser, Linked list, Binary tree, Game of Life, Calculator, Number guessing, Primes, String utils, Expression formatter, Matrix ops, Todo CLI, and a couple of module-system examples).

Toggle the "VM" checkbox to run on the v2 bytecode VM instead of the v1 tree-walker. The output should be identical for 13/15 examples; the two exceptions are noted in the benchmarks view.

### Option B — the CLI (Node or Bun)

Clone the repo. From the project root:

```bash
# tree-walker (v1)
bun aether/tools/cli/cli.ts run examples/fibonacci.ae

# bytecode VM (v2)
bun aether/tools/cli/cli.ts run:vm examples/fibonacci.ae

# type-check only
bun aether/tools/cli/cli.ts check examples/fibonacci.ae

# interactive REPL
bun aether/tools/cli/cli.ts repl

# scaffold a new project
bun aether/tools/cli/cli.ts new myproj
```

The CLI is a single file (`aether/tools/cli/cli.ts`, ~600 lines) with no external dependencies beyond the compiler core. Chapter 13 covers it in depth.

### Option C — embed Aether in your own TypeScript project

`aether/core/index.ts` exports `compileAndRun(source)` and `compileToVm(source)`. Both return `{ output, errors, stats }`.

```typescript
import { compileAndRun, compileToVm } from "aether/core";

const src = `
  fn fib(n: int) -> int { if n < 2 { n } else { fib(n-1) + fib(n-2) } }
  print(fib(15));
`;

const r1 = compileAndRun(src);     // tree-walker
const r2 = compileToVm(src);       // bytecode VM
console.log(r1.output);            // "610"
console.log(r2.output);            // "610"
console.log(r2.stats.steps);      // ~150
```

This is what the playground does internally (`src/lib/aether-worker.ts`). You can use the same API to embed Aether in a build script, a test runner, or a custom REPL.

---

## 1.6 The shape of this book

This book is 15 chapters. They're meant to be read in order, but each is self-contained enough that you can jump in.

1. **Chapter 1 — Introduction** (this one).
2. **Chapter 2 — Your first program.** Hello world, variables, types, the compile pipeline, reading errors, the playground UI.
3. **Chapter 3 — Control flow.** `if`/`else` as expression, `while`, `for in`, `match` (deep), `break`/`continue`, early return vs expression-style.
4. **Chapter 4 — Functions and closures.** `fn`, params, return types, generics, closure capture, recursion, the call stack.
5. **Chapter 5 — Data structures.** Structs, enums (ADTs), tuples, arrays, maps, pattern matching for each.
6. **Chapter 6 — Types and generics.** Primitives, tuples, arrays, maps, enums, `Option`, `Result`, generics, type inference, numeric widening, type aliases.
7. **Chapter 7 — Error handling.** `Result`, `?`, `panic` vs error, match on `Result`, propagation, the error catalog.
8. **Chapter 8 — Standard library tour.** 18 modules, 1-2 examples each.
9. **Chapter 9 — The bytecode VM.** AST → IR → bytecode → interpreter, the 80+ opcodes, why a VM, perf vs tree-walker, benchmark numbers.
10. **Chapter 10 — Optimization passes.** The 8 passes with before/after IR examples.
11. **Chapter 11 — Modules and packages.** `import`, `pub`, file resolution, cycles, `aether.toml`, the package manager vision.
12. **Chapter 12 — Async and concurrency.** The async runtime: `spawn`, channels, `select`, `timeout`, the v2 suspend/resume plan, structured concurrency.
13. **Chapter 13 — Tooling.** CLI commands, formatter rules, linter rules, planned LSP, test runner, docgen.
14. **Chapter 14 — Writing idiomatic Aether.** 20 patterns + 20 anti-patterns.
15. **Chapter 15 — Internals and contributing.** The compiler pipeline, the AST, the IR, the VM, how to add a language feature, how to add a stdlib function, the 3× test/doc/bench rule, the contributor guide.

The reference material is separate: `docs/reference/api-reference.md` (the stdlib API), `docs/reference/error-catalog.md` (60+ error messages with cause/fix/example), `docs/reference/glossary.md`, `docs/reference/comparison.md`, `docs/reference/faq.md`. The `docs/decisions/` directory has 15 ADRs (10 v1, 5 new for v2). The `docs/rfcs/` directory has 8 RFCs (5 v1-era, 3 new for v2.x).

---

## 1.7 Eight runnable examples to close the chapter

To give you the flavor of the language, here are eight short programs that all run on both backends. The intent is that by the end of these examples you can read Aether; the rest of the book will explain *why* it works.

**1. Hello, world.**

```aether
print("Hello, World!");
```

**2. Variables and arithmetic.**

```aether
let x: int = 42;
let mut y: float = 3.14;
const PI: float = 3.14159;
y = y + x as float;
print(f"x = {x}, y = {y}, PI = {PI}");
```

**3. A function with generics.**

```aether
fn id<T>(x: T) -> T { x }
fn add(a: int, b: int) -> int { a + b }
print(id(42));
print(add(1, 2));
```

**4. The `Option` enum and pattern matching.**

```aether
enum Option<T> { Some(T), None, }
fn double(o: Option<int>) -> int {
  match o {
    Option::Some(v) => v * 2,
    Option::None => 0,
  }
}
print(double(Option::Some(21)));   // 42
print(double(Option::None));        // 0
```

**5. A `while` loop with mutation.**

```aether
let mut acc = 0;
let mut i = 0;
while i < 10 { acc = acc + i; i = i + 1; }
print(acc);   // 45
```

**6. A `for in` loop over a range.**

```aether
for i in range(0, 5) {
  print(f"i = {i}");
}
```

**7. Closures and higher-order functions.**

```aether
let nums = [1, 2, 3, 4, 5];
let doubled = map(nums, fn(x: int) -> int { x * 2 });
let sum = reduce(nums, fn(a: int, x: int) -> int { a + x }, 0);
print(doubled);   // [2, 4, 6, 8, 10]
print(sum);       // 15
```

**8. Recursive Fibonacci (with a step-budget note).**

```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
print(fib(15));   // 610 — runs in either backend in <1ms
```

These eight examples cover most of Aether's surface: literals, arithmetic, generics, enums, pattern matching, loops, closures, higher-order functions, recursion, and `f"..."` string interpolation. The remaining 14 chapters expand on each.

---

## 1.8 Summary

- Aether is a small, statically-typed, expression-oriented language.
- It has two backends: a v1 tree-walker and a v2 bytecode VM. Both work; 1455 tests pass.
- The standard library has 18 modules and ~396 functions.
- The v2 stack adds an optimizer (8 passes), an async runtime, a module system, a CLI, a formatter, and a linter.
- v2.x plans: WASM backend, native backends, borrow checker, full LSP, package manager.
- You can try Aether in 30 seconds via the playground, the CLI, or by embedding `aether/core` in a TypeScript project.

The next chapter is the 30-second "Hello, World" — variables, types, the compile pipeline, and how to read the playground's error messages. Read on.
