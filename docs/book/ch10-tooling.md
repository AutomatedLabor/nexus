# Chapter 10 — Tooling

> Aether v2 ships with a CLI, an idempotent formatter, a 30-rule linter, an in-progress LSP, 8 optimizer passes, an async runtime, and a module system. This chapter is the one-stop tour: what each tool does, how to invoke it, and how they cooperate. By the end you should be able to take a fresh checkout, scaffold a project, lint it, format it, compile it to bytecode, run it on the VM, and write a multi-module program with async tasks — without leaving the `aether` CLI.

The 1597-test suite covers the language, the stdlib, the VM, and the tooling itself. The formatter has 35 idempotency examples in its own test file; the linter has its own corpus; the optimizer passes each have before/after IR tests.

---

## 10.1 The CLI

`aether/tools/cli/cli.ts` is the standalone `aether` CLI. Run it with `bun aether/tools/cli/cli.ts` (or `node`/`tsx` after a build). The commands:

```
aether run <file.ae>              Compile + run on the v1 tree-walker.
aether run:vm <file.ae>          Compile + run on the v2 bytecode VM.
aether check <file.ae>           Compile + print type errors only.
aether test <dir>                Discover + run *.test.ae / *.ae with assert.
aether fmt <file.ae> [--check]   Re-indent based on brace depth (writes file).
                                 With --check, exit 1 if the file would change.
aether repl                       Interactive REPL (or read stdin if piped).
aether new <name>                Scaffold a new project.
aether build <file.ae> -o <out>   Compile to bytecode + write assembled binary.
aether help                       Print the usage message.
```

Exit codes are 0 (success), 1 (compile/runtime/test failure), or 2 (CLI usage error: unknown command, missing arg, file not found).

### 10.1.1 Five CLI invocations you'll use every day

```bash
# 1. Run on the tree-walker (v1)
$ aether run examples/fibonacci.ae
== Fibonacci implementations ==
  n  |  recursive  |  iterative  |  memoized
-----+-------------+-------------+-------------
  15 |  610        |  610        |  610

# 2. Run on the bytecode VM (v2)
$ aether run:vm examples/fibonacci.ae
# (same output, faster — see Chapter 9 for the 1.88x sum-50k number)

# 3. Type-check only — no execution
$ aether check examples/fibonacci.ae
# (no output if clean; otherwise the type errors, one per line)

# 4. Run a test directory
$ aether test examples/
12 passed, 0 failed

# 5. Format in place
$ aether fmt examples/fibonacci.ae
```

### 10.1.2 Scaffold and build

```bash
$ aether new myproject
Created myproject/
  myproject/main.ae
  myproject/README.md
  myproject/aether.toml

$ aether build myproject/main.ae -o myproject/main.bin
Wrote myproject/main.bin (3.2k bytes)
```

`aether build` produces a self-contained bytecode blob (header + constant pool + instruction table). A future runtime can `mmap` the file and dispatch directly without lexing, parsing, type-checking, or compiling — see Chapter 9.

---

## 10.2 The formatter

`aether/tools/formatter/formatter.ts` is Aether's formatter. The single rule that matters most: **idempotency**. Running `aether fmt` twice on the same file produces the same output as running it once. The test suite (`formatter.test.ts`) verifies this on a corpus of 35 examples — each one is fed through the formatter twice and the two outputs are compared byte-for-byte.

The formatting rules are deliberately small:

- **Indentation:** 2 spaces per brace-depth level. The formatter tracks `{` and `}` depth — parens and brackets don't affect indentation (because they're not block delimiters).
- **Semicolons:** always add `;` after statements that need them; remove `;;` and trailing `;` after `}`.
- **Spaces:** one space after `,`, after `:` in type annotations, around binary operators, around `=>` in match arms; no space around `.`, `::`, or `[]`.
- **Trailing commas:** added in multi-line lists; not added in single-line lists.
- **Empty lines:** at most one consecutive; none at the top or bottom of a block; one between top-level declarations.

