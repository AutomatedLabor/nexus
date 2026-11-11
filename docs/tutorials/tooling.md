# Aether Tooling

> Audience: anyone wanting to know what tooling exists and what is
> planned.
> Prerequisites: a passing familiarity with how languages are
> built. 25 minutes.

Aether v1's tooling story is small and honest: a playground in
the browser, and Vitest tests for the implementation. The v2 plan
adds a REPL, a language server (LSP), a formatter, a linter, a
package manager, and a build tool. This document describes the
current state and sketches the planned state.

## 1. The current state (v1)

| Tool | Status | Location |
|------|--------|----------|
| Playground | ✅ shipped | `/` route |
| Compiler API | ✅ shipped | `aether/core/index.ts` |
| Inline evaluator | ✅ shipped | `aether/core/eval/eval.ts` |
| Stdlib (10 modules) | ✅ shipped | `aether/stdlib/*/index.ts` |
| Implementation tests | ✅ shipped | `aether/**/*.test.ts` |
| REPL | ❌ not in v1 | planned for v2 |
| LSP | ❌ not in v1 | planned for v2 |
| Formatter | ❌ not in v1 | planned for v2 |
| Linter | ❌ not in v1 | planned for v2 |
| Package manager | ❌ not in v1 | planned for v2 |
| Build tool | ❌ not in v1 | planned for v2 |
| Bytecode VM | ❌ not in v1 | planned for v2 |

The v1 implementation is a tree-walking interpreter that runs
in the browser. The compiler is bundled into a single
JavaScript module that the playground loads. There is no CLI,
no language server, no package manager, no build tool. You
write code in the playground, you run it in the playground, and
that's it.

See
[../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md)
for why v1 chose this shape and
[../decisions/adr-10-browser-runnable-core.md](../decisions/adr-10-browser-runnable-core.md)
for the browser constraint.

## 2. The playground

The playground is the entire user-facing surface of Aether v1.
It lives at `/` in the Next.js app. The three panes are:

1. **Editor** (left) — a textarea for Aether source. The editor
   does not do syntax highlighting in v1; that requires an LSP
   or a CodeMirror plugin, which is planned for v2.
2. **Output** (top right) — captured stdout of the program.
3. **Inspector** (bottom right) — four tabs:
   - **Tokens** — the lexer's output, one token per line.
   - **AST** — the parser's output, pretty-printed.
   - **Type errors** — the sema's output, one error per line.
   - **Steps** — the evaluator's step count.

The playground is a single route. There is no project view, no
multi-file editing, no terminal. This is deliberate; see
[../decisions/adr-07-single-playground-route.md](../decisions/adr-07-single-playground-route.md).

### 2.1 How to use the playground

1. Open the playground in a browser.
2. Type Aether source into the editor.
3. Press **Run** (or `Ctrl+Enter` / `Cmd+Enter`).
4. Read the output in the top-right pane.
5. If there are errors, switch to the appropriate Inspector tab
   to see the details.
6. If the program is too slow, check the Steps tab — a high
   step count means the evaluator is doing a lot of work.

### 2.2 The compile pipeline in the playground

The playground calls `compileAndRun(source)` from
`aether/core/index.ts`. This function runs all four stages:

- **Lex** — `lexWithErrors(source, "<aether>")` returns tokens
  and any lexer errors.
- **Parse** — `parse(tokens, "<aether>")` returns an AST and any
  parse errors.
- **Check** — `check(program)` returns type errors.
- **Run** — `run(program, opts)` returns the runtime result.

Each stage's output populates a corresponding Inspector tab.
The pipeline is non-fatal: a lexer error does not stop parsing,
a parse error does not stop type-checking, and a type error
does not stop evaluation. You see all your errors at once.

See [getting-started.md](getting-started.md) §7 for the full
pipeline description.

### 2.3 Sharing a program

The playground has a **Share** button that produces a URL with
the current source encoded as a query parameter. You can
bookmark this URL, send it to a colleague, or embed it in a
document. The URL is shareable and self-contained; the receiver
does not need to install anything.

This is the closest thing Aether v1 has to a "package manager"
— it is a one-program-at-a-time sharing mechanism. The v2 plan
adds real packages; see
[../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md).

## 3. The compiler API

The compiler is exposed as a TypeScript module at
`aether/core/index.ts`. The public surface is:

```ts
import {
  compile,            // compile + run
  compileAndRun,      // alias of compile
  lex,                // tokenize
  lexWithErrors,      // tokenize + collect errors
  parse,              // parse
  parseSource,        // parse from source string
  check,              // type-check
  run,                // evaluate
  display,            // pretty-print a value
  valueEq,            // deep equality on values
  astToJson,          // serialize AST to JSON
  jsonToAst,          // deserialize AST from JSON
  astEqual,           // AST equality
  cloneAst,            // deep clone of an AST
} from "aether/core";
```

