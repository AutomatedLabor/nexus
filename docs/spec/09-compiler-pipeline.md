# 09 — Compiler Pipeline

> **Status:** 🔒 Stable
> **Subsystem:** `aether/core/*`, `aether/vm/codegen`
> **Spec version:** 0.1

This section specifies the end-to-end compiler pipeline: how a
source file becomes a running program. The intent is to fix the
*boundaries* between stages so that contributors can replace a
single stage without disturbing its neighbors. Each stage's
internal algorithm is specified in its own document; this section
specifies the contracts.

## 1. Pipeline diagram

```
                   ┌──────────────────────────────────────────────┐
                   │                                              │
   source bytes ──▶│  lexer    ──┐                                 │
                   │             │ tokens                          │
                   │  parser   ◀──┘                                 │
                   │             │ AST                              │
                   │  sema    ─────▶  names + types                 │
                   │             │ typed AST                       │
                   │  checker  ─────▶  exhaustiveness, borrow, traits│
                   │             │ checked AST                     │
                   │             ├──────────────────────┐           │
                   │             │                      │           │
                   │  codegen  ◀─┘                      ▼           │
                   │   │ bytecode              eval (AST walker)   │
                   │   ▼                                │           │
                   │   vm                              ▼           │
                   │                              (REPL/LSP/debug) │
                   └──────────────────────────────────────────────┘
```

The two execution backends — the VM and the AST walker (`eval`) —
share the **same** typed AST. The VM is the production target; the
AST walker is used by `aether repl`, `aether lsp`, and debug
scenarios where compilation latency matters more than throughput.

## 2. Stages

### 2.1 Lexer