### 10.2.1 An idempotency example

```aether
// Before (hand-written, ugly)
fn f(x:int,y:int)->int{x+y}
let p = Point{x:1,y:2};

// After aether fmt (first run)
fn f(x: int, y: int) -> int { x + y }
let p = Point { x: 1, y: 2 };

// After aether fmt (second run — identical)
fn f(x: int, y: int) -> int { x + y }
let p = Point { x: 1, y: 2 };
```

### 10.2.2 What the formatter doesn't do

It does *not* re-wrap long lines (no length limit is enforced), reorder imports, reorder struct fields, reorder enum variants, or rewrite comments beyond indenting them. The "don't reorder fields/variants" rule is deliberate: field and variant order is semantically meaningful in Aether (tuples destructure by position; enums dispatch by variant).

### 10.2.3 CI mode

`aether fmt --check <file>` exits with code 1 if the file *would* change. This is the form to wire into pre-commit hooks and CI:

```bash
$ aether fmt --check examples/*.ae && echo "all formatted"
all formatted

$ aether fmt --check examples/messy.ae
examples/messy.ae would change (12 lines)
exit 1
```

---

## 10.3 The linter

`aether/tools/linter/linter.ts` is Aether's linter. It has 30 rules across five categories. Some are implemented; the full set is on track for v2.1.

### 10.3.1 Style (6 rules)

`unused-mut`, `unused-binding`, `unused-parameter`, `unnecessary-semicolon`, `double-semicolon`, `trailing-comma`. Example: a `let mut cache = 0;` that's never reassigned should be `let cache = 0;`.

### 10.3.2 Correctness (4 rules)

`unreachable-code` (after `return`/`break`/`continue`/`panic`), `match-arms-after-wildcard`, `if-else-unnecessary` (`if c { true } else { false }` → `c`), `if-always-true`.

### 10.3.3 Suspicious patterns (6 rules)

`float-equality` (`f == 0.0` is fragile), `int-division-by-zero`, `modulo-by-zero`, `empty-array-len` (`len([])` is the constant 0), `infinite-loop` (`while true {}` with no `break`), `match-non-exhaustive` (no `_` arm and not all variants listed).

### 10.3.4 Performance (3 rules)

`string-concat-in-loop` (O(n²) string building; suggest `join`), `map-filter-chain` (`map(filter(xs, …), …)` — filter first to avoid wasted map work), `repeated-len-in-loop` (`while i < len(xs) {}` recomputes `len` each iteration).

### 10.3.5 Idiomatic (5 rules)