The main entry point is `compileAndRun(source, opts)`:

```ts
interface CompileResult {
  tokens: Token[];
  parseErrors: ParseError[];
  ast: Program;
  typeErrors: TypeError[];
  runtime: {
    output: string[];
    value: Value;
    error: { message: string } | null;
    steps: number;
  } | null;
  ok: boolean;
  errors: Array<{ stage: "lex" | "parse" | "type" | "runtime"; message: string }>;
}
```

`ok` is `true` iff every error list is empty. The errors array is
a flat list of all errors across all stages, tagged with the
stage that produced them.

### 3.1 Calling the API from JavaScript

The playground calls the API like this:

```ts
import { compileAndRun } from "aether/core";
import { stdlibBuiltins } from "aether/stdlib";

const result = compileAndRun(source, { builtins: stdlibBuiltins() });
if (result.ok) {
  console.log(result.runtime.output.join("\n"));
} else {
  for (const err of result.errors) {
    console.error(`[${err.stage}] ${err.message}`);
  }
}
```

The `builtins` option lets the host inject stdlib functions
into the evaluator's root environment. The playground injects
the full stdlib; a constrained host could inject only a subset.

See `aether/core/index.ts` for the full API documentation.

## 4. The implementation tests

The Aether compiler is tested with Vitest. The tests live next to
the source:

- `aether/core/lexer/lexer.test.ts` — lexer tests.
- `aether/core/parser/parser.test.ts` — parser tests.
- `aether/core/sema/sema.test.ts` — type checker tests.
- `aether/core/eval/eval.test.ts` — evaluator tests.
- `aether/stdlib/*/index.test.ts` — stdlib tests, one per module.

To run them:

```bash
bun test
```

Or with npm:

```bash
npm test
```

The test suite has 700+ tests and covers every public surface of
the compiler. See
[../decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md)
for the choice of Vitest.

### 4.1 What the tests cover

- **Lexer tests** — every token kind, every escape sequence,
  every error condition.
- **Parser tests** — every grammar production, every
  precedence level, every associativity rule, every error
  condition.
- **Sema tests** — every type rule, every type error, every
  inference case.
- **Eval tests** — every runtime behavior, every panic, the
  step limit.
- **Stdlib tests** — every function in every module, with
  examples of correct and incorrect usage.

The tests are the source of truth for what the compiler does.
When in doubt about behavior, read the test file. See
[testing.md](testing.md) for more on testing in Aether.

## 5. The planned tooling (v2)

The v2 plan adds six pieces of tooling. Each is sketched in
its own RFC.

### 5.1 REPL

A read-eval-print loop for interactive development. The plan is
to use the existing AST walker (`aether/core/eval/eval.ts`) as
the backend; the REPL is a thin wrapper that maintains a session
environment and prints each result.

Status: not in v1. The plan is in
[../spec/13-tooling.md](../spec/13-tooling.md) §2.

### 5.2 LSP

A Language Server Protocol implementation for editor
integration: syntax highlighting, autocomplete, goto-definition,
hover, diagnostics. The plan is to reuse the existing
compiler pipeline; the LSP runs `compileAndRun` on every
keystroke (debounced) and reports errors to the editor.

Status: not in v1. The plan is in
[../rfcs/rfc-005-lsp.md](../rfcs/rfc-005-lsp.md).

### 5.3 Formatter

A code formatter (`aether fmt`) that pretty-prints Aether
source. The plan is to use the existing AST and a
pretty-printer that walks it. The formatter is round-trip:
formatting a file twice produces the same output as formatting
it once.

Status: not in v1. The plan is in
[../spec/13-tooling.md](../spec/13-tooling.md) §3.

### 5.4 Linter

A linter (`aether lint`) that flags common mistakes: unused
bindings, shadowed variables, exhaustive match arms, etc. The
plan is to add lint rules incrementally; the v1 evaluator
already produces some warnings (e.g., unused imports), and the
linter will formalize and extend these.

Status: not in v1. The plan is in
[../spec/13-tooling.md](../spec/13-tooling.md) §4.

### 5.5 Package manager

A package manager (`aether`) that installs dependencies from a
registry, manages a `aether.toml` manifest, and resolves
version constraints. The plan is to use a Cargo-like model:
packages are git repositories, versions are semver, the
manifest is TOML.

Status: not in v1. The plan is in
[../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md).

### 5.6 Build tool

A build tool (`aether build`) that compiles a package to a
bytecode image. The plan is to use the v2 bytecode VM (see
[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md))
and the package manager (see
[../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md)).

