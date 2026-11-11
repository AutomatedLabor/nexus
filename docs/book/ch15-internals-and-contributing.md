# Chapter 15 — Internals and contributing

> This is the chapter for people who want to *modify* Aether — add a language feature, add a stdlib function, fix a bug, write an optimizer pass, port a backend. It covers the compiler pipeline, the AST shape, the IR shape, the VM shape, the 3× test/doc/bench rule, and the contributor guide.

---

## 15.1 The compiler pipeline (revisited)

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
  IR builder ──► IR (v2 only)
        │
        ▼
  8 optimizer passes (v2 only)
        │
        ▼
  Codegen ──► bytecode (v2 only)
        │
        ▼
  Stack-based VM interpreter (v2)
        │          or
        ▼
  Tree-walking interpreter (v1)
        │
        ▼
   Output / error report
```

The first three stages (lex, parse, sema) are *shared* between v1 and v2. The last few stages (IR, opt, codegen, VM) are v2-only; v1 goes from AST directly to tree-walker.

The pipeline is *lenient* (ADR-09): errors don't stop the pipeline. Lex errors don't stop parsing; parse errors don't stop sema; sema errors don't stop execution. Each stage reports its errors and continues with a fallback. The result: the user sees *all* errors at once, not just the first.

---

## 15.2 The AST

The AST is defined in `aether/core/ast/ast.ts`. It's a TypeScript discriminated union — each node has a `kind` field that's a string literal ("LetDecl", "FnDecl", "IfExpr", etc.). The `visitor.ts` file has a visitor pattern implementation. The `serialize.ts` file has a pretty-printer.

### 15.2.1 The node kinds

Statements / declarations:
- `LetDecl` — `let x: T = expr;` or `let mut x = expr;`.
- `ConstDecl` — `const NAME: T = expr;`.
- `FnDecl` — `fn name(params) -> T { body }`. Has `exported: bool` for `pub fn`.
- `EnumDecl` — `enum Name<T> { Variant1(...), Variant2, ... }`.
- `StructDecl` — `struct Name<T> { field1: T1, field2: T2, ... }`.
- `TypeAliasDecl` — `type Name<T> = T;`.
- `ExprStmt` — `expr;`.

Expressions:
- `IntLit`, `FloatLit`, `StringLit`, `CharLit`, `BoolLit`, `UnitLit`, `NullLit`.
- `Ident` — `name`.
- `BinOp` — `a + b`, `a == b`, etc. Has `op: string`.
- `UnaryOp` — `-a`, `!b`, `~c`.
- `If` — `if cond { then } else { else }`.
- `Match` — `match scrutinee { arm1, arm2, ... }`.
- `Block` — `{ stmt1; stmt2; expr }` (trailing expression is the value).
- `Call` — `f(args)`.
- `Index` — `arr[i]`.
- `Field` — `s.field`.
- `TupleField` — `t.N`.
- `Cast` — `expr as Type`.
- `Lambda` — `fn(params) -> T { body }`.
- `Range` — `range(a, b)` or `range(a, b, step)` (or `a..b` in v2.x).
- `Tuple` — `(a, b, c)`.
- `Array` — `[a, b, c]`.
- `MapLit` — `{ "k": v, ... }` (planned).
- `StructLit` — `Name { field: value, ... }`.
- `EnumLit` — `Name::Variant(args)`.
- `Spread` — `Name { ..base, field: value }`.
- `Try` — `expr?`.
- `Assign` — `x = expr`, `s.field = expr`, `arr[i] = expr`.
- `CompoundAssign` — `x += expr`, etc. (planned; not in v1.)
- `Break`, `Continue`, `Return`.

### 15.2.2 Adding a new AST node

To add a new node (e.g., a `For` loop with a step):

1. Add the node to `ast.ts`:
   ```typescript
   export interface ForStep extends Node {
     kind: "ForStep";
     var: string;
     start: Expr; end: Expr; step: Expr;
     body: Expr;
   }
   ```
2. Add the parser code in `parser.ts` (parse `for x in range(...) with step { ... }`).
3. Add the type checker code in `sema.ts` (check `start`, `end`, `step` are int; check `body`).
4. Add the v1 evaluator code in `eval.ts` (loop with a step counter).
5. Add the IR builder code in `irbuilder.ts` (lower to a `while` with a step).
6. Add the codegen code in `codegen.ts` (lower to bytecode with `Jmp`).
7. Add the VM handler in `vm.ts` (no new opcode needed if it's lowered to existing ops; or add a new opcode).
8. Add the formatter code in `formatter.ts`.
9. Add the linter code in `linter.ts`.
10. Add tests in `*.test.ts`.

The 3× test/doc/bench rule (§15.5) means you also add a test, update the docs, and (if relevant) update the benchmarks.

---

## 15.3 The IR

The IR is defined in `aether/core/ir/ir.ts` and built by `aether/core/opt/irbuilder.ts`. It's register-numbered, three-address-style. Each function has:

- A list of instructions.
- A register count.
- A constant pool (ints, floats, strings).
- A match-table side table (for the `Match` instruction).
- A variadic register-list side table (for `Call` args, `AllocArray` elems, etc.).

### 15.3.1 IR instructions

The IR instruction set is ~50 instructions, listed in Chapter 9. Each instruction has a destination register, source registers, and immediates.

### 15.3.2 The IR builder

The IR builder walks the AST and emits IR instructions. For each AST node, there's a `build<NodeKind>` function:

```typescript
function buildIf(node: If, ctx: BuildCtx): RegId {
  const condReg = buildExpr(node.cond, ctx);
  const thenReg = ctx.freshReg();
  const elseReg = ctx.freshReg();
  const resultReg = ctx.freshReg();
  ctx.emit(JmpIfNot, condReg, thenLabel);
  ctx.emitAssign(thenReg, buildExpr(node.then, ctx));
  ctx.emit(Jmp, endLabel);
  ctx.emitLabel(thenLabel);
  ctx.emitAssign(elseReg, buildExpr(node.else, ctx));
  ctx.emitLabel(endLabel);
  ctx.emit(Br, condReg, thenReg, elseReg, resultReg);
  return resultReg;
}
```

(Simplified; the real code is in `irbuilder.ts`.)

### 15.3.3 Adding a new IR instruction

To add a new IR instruction (e.g., `Swap r1, r2`):

1. Add the opcode to `ir.ts`.
2. Add the builder code in `irbuilder.ts` (emit the instruction).
3. Add the codegen code in `codegen.ts` (lower to a bytecode opcode, or to existing ops).
4. Add the VM handler in `vm.ts` (if you added a new bytecode opcode).
5. Add the optimizer pass code if relevant (a new pass might fold or simplify the instruction).
6. Add tests.

---

## 15.4 The VM

The VM is in `aether/vm/interpreter/vm.ts`. It's a single-function interpreter (a `switch` on the opcode). Each opcode has a handler case.

### 15.4.1 The VM state

```typescript
interface VM {
  module: BytecodeModule;
  frames: Frame[];
  output: string[];
  stepCount: number;
  maxSteps: number;
}