`prefer-option-result` (don't use `null`/`panic` for expected failure), `prefer-pattern-match` (chain of `if x is Some` → `match`), `prefer-for-over-while` (`let mut i = 0; while i < n {…; i = i + 1}` → `for i in range(0, n) {…}`), plus two more.

### 10.3.6 Code the linter flags

A short Aether program that triggers four different rules at once:

```aether
let mut cache = 0;                 // unused-mut: never reassigned, suggest `let`
let unused = 42;                    // unused-binding: never read
fn f(x: int) -> int {
  return x;                         // unreachable-code (anything after this)
  print("never runs");              //   is flagged here
}
let mut s = "";
for i in range(0, 10) {
  s = s + i;                        // string-concat-in-loop: O(n²), suggest join
}
print(s);
```

### 10.3.7 Running the linter

```bash
$ aether lint examples/messy.ae
examples/messy.ae:1:1   warning  unused-mut           binding `cache` is never reassigned
examples/messy.ae:2:1   warning  unused-binding       binding `unused` is never read
examples/messy.ae:4:3   warning  unreachable-code     statement after `return`
examples/messy.ae:8:5   warning  string-concat-in-loop  O(n^2) string concat, suggest join
4 warnings
```

The linter walks the AST; it doesn't run the type checker. That makes it fast (~1ms per file) and lets it flag patterns the type checker would happily accept.

---

## 10.4 The LSP (in progress)

Aether v2.x targets a full LSP (Language Server Protocol) implementation, tracked in RFC-007. The LSP will be a separate Node/Bun process talking JSON-RPC to your editor. The planned capabilities:

- **Diagnostics** — lex/parse/type errors inline.
- **Hover** — type info on hover.
- **Autocompletion** — names, keywords, types, stdlib functions (sourced from `STDLIB_MANIFEST` in `aether/stdlib/index.ts`).
- **Go-to-definition** — jump to the declaration, including across modules.
- **Find-references** — all uses of a name.
- **Document symbols** — outline view.
- **Formatting** — `textDocument/formatting` (delegated to the formatter).
- **Semantic tokens** — syntax highlighting beyond what TextMate grammars can do.
- **Rename refactoring** — rename a symbol everywhere.
- **Code actions** — quick fixes for linter suggestions (e.g., add `mut`, drop unused param).
- **Inlay hints** — parameter names and inferred types.

The first editor supported will be VS Code (via a small extension); Neovim, Zed, Helix, and Emacs will follow via the standard LSP protocol. The LSP reuses the existing lexer/parser/sema; the new work is the JSON-RPC wiring, the file-watch loop, and the in-memory document cache.

---

## 10.5 The 8 optimizer passes

`aether/core/opt/index.ts` runs 8 passes in a fixed order on the IR before codegen. Each pass is a small, focused transformation; the order matters because earlier passes expose opportunities for later ones.

```
IR (from the IR builder)
    │
    ▼
1. constantFolding   — fold arithmetic on constants
2. dce                — strip dead code exposed by (1)
3. cse                — collapse redundant expressions
4. inlining           — inline small functions
5. tco                — mark tail calls (no stack growth in future v2.x VM)
6. licm               — hoist loop-invariant code now that inlining is done
7. strengthReduction  — replace expensive multiplies with shifts (late)
8. branchSimplification — collapse constant branches and merge trivial blocks
    │
    ▼
Optimized IR ──► codegen ──► bytecode
```

### 10.5.1 constantFolding

`aether/core/opt/constant-folding.ts`. Folds `Add(LoadInt 1, LoadInt 2)` → `LoadInt 3`. Does *not* fold NaN comparisons.

### 10.5.2 dce (dead-code elimination)

`aether/core/opt/dce.ts`. Strips instructions whose results are never read. Constant folding typically exposes dead code; DCE removes it.

### 10.5.3 cse (common-subexpression elimination)

`aether/core/opt/cse.ts`. If `Add(r1, r2)` appears twice with the same operands and no intervening side effect, the second one is replaced with a reference to the first.

### 10.5.4 inlining

`aether/core/opt/inlining.ts`. Inlines small functions (default: bodies ≤ 10 IR instructions and ≤ 3 call sites). After inlining, the inlined body is re-run through constantFolding and dce to clean up.

### 10.5.5 tco (tail-call optimization)

`aether/core/opt/tco.ts`. Marks calls in tail position so a future VM (v2.x) can reuse the frame instead of pushing a new one. The current VM still pushes; the marker is forward-looking.

### 10.5.6 licm (loop-invariant code motion)

`aether/core/opt/licm.ts`. Hoists loop-invariant computation out of the loop body. Runs after inlining so the loop structure is stable.

### 10.5.7 strengthReduction

`aether/core/opt/strength-reduction.ts`. Replaces `Mul(x, LoadInt 2)` with `Shl(x, 1)`, and similar. Runs late so the operand shape is stable.

### 10.5.8 branchSimplification

`aether/core/opt/branch-simplification.ts`. Collapses `if true { A } else { B }` to `A`; merges trivial blocks (a block that just jumps to another block).

### 10.5.9 An optimizer walk-through

```aether
fn double(n: int) -> int { n * 2 }
let x = double(21);
print(x);
```

After IR build, the IR has a `Call` to `double`, which has a body `Mul(n, 2)`. After **inlining**, the call is replaced with `Mul(LoadInt 21, LoadInt 2)`. After **constantFolding**, that becomes `LoadInt 42`. After **dce**, the `double` function is removed (no remaining call sites). The codegen emits a single `LoadInt 42` followed by `Print`. The VM runs two instructions.

### 10.5.10 A constant-folding before/after

Source:

```aether
let a = 1 + 2 * 3;
let b = a * 4;
print(b);
```

Before optimization (post-IR-build):

```
L0: LoadInt r0, 1
L1: LoadInt r1, 2
L2: LoadInt r2, 3
L3: Mul r3, r1, r2          // 2 * 3 = 6
L4: Add r4, r0, r3          // 1 + 6 = 7   (this is `a`)
L5: LoadInt r5, 4
L6: Mul r6, r4, r5          // a * 4       (this is `b`)
L7: CallBuiltin "print", r6
L8: Return
```

After constantFolding + dce:

```
L0: LoadInt r6, 28          // 1 + 2 * 3 * 4 = 28
L1: CallBuiltin "print", r6
L2: Return
```

Eight instructions become three. The VM dispatches three opcodes instead of eight.

### 10.5.11 Re-running the pipeline

The pipeline reaches a fixpoint in one pass for almost all real code. For aggressive pipelines you may re-run `DEFAULT_PASSES` 2-3 times; the fixpoint passes will no-op on the second run.

---

## 10.6 The async runtime

Aether v2 has an async runtime in `aether/stdlib/async/index.ts` and `aether/vm/async/async.ts`. It is *cooperative* — there are no preemptive threads — and it is built on JS Promises (see ADR-13). The 16 async functions:

- `channel()`, `send(ch, v)`, `recv(ch)`, `close(ch)`, `select(ops, timeout?)`.
- `timeout(ms)`, `spawn(fn)`, `awaitAll(ps)`, `race(ps)`.
- `mapAsync(arr, fn)`, `filterAsync(arr, fn)`, `reduceAsync(arr, fn, init)`.
- `defer(fn)`, `retry(n, fn)`, `debounce(fn, ms)`, `runAsync(fn)`.

### 10.6.1 Five runnable async examples

```aether
// 1. spawn + await
let p = spawn(fn() -> int { 1 + 1 });
print(await(p));    // 2

// 2. timeout
await(timeout(100));
print("waited 100ms");

// 3. channel send/recv
let ch = channel();
send(ch, 42);
print(await(recv(ch)));   // 42

// 4. retry
let attempt = 0;
let result = await(retry(3, fn() -> int {
  attempt = attempt + 1;
  if attempt < 3 { panic("boom") } else { attempt }
}));
print(result);    // 3

// 5. mapAsync — sequential async map
let xs = [1, 2, 3];
let doubled = await(mapAsync(xs, fn(x: int) -> Promise<int> {
  spawn(fn() -> int { x * 2 })
}));
print(doubled);   // [2, 4, 6]
```

Note: Aether's async functions are *not* callable from the v1 sync evaluator (the stdlib's `registerAll` deliberately skips `Async.register`). They're callable from the v2 VM, and from host code via `import * as Async from "aether/stdlib/async"`. This honesty about a real limitation is part of the ADR-13 contract.