Status: not in v1. The plan is in
[../spec/13-tooling.md](../spec/13-tooling.md) §5.

### 5.7 Bytecode VM

A bytecode VM that replaces the tree-walking interpreter for
production use. The plan is to keep the AST walker for the
playground and REPL (where latency matters more than
throughput) and use the VM for compiled binaries.

Status: not in v1. The plan is in
[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md).

## 6. The stack

For reference, the v1 implementation uses:

- **TypeScript** as the implementation language. The compiler
  and evaluator are TypeScript; the playground is Next.js +
  TypeScript.
- **Bun** as the test runner (`bun test`) and package manager
  (`bun install`).
- **Vitest** as the test framework.
- **Next.js 16** as the playground framework.
- **Tailwind CSS** + **shadcn/ui** for the playground UI.
- **Prisma** for the database (not used by the compiler; used
  by the playground for sharing programs).
- **Caddy** as a reverse proxy config for self-hosting.

The full stack is documented in the project README and in
[../decisions/](../decisions/). See
[../decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md)
for the test framework choice.

## 7. A workflow for learning Aether

The recommended workflow for someone learning Aether:

1. **Read** [getting-started.md](getting-started.md) and write
   the hello world program in the playground.
2. **Read** [language-basics.md](language-basics.md) and modify
   the examples in the playground.
3. **Read** [types-and-generics.md](types-and-generics.md) and
   write small programs with enums, structs, and pattern
   matching.
4. **Read** [error-handling.md](error-handling.md) and write
   small programs with `Result` and `?`.
5. **Read** [testing.md](testing.md) and add tests to one of
   your programs.
6. **Read** [stdlib-tour.md](stdlib-tour.md) and rewrite one
   of your programs to use the stdlib more.
7. **Skim** [../guides/idiomatic-aether.md](../guides/idiomatic-aether.md)
   and refactor your program to follow the patterns.

Each step is a few minutes in the playground. By the end, you
should be able to write small programs in Aether with
confidence.

## 8. A workflow for contributing to Aether

For someone who wants to contribute to the Aether compiler or
stdlib:

1. **Clone the repo** and run `bun install`.
2. **Run** `bun test` to verify the test suite passes.
3. **Read** the spec section that matches your interest:
   - Compiler front-end: [../spec/02-lexical-structure.md](../spec/02-lexical-structure.md),
     [../spec/04-expressions.md](../spec/04-expressions.md),
     [../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).
   - Type system: [../spec/03-type-system.md](../spec/03-type-system.md).
   - Stdlib: [../spec/12-stdlib.md](../spec/12-stdlib.md).
4. **Read** the implementation file that matches:
   `aether/core/lexer/lexer.ts`,
   `aether/core/parser/parser.ts`, etc.
5. **Read** the corresponding test file to see what behavior is
   expected.
6. **Make your change** and add or update tests.
7. **Run** `bun test` to verify.

The compiler is small enough to hold in your head. The whole
front-end (lexer + parser + sema + eval) is about 5000 lines of
TypeScript. The stdlib is another 3000 lines. The test suite is
about 7000 lines.

## 9. What does NOT exist in v1

To be explicit, the following things do NOT exist in v1. If you
are looking for them, you will be disappointed.

- **No syntax highlighting** in the playground editor. (The
  editor is a plain textarea.)
- **No autocomplete.** (Requires an LSP.)
- **No goto-definition.** (Requires an LSP.)
- **No hover.** (Requires an LSP.)
- **No formatter.** (Planned for v2.)
- **No linter.** (Planned for v2.)
- **No package manager.** (Planned for v2.)
- **No build tool.** (Planned for v2.)
- **No bytecode VM.** (Planned for v2.)
- **No async/await.** (Planned for v2.)
- **No borrow checker.** (Planned for v2.)
- **No modules.** (Planned for v2.)
- **No file I/O.** (The playground is in the browser.)
- **No network access.** (The playground is in the browser.)
- **No multi-file programs.** (Single source string only.)

The honest status: Aether v1 is a teaching language and a
specification. It is not a production tool. The v2 plan is to
make it production-ready; see [../rfcs/](../rfcs/) for the
roadmap.

## 10. Where to go next

- **[../spec/13-tooling.md](../spec/13-tooling.md)** — the spec
  for v2 tooling.
- **[../rfcs/](../rfcs/)** — the v2 RFCs (REPL, LSP, modules,
  bytecode VM, borrow checker).
- **[../decisions/](../decisions/)** — the ADRs that explain why
  v1 is the way it is.
- **[../reference/faq.md](../reference/faq.md)** — 50+ questions
  answered, including "Can I use it in production?".

Aether v1's tooling is minimal. The v2 plan is ambitious. The
gap between the two is real; the rest of this documentation set
helps you navigate it.
