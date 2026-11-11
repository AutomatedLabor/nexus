# Tooling — the playground and the v2 plan

> Audience: you want to know what tools Aether has, what's planned, and what's not coming.
> Time: ~30 minutes.

This tutorial covers what the Aether v1 tool surface looks like (the playground, that's basically it), what the v2 plan adds (REPL, LSP, formatter, linter, package manager, build tool), and what's not on the roadmap (a debugger, a profiler GUI, an IDE, a package registry).

---

## 1. v1 tooling — the playground

The Aether playground is a single Next.js page at the project root route (`/`). It's the entire v1 user surface. There is no CLI, no `aether` binary, no `npm install -g aether`, no IDE extension, no LSP server, no formatter, no linter.

### Architecture

The playground is:

- **Frontend**: a Next.js 16 + React 19 + Tailwind 4 + shadcn/ui app. The page lives in `src/app/page.tsx`. It composes the playground shell from `src/components/playground/*.tsx`. State is held in a Zustand store (`src/lib/view-store.ts`).
- **The Aether runtime**: the TypeScript implementation of Aether — `aether/core/*` (lexer, parser, sema, eval) and `aether/stdlib/*` (10 modules). This runs in the browser, in a Web Worker (`src/lib/aether-worker.ts`) so the main thread stays responsive when a program is running.
- **Charts**: Recharts (see [ADR-04 recharts for benchmark viz](../decisions/adr-04-recharts-for-benchmark-viz.md)) is used for the Benchmarks view's bar charts.
- **Persistence**: code is in the Zustand store (in-memory); "Share" encodes the code in the URL hash so you can bookmark or send a link.

The user-facing views:

| View | What it does |
|------|--------------|
| Playground | Editor + Output panel + AST / Tokens / Errors / Stats tabs. This is where you write code. |
| Examples | Bundled `.ae` programs: `fibonacci.ae`, `fizzbuzz.ae`, `primes.ae`, `json_parser.ae`, `linked_list.ae`. Click to load. |
| Stdlib | Searchable index of all 212 stdlib functions, grouped by module, with signatures. |
| Benchmarks | Runs 6 canned programs and charts elapsed milliseconds and step counts. |
| Explorer | Every example file in the repo, including `.md` "readme" pairs. |
| About | Version, links. |

The playground is documented in [ADR-07 single playground route](../decisions/adr-07-single-playground-route.md) — the decision to keep it one page rather than multiple routes.

### The editor

The editor is a `<textarea>` with line numbers (the `CodeEditor` component). It's not CodeMirror or Monaco — v1 deliberately uses a plain textarea to keep the implementation small and to avoid any heavyweight editor dependency. (v2 may upgrade to CodeMirror or Monaco for syntax highlighting, autocompletion, and bracket matching; see [RFC-005 LSP](../rfcs/rfc-005-lsp.md).)

Keyboard shortcuts:

- `Ctrl/Cmd + Enter` — Run.
- `Ctrl/Cmd + S` — Share (encodes the code in the URL hash).

There's no `Ctrl/Cmd + Z` undo (the browser's native textarea undo works), no autocomplete, no syntax highlighting, no inline error squiggles. The Errors tab shows errors as a list with line/column.

### The output panel

The output panel has five tabs:

- **Output** — the captured stdout from the program (the `output` array in `RunResult`). One entry per `println`; `print` adds an entry without a newline (well, `print` and `println` both push entries — the difference is whether a trailing newline is included in the rendered display).
- **AST** — the parsed abstract syntax tree, as a tree-like structure. Useful when you're not sure what the parser actually saw.
- **Tokens** — the lexed token stream. Useful for lexer-level bugs (e.g., a string that didn't terminate).
- **Errors** — the flat list of errors, color-coded by stage (lex, parse, type, runtime).
- **Stats** — the step count, elapsed milliseconds, and the value of the last top-level expression.

### The compile pipeline

Behind every "Run" button press, `compile(source)` runs four stages and returns a `CompileResult`:

```
source → lex → parse → check → run
```

The pipeline is in `aether/core/index.ts` (the `compile` and `compileAndRun` functions). Each stage is non-fatal — errors are accumulated, downstream stages still run with whatever partial output is available. This is "lenient playground semantics": the user sees *all* errors at once, not just the first.

The `CompileResult` shape:

```ts
{
  tokens: Token[],
  parseErrors: ParseError[],
  ast: Program,
  typeErrors: TypeError[],
  runtime: RunResult | null,
  ok: boolean,
  errors: Array<{ stage, message }>,
}
```

The pipeline is documented in the [getting-started tutorial](getting-started.md) § 6 and the [performance tutorial](performance.md) § 2.

---

## 2. What's *not* in v1

Things you might expect from a "real language" that Aether v1 deliberately doesn't have:

- **No CLI.** There's no `aether` binary. You can't `aether run program.ae` from a shell. The runtime is a TypeScript module that you import and call; the playground is its only UI.
- **No REPL.** There's no interactive read-eval-print loop. You can run a program, see its output, edit it, run it again — but you can't incrementally evaluate expressions in a session.
- **No LSP.** There's no Language Server Protocol implementation. Your editor (VS Code, Neovim, etc.) doesn't know about Aether — no syntax highlighting, no autocompletion, no go-to-definition, no hover, no inline errors.
- **No formatter.** There's no `aether fmt` and no formatter integration. The "Format" button in the playground toolbar pretty-prints the *AST* panel, not the source.
- **No linter.** There's no `aether lint` and no lint integration. The type checker catches type errors; that's the only static analysis.
- **No package manager.** There's no `aether install`, no `aether.toml`, no package registry. Programs are single files; you can't `import` other Aether files (the parser accepts `import` but it's never resolved — see [ADR-05 no modules in v1](../decisions/adr-05-no-modules-in-v1.md)).
- **No build tool.** There's no `aether build` producing a binary or a bundle. The runtime is the runtime; there's no separate "compiled" output.
- **No debugger.** There's no step-through debugger (beyond the **Steps** view, which shows the evaluation steps but doesn't let you step interactively).
- **No profiler GUI.** There's no flamegraph, no allocation profiler, no CPU profiler. The **Stats** tab shows step count and elapsed ms.
- **No test runner.** There's no `aether test`. The convention is to put assertions in your program and run it; see [testing.md](testing.md).
- **No benchmark framework.** There's no `aether bench`. The **Benchmarks** view runs six canned programs; that's it.

Each of these is a v2 deliverable. The reasoning behind *not* doing them in v1 is documented in the [decisions](../decisions/) directory — the short version is implementation cost vs. audience (v1 is a teaching playground, not a production tool).

---

## 3. The v2 plan — what's coming

The v2 plan adds tooling in this order (from [RFC-005 LSP](../rfcs/rfc-005-lsp.md) and [RFC-003 modules and packages](../rfcs/rfc-003-modules-and-packages.md)):

### 3.1. REPL — earliest

The v2 REPL is `aether` (no args) on the command line, or a "Console" view in the playground. It's an interactive session: type an expression, see its value. Multi-line input is supported with `:paste` mode.

```sh
$ aether
Aether v2.0.0  (type :help for help, :quit to exit)
> let x = 42
x: int = 42
> fn sq(n: int) -> int { n * n }
sq: fn(int) -> int
> sq(5)
25
> :type sq
fn(int) -> int
> :quit
```

Implementation: the tree-walker is already REPL-friendly (it's a synchronous evaluator). The v2 work is mostly the *interface* — a line editor with history, multi-line paste, type/value display, the `:help` / `:type` / `:quit` commands. The playground would have a "Console" view that runs the same REPL.

### 3.2. LSP — early

The v2 LSP implements:

- `textDocument/didOpen`, `didChange`, `didClose` — keep the document in memory.
- `textDocument/publishDiagnostics` — push lexer/parser/type errors as LSP diagnostics, with severity and source range.
- `textDocument/hover` — show the type of an expression on hover. For `id(42)`, hovering over `id` shows `fn<T>(x: T) -> T`, instantiated as `fn(int) -> int` at this call site.
- `textDocument/completion` — suggest names in scope: bindings, functions, enum variants, struct fields, stdlib functions. For `print`, suggest `print`, `println`, `printList`, `printf`...
- `textDocument/definition` — jump to the definition of an identifier.
- `textDocument/references` — find all uses of an identifier.
- `textDocument/documentSymbol` — list the top-level items in a file (functions, enums, structs, type aliases) for outline view.
- `textDocument/formatting` — pretty-print the source (depends on the formatter, §3.3).
- `textDocument/semanticTokens` — color syntax highlighting: keywords, types, functions, enum variants, struct fields.

The LSP server is the same Aether compiler (lexer + parser + sema), exposed via JSON-RPC. It runs as a separate process; the editor connects via stdio. The LSP also powers the playground's planned editor upgrade (CodeMirror 6 + `@codemirror/lsp` or similar).

### 3.3. Formatter — early

`aether fmt` rewrites a `.ae` file in a canonical style. The rules (sketch):

- 2-space indentation.
- Trailing expression of a block on its own line, not after `=`.
- One statement per line.
- Spaces around binary operators, after commas, after `:` in type annotations.
- No space between a function name and its `(`.
- Trailing comma allowed (and preferred) in multi-line collection literals.
- Single quotes for char literals, double quotes for strings.
- `match` arms indented two spaces; `=>` aligned in a column when arms are similar.

```aether
// before
fn add(a:int,b:int)->int {a+b}

// after
fn add(a: int, b: int) -> int {
  a + b
}
```

The formatter is based on the AST (it parses, then pretty-prints the AST). This is the standard approach (Prettier, rustfmt). The implementation is in `aether/fmt/` (planned).

### 3.4. Linter — mid

`aether lint` checks for stylistic and suspicious patterns. Examples of rules:

- `unused_binding` — a `let` that's never read.
- `unused_param` — a function parameter that's never used (suggest `_name`).
- `unwrap_used` — calling `unwrap` on a `Result` (suggest `?` or `match`).
- `panic_used` — calling `panic` in a library (suggest `Result`).
- `match_wildcard_first` — `_` arm before specific arms (unreachable code).
- `infinite_loop` — a `while true` with no `break`.
- `string_concat_in_loop` — `s = s + ...` in a loop (suggest a buffer or `join`).

The linter is configurable: `aether.toml` (or `; aether-lint: off` inline) turns rules on/off. The linter runs as part of the LSP, surfacing warnings as `Warning` severity diagnostics.

### 3.5. Package manager — late

`aether.toml` declares a package:

```toml
[package]
name = "my-aether-app"
version = "0.1.0"
edition = "v2"

[dependencies]
aether-http = "1.2"
serde = { version = "0.4", source = "github:aether-lang/serde" }
```

`aether install` fetches dependencies into `aether_modules/`. `aether build` compiles the package + deps into a bytecode bundle. `aether publish` uploads to the package registry (planned, hosted).

The package manager is the biggest v2 deliverable — it requires the module system (RFC-003), the build tool, and the registry. It's last on the v2 list.

### 3.6. Build tool — late

`aether build` compiles a package to a bytecode bundle (see [RFC-002 bytecode VM](../rfcs/rfc-002-bytecode-vm.md)). The bundle is a single file (`build/main.aec`) that the v2 VM executes. The build tool also produces type stubs (`.aei` files) for the package's public API, so consumers can type-check against your library without re-parsing your source.

### 3.7. Debugger — late

The v2 debugger is a step-through debugger with breakpoints, watch expressions, and call stack inspection. The interface is DAP (Debug Adapter Protocol) — the same protocol VS Code and Neovim use for, e.g., the JavaScript and Python debuggers. The implementation runs the bytecode VM with a debug flag that suspends at breakpoints.

### 3.8. Profiler — late

A sampling profiler that produces a flamegraph of where the program spent time. The v2 implementation uses the bytecode VM's instruction counter; samples are taken every N instructions. The output is a flamegraph SVG (the standard perf/Brendan Gregg format).

---

## 4. What's *not* on the roadmap

Things that aren't coming, even in v2:

- **A native IDE.** Aether targets existing editors (VS Code, Neovim, Emacs, Zed, Helix) via LSP and DAP. Building a dedicated IDE is a multi-year project with no audience benefit over the LSP/DAP approach.
- **A self-hosted compiler.** The Aether compiler stays in TypeScript; v2 might rewrite parts in Aether itself (the parser is the easiest), but the compiler's host language stays TS. (Compare Rust, where the compiler is in Rust — that worked because Rust had a different goal: a production language with a long runway. Aether is a teaching language first.)
- **A visual builder.** No "drag-and-drop Aether blocks" UI. The text is the program.
- **A hosted cloud playground.** The playground runs in your browser; your code doesn't leave your machine. A cloud-hosted version (with sharing, collaboration, history) is not planned — bookmark the Share URL instead.
- **AI integration in the playground.** Not planned as a v1 or v2 feature. The `z-ai-web-dev-sdk` in `package.json` is for other parts of the host app, not the playground.
- **Mobile.** The playground works on mobile browsers but is not optimized for them; no native app is planned.

---

## 5. The playground's "About" view

The About view in the playground sidebar shows:

- The Aether version (currently "v1", plus a build hash).
- A short description of the language.
- Links to the docs (`/docs/tutorials`, `/docs/spec`, `/docs/decisions`, `/docs/rfcs`).
- A link to the source (the `aether/` directory in the repo).
- A "what's new" list — recent changes to the implementation or the stdlib.

It's a static view; the content is in `src/components/playground/views/about-view.tsx`.

---

## 6. The Benchmarks view — what it tells you

The Benchmarks view runs six canned programs and shows a bar chart of elapsed milliseconds and step counts. The benchmarks (from `src/components/playground/views/benchmarks-view.tsx`):

| ID | Label | Code |
|----|-------|------|
| `fib-20` | `fib(20)` | naive recursive Fibonacci, ~13.5K calls |
| `fib-25` | `fib(25)` | ~150K calls |
| `sum-500k` | sum 1..500K | `for` loop summing 500,000 ints |
| `str-concat` | string concat 5K | build a 5000-char string by `+` |
| `array-build` | array build 10K | `push` 10,000 elements into an array |
| `factorial-100` | `factorial(100)` | 100 recursive calls |

The benchmarks run with `maxSteps: 50_000_000` (50 million) — well above the default 1M, so even the slowest won't hit the step limit.

The chart shows:

- **Elapsed milliseconds** — wall time for the run. This is heavily dependent on your machine and browser; the same program might take 50ms on a fast desktop and 500ms on a slow phone.
- **Step count** — the number of evaluation steps. This is *deterministic* — same program, same steps, every run, every machine. The step count is the better number for comparing implementations of the same algorithm.

Use the Benchmarks view to:

- See roughly how fast the tree-walker is (tens of milliseconds for these programs).
- Compare the cost of recursion vs. iteration: `fib(20)` is ~13.5K steps; the equivalent iterative `fib` is ~40 steps. The chart makes the difference visible.
- See what blows the step limit (if you bump up `n` in `fib`): `fib(30)` is ~2.7M calls, which exceeds the default 1M step limit and panics. The Benchmarks view uses 50M, so it runs, but slowly.

For a deeper discussion of what the numbers mean and what to do about them, see [performance.md](performance.md).

---

## 7. Sharing playground state

The "Share" button encodes the current code in the URL hash. The URL becomes something like:

```
https://aether-lang.example/#<base64-of-code>
```

Loading that URL in a browser decodes the hash and loads the code into the editor. This is the v1 sharing mechanism — no server, no accounts, no persistence beyond the URL itself.

The URL encoding is in `src/lib/view-store.ts` and the playground view's share handler. It's deliberately simple — no compression, no server roundtrip, no expiry. The code is in the URL; you can bookmark it, send it in chat, paste it in an issue.

The v2 plan (in [RFC-003](../rfcs/rfc-003-modules-and-packages.md) § 11) adds a "Gist" model — short URLs that point to a server-side store. This is needed when the code gets too long for a URL hash (>2000 chars, the practical limit for bookmarks).

---

## 8. The playground's tech stack

For the curious — the v1 playground uses:

- **Next.js 16** (React 19) — the app framework.
- **TypeScript 5** — the host language for the playground and the Aether implementation.
- **Tailwind CSS 4** — the styling system. `tailwind.config.ts` is the entry; `src/app/globals.css` has the theme.
- **shadcn/ui** — the component library (Radix UI primitives + Tailwind). Components in `src/components/ui/*.tsx`.
- **Zustand** — the view state. `src/lib/view-store.ts` is the global store.
- **Recharts** — the benchmark charts. `src/components/playground/views/benchmarks-view.tsx`.
- **Vitest** — the test runner for the Aether implementation. `vitest.config.ts` is the config; tests are in `aether/**/*.test.ts`.
- **Prisma + NextAuth** — server-side auth, database (planned for v2 cloud features; not used by the v1 playground itself).
- **bun** — the JS runtime for development (`bun.lock`).
- **ESLint 9** — the linter for the TypeScript code (not for Aether).

The dependencies in `package.json` (the `dependencies` block) are the full list. The `devDependencies` block is the build/test tooling.

---

## 9. What's next

- [performance.md](performance.md) — what the Benchmarks view shows in detail, and how to write fast code within the step limit.
- [decisions/adr-07-single-playground-route.md](../decisions/adr-07-single-playground-route.md) — why the playground is one page.
- [decisions/adr-03-zustand-for-view-state.md](../decisions/adr-03-zustand-for-view-state.md) — why Zustand.
- [decisions/adr-04-recharts-for-benchmark-viz.md](../decisions/adr-04-recharts-for-benchmark-viz.md) — why Recharts.
- [decisions/adr-10-browser-runnable-core.md](../decisions/adr-10-browser-runnable-core.md) — why the runtime runs in the browser.
- [rfcs/rfc-005-lsp.md](../rfcs/rfc-005-lsp.md) — the LSP design.
- [rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md) — the package manager design.

Aether v1's tooling story is, in three sentences: the playground is the entire user surface — editor, output, AST, tokens, errors, stats, examples, stdlib docs, benchmarks. There's no CLI, no LSP, no formatter, no linter, no package manager, no build tool — those are v2. The playground is built with Next.js 16 + React 19 + Tailwind 4 + shadcn/ui + Zustand + Recharts + Vitest, and the Aether runtime itself is plain TypeScript that runs in a Web Worker.