### 10.6.2 Why JS Promises (briefly)

A custom suspend/resume mechanism would let Aether run async code without depending on JS — but it would mean writing a scheduler, a stack-capture mechanism, and a custom Promise equivalent. That's a multi-month project. JS Promises already exist, are debugged, and integrate cleanly with the host's microtask queue. The v2.1 plan is to migrate to a custom mechanism once the language's own continuations are in place; for now, Promises are the right substrate. See ADR-13 for the full argument.

---

## 10.7 The module system

Aether v2 has a real module system in `aether/core/modules/modules.ts`. The syntax:

```aether
// utils.ae
pub const GREETING = "Hello";
pub fn greet(name: string) -> () { print(f"{GREETING}, {name}!"); }
```

```aether
// main.ae
import { greet, GREETING } from "./utils.ae";
greet("Aether");   // Hello, Aether!
print(GREETING);   // Hello
```

- `import { name, … } from "path";` — bring names in.
- `pub fn`, `pub const`, `pub struct`, `pub enum` — declare exports.
- `pub use { … } from "…";` — re-export.
- Non-`pub` items are private to the module.
- Relative paths resolve against the importing file's directory.
- Cycles are detected and reported with a path-printed error message.

### 10.7.1 Why regex preprocessing (briefly)

The parser doesn't yet natively support the RFC-003 import syntax. The module loader extracts imports with a regex, strips them before parsing, and shares values via the evaluator's `RunOptions.env`. This is a pragmatic choice: regex is one afternoon's work; extending the parser, the AST, the type checker, and the resolver for a proper import-statement form is a multi-week project. The regex approach lets the module system ship in v2 while the parser grows the native form for v2.x. See ADR-14 for the full trade-off.