interface Frame {
  func: BytecodeFunction;
  pc: number;
  regs: Value[];
  upvalues: Value[];
  closure: ClosureValue | null;
}
```

### 15.4.2 Adding a new VM opcode

To add a new opcode (e.g., `Op.Swap`):

1. Add the opcode to the `Op` enum in `bytecode.ts`.
2. Add the disassembler case in `bytecode.ts:disassemble`.
3. Add the assembler case in `bytecode.ts:assemble`.
4. Add the codegen case in `codegen.ts` (emit the opcode from the IR).
5. Add the VM handler case in `vm.ts` (interpret the opcode).
6. Add tests.

---

## 15.5 The 3× test/doc/bench rule

For every change to Aether, you should make *three* updates:

1. **Test.** A test in `*.test.ts` that exercises the new behavior. The test should fail without the change and pass with it.
2. **Doc.** A documentation update: a new section in the relevant chapter of this book, a new entry in the API reference (if you added a stdlib function), a new entry in the error catalog (if you added an error), a new ADR (if you made an architectural decision), a new RFC (if you proposed a future change).
3. **Bench.** A benchmark update: if your change has a perf impact, add a benchmark to the playground's Benchmarks view (or update an existing one). Note the change in `PROGRESS.md`.

The 3× rule is *not* about perfectionism — it's about *trust*. Without tests, contributors can't be confident they haven't regressed something. Without docs, users can't discover the change. Without benchmarks, perf regressions slip in silently.

### 15.5.1 The test corpus

The test corpus is `*.test.ts` files alongside the source:

- `aether/core/lexer/lexer.test.ts` — lex tests.
- `aether/core/parser/parser.test.ts` — parse tests.
- `aether/core/sema/sema.test.ts` — type-check tests.
- `aether/core/eval/eval.test.ts` — v1 tree-walker tests.
- `aether/core/opt/*.test.ts` — optimizer pass tests.
- `aether/vm/interpreter/vm.test.ts` (or similar) — v2 VM tests.
- `aether/stdlib/*/index.test.ts` — stdlib tests.
- `aether/core/modules/modules.test.ts` — module-system tests.
- `aether/tools/cli/cli.test.ts` — CLI tests.
- `aether/tools/formatter/formatter.test.ts` — formatter tests (including idempotency).

Plus integration tests in `tests/` — multi-file programs that exercise the module system, the CLI, etc.

The corpus is ~1597 tests today. The CI runs them all on every PR.

### 15.5.2 The doc corpus

The doc corpus is everything in `docs/`:

- `docs/book/` — this book (15 chapters).
- `docs/reference/` — the API reference, the error catalog, the glossary, the comparison, the FAQ.
- `docs/tutorials/` — short, focused tutorials.
- `docs/guides/` — migration guides (from Python, Go, Rust, TypeScript) and idiomatic / anti-pattern guides.
- `docs/spec/` — the formal language spec (16 sections).
- `docs/decisions/` — the ADRs (15 today).
- `docs/rfcs/` — the RFCs (8 today).

When you change behavior, update the relevant doc. When you add a feature, write the doc. When you make a decision, write an ADR. When you propose a future change, write an RFC.

### 15.5.3 The bench corpus

The bench corpus is the six canned benchmarks in the playground's Benchmarks view:

- `fib-15`, `fib-20` — recursion.
- `sum-500k` — tight numeric loop.
- `factorial-100` — deeper recursion.
- `str-concat` — string operations.
- `array-build` — array allocation.

If your change might affect perf, run the benchmarks before and after, and note the change in `PROGRESS.md`. If you add a new benchmark (for a new feature), add it to the Benchmarks view.

---

## 15.6 How to add a language feature

Let's walk through adding a hypothetical feature: the `?` postfix operator on `Option` (it exists for `Result`, but suppose we're adding it for `Option` from scratch).

### 15.6.1 The lexer

If the feature introduces a new token, add it to `lexer.ts`. For `?`, the token already exists (it's a single character).

### 15.6.2 The parser

If the feature introduces new syntax, add the parser code in `parser.ts`. For `?` postfix, the parser has a `parsePostfix` function that handles `?` after an expression.

### 15.6.3 The type checker

Add the type-check code in `sema.ts`. For `?` on `Option`, the checker:

- Verifies the operand's type is `Option<T>`.
- Verifies the enclosing function returns `Option<U>` for some `U`.
- The result type is `T` (the inner type of the `Option`).

### 15.6.4 The v1 evaluator

Add the eval code in `eval.ts`. For `?` on `Option`, the evaluator:

- Evaluates the operand.
- If it's `Option::Some(v)`, the result is `v`.
- If it's `Option::None`, throw a special signal (the function-call machinery catches it and converts to an early `Option::None` return).

### 15.6.5 The IR builder

Add the IR code in `irbuilder.ts`. For `?`, emit `UnwrapOrProp r_dst, r_src` (already exists for `Result`; same opcode for `Option`).

### 15.6.6 The VM handler

The `UnwrapOrProp` opcode handler in `vm.ts` already handles `Result`; extend it to handle `Option`.

### 15.6.7 Tests

Add tests in `eval.test.ts` (v1) and `vm.test.ts` (v2) for:

- `?` on `Option::Some(v)` — returns `v`.
- `?` on `Option::None` — short-circuits to `Option::None`.
- `?` on a non-`Option`/`Result` — type error.
- `?` outside a function returning `Option`/`Result` — type error.

### 15.6.8 Docs

Update Chapter 7 (error handling) to mention `?` on `Option`. Update the API reference if needed. Update the error catalog if you added a new error.

### 15.6.9 The PR

The PR includes:

- Source changes (lexer, parser, sema, eval, IR, VM).
- Test additions.
- Doc updates.
- A `PROGRESS.md` line.

The CI runs all 1597 tests (now ~1460 with the new ones); the linter runs; the formatter runs (`--check` mode). The PR is reviewable.

---

## 15.7 How to add a stdlib function

Let's walk through adding a stdlib function: `string.reverse_words(s)`.

### 15.7.1 The implementation

In `aether/stdlib/string/index.ts`:

```typescript
export function reverseWords(s: string): string {
  assertString(s, "reverseWords");
  return s.split(/\s+/).reverse().join(" ");
}
```

### 15.7.2 The manifest

Add to the `MANIFEST`:

```typescript
{ name: "reverseWords", sig: "(s: string) -> string", desc: "Reverse the order of words in s." },
```

### 15.7.3 The registration

Add to the `register` function:

```typescript
registerBuiltin("reverseWords", reverseWords);
```

### 15.7.4 Tests

In `aether/stdlib/string/index.test.ts`:

```typescript
test("reverseWords", () => {
  expect(reverseWords("hello world")).toBe("world hello");
  expect(reverseWords("a b c")).toBe("c b a");
  expect(reverseWords("")).toBe("");
});
```

Plus a test in `eval.test.ts` that calls `reverseWords` from Aether source:

```aether
assert_eq(reverseWords("hello world"), "world hello");
```

### 15.7.5 Docs

Update Chapter 8 (stdlib tour) and the API reference (`docs/reference/api-reference.md`).

### 15.7.6 The PR

The PR includes:

- Source change (one new function in `string/index.ts`).
- Manifest + registration update.
- Test additions.
- Doc update.

---

## 15.8 The contributor guide

### 15.8.1 Getting started

1. Clone the repo.
2. Install Bun (or Node 18+).
3. Run `bun install` (or `npm install`).
4. Run `bun test` (or `npm test`) — all 1597 tests should pass.
5. Run `bun aether/tools/cli/cli.ts run examples/fibonacci.ae` — should print the Fibonacci table.
6. Open the playground locally: `bun dev` (Next.js dev server on port 3000).

### 15.8.2 Making a change

1. Pick an issue from the issue tracker (or file a new one).
2. Branch: `git checkout -b my-feature`.
3. Make the change (source + tests + docs + bench).
4. Run `bun test` — all tests should pass.
5. Run `bun aether/tools/cli/cli.ts fmt --check .` — formatter should be happy.
6. Commit: `git commit -m "feat: add reverseWords to string module"`.
7. Push: `git push`.
8. Open a PR.

### 15.8.3 The PR template

```
## What this PR does