**Input:**  raw source bytes (UTF-8) plus a `file_id`.
**Output:** token stream + diagnostic list.
**Contract:**
- Tokens carry spans (§02 §1).
- The lexer is **stateless** except for the
  [generics-friendly re-lex](./02-lexical-structure.md#punctuation-and-operators)
  signal from the parser.
- Lexing does not fail on the first error; recovery is by
  single-code-point advance (§02 §9).

Spec: [02-lexical-structure.md](./02-lexical-structure.md).
Source: `aether/core/lexer/`.

### 2.2 Parser

**Input:**  token stream.
**Output:**  AST + diagnostic list.
**Contract:**
- The parser is a Pratt-style recursive descent parser driven by
  the precedence table in [§04 §1](./04-expressions.md#grammar-overview).
- AST nodes carry spans and (where applicable) the original source
  text, so the formatter and the LSP can round-trip them.
- The parser is error-recovering: it uses `;`, `}`, and the start
  of a new top-level item as synchronization tokens. A single source
  file may produce multiple parse errors.
- The parser is responsible for generics-friendly re-lex: it
  tracks `<`/`>` depth and asks the lexer to re-lex `>>` into two
  `>` tokens at the appropriate points (§04 §17).

Spec: [04-expressions.md](./04-expressions.md),
[05-statements-and-declarations.md](./05-statements-and-declarations.md).
Source: `aether/core/parser/`, `aether/core/ast/`.

### 2.3 AST

The AST is a tree of immutable nodes allocated in an *arena*
(per-compilation). Each node carries:

- a `NodeId` (an arena index, used for cross-references),
- a `Span`,
- a kind tag,
- kind-specific payload.

The AST is shared between the parser, sema, checker, codegen, and
eval. Nodes are appended with side tables:

- `sema_table: NodeId -> ResolvedName`,
- `type_table:   NodeId -> Type`,
- `borrow_table:  NodeId -> BorrowInfo`,
- `impl_table:    TypeId -> ImplId`.

Side tables are populated by downstream stages and never mutate the
AST itself. This makes incremental recompilation tractable: when a
file changes, the parser rebuilds the AST and downstream stages
re-populate only the affected side tables.

### 2.4 Sema (name resolution + type inference)

**Input:**  AST.
**Output:**  typed AST (with `type_table` and `sema_table` populated).
**Contract:**
- Resolves every name reference to a definition (`E1040` on failure).
- Infers types for every expression and pattern (`E1100`–`E1099` on
  failure).
- Generalizes `let`-bound functions to rank-1 polymorphic types
  (§03 6.2).
- Records impls in `impl_table` for use by the checker and codegen.
- Sema operates **per-module** and is order-independent within a
  module (§05 §14).
- Cross-module sema proceeds in topological order of the `use`
  graph; cycles between modules are `E1046`.

Spec: [03-type-system.md](./03-type-system.md) (inference),
[06-modules-and-packages.md](./06-modules-and-packages.md) (resolution).
Source: `aether/core/sema/`, `aether/core/types/`.

### 2.5 Checker

**Input:**  typed AST.
**Output:**  checked AST (with `borrow_table` populated); diagnostic
list.
**Contract:**
- Exhaustiveness of `match` (§03 6.6).
- Definite assignment (§03 6.3).
- Borrow-checking (§03 6.4).
- Trait-conformance: every `impl` provides all required methods and
  signatures are compatible; orphan rule (§03 6.5).
- Reachability analysis: unreachable code triggers `W1080`.
- The checker does not transform the AST; it only annotates it.

Spec: [03-type-system.md](./03-type-system.md) §6.
Source: `aether/core/checker/`.

### 2.6 Codegen

**Input:**  checked AST.
**Output:**  bytecode module (`Module { prototypes, constants,
imports, debug_info }`).
**Contract:**
- Each `fn` becomes a *prototype*: a list of opcodes + a constant
  pool slice + metadata (arity, locals, captures, debug info).
- Generic functions are **monomorphized**: each instantiation in
  the call graph produces a separate prototype.
- Closures produce prototypes with a non-empty captures list.
  `MakeClosure` at the call site builds the environment record.
- Async functions are compiled to state-machine prototypes with one
  resume-point per `await` (§07 4.1).
- String and `Bytes` constants are interned into the module's
  constant pool.
- Debug info (line table, local name table) is emitted by default
  and is trimmable with `--no-debug-info`.

Spec: [10-vm-and-bytecode.md](./10-vm-and-bytecode.md).
Source: `aether/vm/codegen/`, `aether/vm/bytecode/`.

### 2.7 Linker / packaging

The `aether build` tool collects all bytecode modules produced by
codegen for a single package and links them into a single
**bytecode image**: a flat file containing every prototype, the
merged constant pool, the import table, and a manifest. The image
format is specified in [§10 §8 Image format](./10-vm-and-bytecode.md#image-format).

### 2.8 VM

**Input:**  bytecode image + command-line arguments + runtime
configuration.
**Output:**  program exit code.
**Contract:**
- Load the image, find the entry prototype, push a frame, run the
  interpreter loop.
- The VM owns the GC, the runtime, and the task scheduler.
- The VM is specified in [§10](./10-vm-and-bytecode.md); the GC in
  [§11](./11-memory-and-gc.md); the runtime in
  [§07 4.2](./07-functions-closures-async.md#the-task-scheduler).

Spec: [10-vm-and-bytecode.md](./10-vm-and-bytecode.md).
Source: `aether/vm/vm/`.

### 2.9 Eval (AST walker)

**Input:**  checked AST + initial environment.
**Output:**  evaluation result.
**Contract:**
- Walks the AST directly, looking up names and types in the
  side tables populated by sema/checker.
- Used by:
  - `aether repl` — line-by-line evaluation,
  - `aether lsp` — `hover`, `goto-definition`, and `evaluate`
    commands,
  - `aether test --debug` — running tests under a step-by-step
    debugger that operates on the AST,
  - `const fn` evaluation at compile time.
- Eval and the VM MUST produce identical observable behavior for
  every program. Divergences are bugs; the conformance suite
  ([§15](./15-conformance-and-tests.md)) enforces this.

Spec: this section + the dynamic-semantics portions of §04, §07, §08.
Source: `aether/core/eval/`.

## 3. Diagnostic model

Every stage emits diagnostics. A diagnostic is:

```aether
struct Diagnostic {
    severity: Severity,        // Error, Warning, Info, Note
    code:     String,           // "E0001", "W1010", ...
    message:  String,
    span:     Span,
    notes:    List<Note>,       // optional, e.g. "see also..."
    suggestions: List<Suggestion>, // optional, machine-applicable fixes
}
struct Note { span: Span, message: String }
struct Suggestion { span: Span, replacement: String, app: Applicability }
enum Applicability { MachineApplicable, MaybeIncorrect, Unspecified }
```

Diagnostic codes are stable across versions:

- `E0xxx` — lexer
- `E1xxx` — sema / types
- `E2xxx` — parser
- `E3xxx` — checker (exhaustiveness, borrow, traits)
- `E4xxx` — codegen
- `E5xxx` — VM (runtime errors observed during execution)
- `E6xxx` — linker / packaging

Tooling (formatter, linter, lsp, docgen) uses its own `W`/`E` ranges
documented in [§13](./13-tooling.md).

## 4. Incremental compilation

The `aether lsp` and `aether build --watch` workflows rely on
incremental compilation:

1. A change to a file invalidates the lexer's output for that
   file only.
2. The parser rebuilds the AST for that file.
3. Sema re-runs for the changed file and any file that imports it
   (transitively, bounded by the import graph).
4. The checker re-runs for changed modules.
5. Codegen re-runs for changed prototypes and for any prototype
   that calls into a changed prototype.

The compiler MUST maintain a *dependency graph* at the
(NodeId → NodeId) level so that incremental recompilation does not
redo work that is unaffected by a change. The granularity is:

- name-resolution dependency (one NodeId depends on another iff the
  first references a name defined at the second),
- type-inference dependency (an expression's type depends on its
  subexpressions' types),
- codegen dependency (a prototype depends on the prototypes it
  calls and the constants it references).

## 5. Performance budget

The 0.1 release targets:

- Cold compile of 10 KLOC: ≤ 300 ms on a 2023 laptop.
- Incremental recompile after a one-line change: ≤ 30 ms.
- VM startup (load image + run `main`): ≤ 5 ms.
- `aether lsp` hover response: ≤ 10 ms.
- `aether repl` per-line: ≤ 50 ms.

The compiler is permitted to use any algorithm that meets these
budgets; the budgets are the contract.

## 6. Conformance

A conformant compiler MUST:

- accept every program this spec describes as well-formed,
- reject every program this spec describes as ill-formed with a
  diagnostic whose code is in the appropriate range,
- produce bytecode that the VM executes with the observable
  behavior described in §04, §07, §08, §10, §11,
- maintain the AST/side-table/side-table separation so that
  incremental compilation and tooling integration are possible.

A conformant compiler MAY:

- optimize the program in any way that preserves observable
  behavior (constant folding, dead-code elimination, inlining,
  escape analysis for the GC, etc.),
- report additional warnings not enumerated here,
- support additional (non-conformant) language extensions behind an
  opt-in flag, provided the default mode is conformant.