### 10.7.2 A multi-file example

```aether
// geometry.ae
pub struct Point { x: int, y: int }
pub fn distance(a: Point, b: Point) -> float {
  let dx = (a.x - b.x) as float;
  let dy = (a.y - b.y) as float;
  sqrt(dx * dx + dy * dy)
}
```

```aether
// main.ae
import { Point, distance } from "./geometry.ae";
let p = Point { x: 0, y: 0 };
let q = Point { x: 3, y: 4 };
print(distance(p, q));   // 5
```

The loader parses `geometry.ae` first, collects its `pub` names into a module namespace, then parses `main.ae` with those names injected into the root environment. A cycle (`a` imports `b` imports `a`) is detected during loading and reported with the cycle path.

---

## 10.8 Putting it all together — a real workflow

A typical Aether project workflow:

```bash
# 1. Scaffold
$ aether new myproject
$ cd myproject

# 2. Write the code (your editor of choice)
$ vim main.ae

# 3. Lint
$ aether lint main.ae
# (fix any warnings)

# 4. Format in place
$ aether fmt main.ae

# 5. Type-check
$ aether check main.ae

# 6. Run on the tree-walker (fast feedback)
$ aether run main.ae

# 7. Run on the VM (production-shape run)
$ aether run:vm main.ae

# 8. Run the tests
$ aether test .

# 9. Build a bytecode artifact
$ aether build main.ae -o main.bin
```

Steps 3-5 are fast (lint ~1ms, fmt ~5ms, check ~50ms for a 1000-line file). Steps 6-7 are interactive (run on a 1000-line file is sub-100ms either backend). Step 9 produces a self-contained `.bin` that a future runtime can `mmap` and dispatch directly.

---

## 10.9 Summary

- The CLI has 8 commands: `run`, `run:vm`, `check`, `test`, `fmt`, `repl`, `new`, `build`. Exit codes are 0 / 1 / 2.
- The formatter is idempotent (35 example corpus), brace-depth-based, with rules for indentation, semicolons, spaces, trailing commas, and empty lines. `--check` mode is CI-friendly.
- The linter has 30 rules across style, correctness, suspicious patterns, performance, and idioms. Some are implemented; the full set is on track for v2.1.
- The LSP (RFC-007) is in progress; it reuses the lexer/parser/sema and adds JSON-RPC wiring for diagnostics, hover, completion, go-to-def, find-refs, rename, code actions, inlay hints.
- The 8 optimizer passes run in a fixed order on the IR: constantFolding → dce → cse → inlining → tco → licm → strengthReduction → branchSimplification. Each pass is small and focused.
- The async runtime has 16 functions, built on JS Promises (ADR-13). It is cooperative, not preemptive. Not callable from the v1 sync evaluator — that's a deliberate, documented limitation.
- The module system supports `import`, `pub fn`, `pub const`, `pub use`, with cycle detection. Implemented via regex preprocessing (ADR-14) — a pragmatic choice that lets the module system ship in v2 while the parser grows native import support for v2.x.

The next chapter (Chapter 11 in the v1/v2 narrative) goes deeper on the module system and the package manager vision.