<one-paragraph summary>

## Why

<motivation — what bug, what missing feature, what perf>

## How

<implementation summary — files touched, approach>

## Tests

- [ ] Added/updated unit tests
- [ ] Added/updated integration tests (if relevant)
- [ ] All 1597 tests pass

## Docs

- [ ] Updated the book (if relevant)
- [ ] Updated the API reference (if relevant)
- [ ] Updated the error catalog (if relevant)
- [ ] Added/updated an ADR (if a decision was made)
- [ ] Added/updated an RFC (if a future change is proposed)

## Bench

- [ ] Ran the benchmarks before/after (if perf-relevant)
- [ ] Updated PROGRESS.md
```

### 15.8.4 Code style

- TypeScript with strict mode.
- 2-space indentation, no semicolons in TS (semicolons in Aether source).
- 100-column line limit (suggestions; not enforced).
- Descriptive names: `buildIf`, not `bi`.
- Comments where the code is non-obvious. Don't comment the obvious.

### 15.8.5 Review criteria

A PR is accepted if:

- All tests pass.
- The formatter is happy.
- The change fits the language's design (the reviewer judges; ADRs/RFCs help).
- The 3× rule is satisfied (test + doc + bench).
- The change is honest (the description matches the implementation; v1 vs v2 is clearly stated; planned features are noted as planned).

---

## 15.9 Eight runnable examples (internal tests / smoke tests)

**1. Run the test suite.**

```bash
bun test
# (all 1597 tests pass)
```

**2. Run a single test file.**

```bash
bun test aether/core/eval/eval.test.ts
```

**3. Run the benchmarks.**

```bash
# open the playground and click Benchmarks
# (or programmatically:)
bun -e 'import { compileAndRun, compileToVm } from "./aether/core"; const src = `let mut s = 0; for i in range(0, 500000) { s = s + i; } print(s);`; console.log(compileAndRun(src).stats); console.log(compileToVm(src).stats);'
```

**4. Disassemble bytecode.**

```typescript
import { compileToVm, disassemble } from "aether/core";
const r = compileToVm("print(1 + 2);");
console.log(disassemble(r.module));
```

**5. Run the formatter.**

```bash
bun aether/tools/cli/cli.ts fmt examples/fibonacci.ae
```

**6. Run the linter.**

```bash
bun aether/tools/cli/cli.ts lint examples/fibonacci.ae
```

**7. Build to bytecode.**

```bash
bun aether/tools/cli/cli.ts build examples/fibonacci.ae -o fib.bin
```

**8. Run the REPL.**

```bash
bun aether/tools/cli/cli.ts repl
```

---

## 15.10 Summary

- The compiler pipeline is shared between v1 and v2 for the first three stages (lex, parse, sema). v2 adds the IR, optimizer, codegen, and VM.
- The AST is in `aether/core/ast/ast.ts`. Adding a new AST node touches the lexer, parser, type checker, v1 evaluator, IR builder, codegen, VM, formatter, linter, and tests.
- The IR is in `aether/core/ir/ir.ts`. Adding a new IR instruction touches the IR, IR builder, codegen, VM, and tests.
- The VM is in `aether/vm/interpreter/vm.ts`. Adding a new VM opcode touches the bytecode (Op enum, disassemble, assemble), codegen, VM, and tests.
- The 3× test/doc/bench rule: every change should include a test, a doc update, and (if perf-relevant) a benchmark update.
- The contributor guide: clone, branch, change, test, format, commit, push, PR. The PR template covers the 3× rule.

The next step is up to you: pick an issue, write a test, ship a PR. The 1597 tests are the floor; everything in v2 today is real and tested; everything in v2.x is designed but not built. The book is the map; the code is the territory.
