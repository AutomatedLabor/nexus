# RFC-005 — LSP, formatter, linter for Aether v2

> Status: Draft
> Stage: 0 (Proposal)
> Discussion: open
> Related: [RFC-003 modules and packages](rfc-003-modules-and-packages.md), [RFC-002 bytecode VM](rfc-002-bytecode-vm.md)

## Summary

Aether v2 introduces a Language Server Protocol (LSP) implementation that provides: diagnostics (lex/parse/type errors), hover (type info), autocompletion, go-to-definition, find-references, document symbols, formatting, semantic tokens (syntax highlighting), rename refactoring, code actions (quick fixes), and inlay hints (parameter names, inferred types). The LSP is paired with a formatter (`aether fmt`) and a linter (`aether lint`) that share the LSP's diagnostics infrastructure. The LSP runs as a separate process; the playground's editor upgrades to CodeMirror 6 with LSP integration.

This RFC specifies the LSP message surface, the formatter rules, the linter rules, the playground integration, and the relationship to the v1 playground's plain textarea.

## Motivation

Aether v1 has no LSP, no formatter, no linter. The playground uses a plain `<textarea>` with line numbers; errors appear in a tab; there's no syntax highlighting, no autocompletion, no hover, no go-to-definition. See [ADR-07](../decisions/adr-07-single-playground-route.md) and [the tooling tutorial](../tutorials/tooling.md) § 2.

The motivation for v2 is to make Aether feel like a "real language" in modern editors (VS Code, Neovim, Zed, Helix, Emacs) and to upgrade the playground's editor to one with first-class editing affordances. Concretely:

1. **Diagnostics inline.** Errors should appear under the cursor in the editor, not in a separate tab. The LSP's `textDocument/publishDiagnostics` provides this.
2. **Type info on hover.** Hovering over an identifier should show its type. The LSP's `textDocument/hover` provides this.
3. **Autocompletion.** Typing `printl` should suggest `println`. The LSP's `textDocument/completion` provides this.
4. **Go-to-definition.** Cmd-click on a function name should jump to its declaration. The LSP's `textDocument/definition` provides this.
5. **Rename refactoring.** Changing a function's name everywhere it's used. The LSP's `textDocument/rename` provides this.
6. **Formatting.** `aether fmt` (and the editor's format-on-save) should produce a canonical style. The LSP's `textDocument/formatting` provides this.
7. **Linting.** Stylistic and suspicious patterns should produce warnings inline. The LSP's `publishDiagnostics` with `Warning` severity provides this.

The motivation is *not* to build a custom IDE — the strategy is to support existing editors via the standard LSP protocol.

## Detailed design

### LSP message surface

The Aether LSP implements (planned messages in italics):

- `initialize` — negotiate capabilities. The server declares what it can do (diagnostics, hover, completion, definition, references, formatting, rename, code actions, semantic tokens, inlay hints).
- `initialized` — confirm the negotiation.
- `shutdown` — server is shutting down.
- `textDocument/didOpen` — open a document; the server parses and type-checks, sending `publishDiagnostics`.
- `textDocument/didChange` — edit a document; the server re-parses incrementally, sends updated `publishDiagnostics`.
- `textDocument/didClose` — close a document.
- `textDocument/publishDiagnostics` — server → client; push lex/parse/type/lint errors with severity and source range.
- `textDocument/hover` — return type info for an expression. For `id(42)` at the call site, hovering over `id` shows `fn<T>(x: T) -> T`, instantiated as `fn(int) -> int`.
- `textDocument/completion` — return a list of names in scope: bindings, functions, enum variants, struct fields, stdlib functions. For `printl`, suggest `print`, `println`, `printList`, `printf` (when added).
- `textDocument/definition` — jump to the declaration of an identifier. Uses the module resolution algorithm (RFC-003) to find the source file.
- `textDocument/references` — find all uses of an identifier in the workspace.
- `textDocument/documentSymbol` — list the top-level items in a file (functions, enums, structs, type aliases) for outline view.
- `textDocument/formatting` — return a list of text edits to format the document.
- `textDocument/rangeFormatting` — format a range.
- `textDocument/onTypeFormatting` — format as you type (e.g., reindent on `}`).
- `textDocument/rename` — return a list of edits to rename an identifier across the workspace.
- `textDocument/prepareRename` — validate a rename before doing it.
- `textDocument/codeAction` — return quick fixes for a given range (e.g., "add missing match arm", "wrap in Option::Some").
- `textDocument/semanticTokens/full` — return syntax-highlighting tokens (keywords, types, functions, enum variants, struct fields).
- `textDocument/semanticTokens/range` — semantic tokens for a range.
- `textDocument/inlayHint` — return parameter-name hints and inferred-type hints.
- `textDocument/signatureHelp` — show function signature as the user types arguments.
- `textDocument/documentHighlight` — highlight occurrences of the identifier under the cursor.

### Diagnostics

Each diagnostic has:

- `range` — `{start: {line, col}, end: {line, col}}` in the source.
- `severity` — `Error` (compile-blocking), `Warning` (lint), `Info` (e.g., unused), `Hint` (e.g., suggested fix).
- `source` — `"aether"` (so the editor knows which tool produced it).
- `message` — human-readable, single line.
- `code` — a string code (e.g., `"E0001"` for type errors, `"W0001"` for unused bindings).
- `relatedInformation` — links to other diagnostics (e.g., for borrow-checker errors that involve two locations).

The diagnostic codes are documented in the [error catalog](../reference/error-catalog.md).

### Hover

For an identifier under the cursor, the hover returns:

- The identifier's type (for bindings, function parameters, struct fields).
- The function's signature (for `fn` declarations and closures).
- The enum/struct definition (for type names).
- The stdlib function's signature and description (for inline builtins and stdlib functions — pulled from the MANIFEST).

```aether
let x = 42;
//       ^^ hovering here shows: `x: int`
fn add(a: int, b: int) -> int { a + b }
//   ^^ hovering here shows: `fn add(a: int, b: int) -> int`
let doubled = map([1, 2, 3], fn(x: int) -> int { x * 2 });
//   ^^^^^^^ hovering here shows: `doubled: [int]`
//                 ^^^ hovering here shows: `inline fn map<T, U>(arr: [T], fn: fn(T) -> U) -> [U]`
```

### Completion

For each cursor position, completion suggests:

- Names in scope (bindings, functions, types, enum variants).
- Stdlib functions (from the MANIFEST).
- Inline builtins.
- Struct field names (after `MyStruct {`).
- Enum variant names (after `match x { MyEnum::`).
- Method names (after `x.` — for v2's method syntax).
- Snippets (e.g., `match` → `match expr { _ => ... }`).

The completion list is filtered by what's syntactically valid at the cursor position (e.g., you don't get function names after `let x =`).

### Go-to-definition

Cmd-click on an identifier jumps to its declaration. For:

- A binding: the `let` statement.
- A function: the `fn` declaration.
- An enum variant: the variant in the `enum` declaration.
- A struct field: the field in the `struct` declaration.
- A type: the `enum`/`struct`/`type` declaration.
- An imported name: the `pub` item in the imported module (across files, via RFC-003's module resolution).

### Find-references

Find all uses of an identifier across the workspace. Returns a list of `{uri, range}` for each use. Useful for refactoring.

### Document symbols

List the top-level items in a file:

```aether
// myapp/main.ae
fn add(a: int, b: int) -> int { ... }
enum Color { Red, Green, Blue, }
struct Point { x: int, y: int }
type Age = int;
```

Returns:

```
+ add (function)
+ Color (enum)
+ Point (struct)
+ Age (type alias)
```

The editor shows this in the outline view.

### Formatting

`aether fmt` rewrites a `.ae` file in a canonical style. The rules:

- 2-space indentation.
- Trailing expression of a block on its own line, not after `=>` or `=`.
- One statement per line.
- Spaces around binary operators, after commas, after `:` in type annotations, before `{` in blocks.
- No space between a function name and its `(`.
- No space inside `(` and `)` for argument lists.
- Trailing comma allowed (and preferred) in multi-line collection literals.
- Single quotes for char literals, double quotes for strings.
- `match` arms indented two spaces; `=>` aligned in a column when arms are similar (within 5 chars width).
- Blank line between top-level items (configurable).
- No trailing whitespace; final newline at end of file.

The formatter is based on the AST (it parses, then pretty-prints the AST). This is the standard approach (Prettier, rustfmt). The implementation is in `aether/fmt/`.

```aether
// before
fn add(a:int,b:int)->int {a+b}

// after
fn add(a: int, b: int) -> int {
  a + b
}
```

### Linting

`aether lint` checks for stylistic and suspicious patterns. Rules:

- `unused_binding` — a `let` that's never read.
- `unused_param` — a function parameter that's never used (suggest `_name`).
- `unwrap_used` — calling `unwrap` on a `Result` (suggest `?` or `match`).
- `panic_used` — calling `panic` in a library (suggest `Result`).
- `match_wildcard_first` — `_` arm before specific arms (unreachable code).
- `infinite_loop` — a `while true` with no `break`.
- `string_concat_in_loop` — `s = s + ...` in a loop (suggest a buffer or `join`).
- `redundant_let` — `let x = x` (re-binding to itself).
- `needless_return` — explicit `return` when the trailing expression would work.
- `comparison_to_empty` — `xs == []` instead of `len(xs) == 0`.
- `inefficient_to_string` — `format("{}", x)` instead of `str(x)`.
- `unwritten_unsafe` — a function that should be marked `unsafe` (RFC-004) but isn't.

The linter is configurable: `aether.toml` (or `; aether-lint: off` inline) turns rules on/off. The linter runs as part of the LSP, surfacing warnings as `Warning` severity diagnostics.

### Inlay hints

Inlay hints are virtual annotations shown inline in the editor:

- **Parameter names** at call sites: `add(/*a=*/ 1, /*b=*/ 2)` — the comments are virtual, not source.
- **Inferred types** on bindings: `let x: int = 42` — the `: int` is virtual if the user didn't write it.
- **Closure parameter types**: `map(xs, fn(x: int) -> int { x * 2 })` — the `: int` and `-> int` are virtual.

Inlay hints are toggleable in the editor.

### Playground integration

The playground's editor upgrades from a plain `<textarea>` to CodeMirror 6 (a small, fast, modern editor) with LSP integration via `@codemirror/lsp` (or a custom wrapper). The LSP server runs in a Web Worker (separate from the evaluator's worker); the editor talks to it via `postMessage`.

The benefits:

- Syntax highlighting (via `@codemirror/lang-aether` or a CodeMirror 6 Lezer grammar).
- Inline diagnostics (red squiggles under errors).
- Hover tooltips (type info).
- Autocompletion (CodeMirror's `@codemirror/autocomplete` shows the LSP's suggestions).
- Cmd-click go-to-definition (within the playground: scrolls to the line; across modules: not supported in v1 playground).
- Format-on-save (calls `aether fmt` via the LSP).

The playground keeps the simple-mode option (a plain `<textarea>`) for users who want the v1 experience.

## Alternatives considered

### Keep the v1 textarea editor

Don't upgrade the playground's editor. The v1 plain textarea works; users can write Aether code in it; errors appear in a tab. The motivation for v2 is to upgrade to a "real" editor experience; the textarea doesn't provide that.

### Build a custom editor

Build a custom Aether editor in React from scratch. Advantages: tight integration, no dependency. Disadvantages: huge implementation cost (a real editor is 10,000+ lines), can't match the polish of CodeMirror/Monaco. The v2 design uses CodeMirror 6.

### Use Monaco (VS Code's editor)

Monaco is a heavyweight but full-featured editor. Advantages: more features than CodeMirror, used by VS Code. Disadvantages: large bundle (1+ MB), less flexible than CodeMirror, not as good for mobile. The v2 design uses CodeMirror 6 (smaller, more flexible).

### Tree-sitter instead of LSP

Tree-sitter is a parsing library that enables syntax highlighting and incremental parsing in many editors. It doesn't provide hover, completion, go-to-definition, or diagnostics — those need a separate LSP. The v2 design uses both: Tree-sitter for syntax highlighting (the CodeMirror grammar), LSP for the rest.

## Drawbacks

- **Implementation cost.** An LSP is a multi-month project; the formatter is another month; the linter is ongoing (every rule is its own design). The total v2 effort is substantially larger than v1.
- **Editor compatibility.** Each editor (VS Code, Neovim, Zed, Helix, Emacs) integrates with LSP slightly differently. We'll test on VS Code and Neovim first; the others may need tweaks.
- **Performance.** The LSP has to type-check on every keystroke. The sema has to be incremental (only re-check what changed). The v1 sema is whole-program; v2 needs an incremental variant. This is a substantial implementation work.
- **Two parsers.** The CodeMirror grammar (Lezer) is a separate parser from the Aether parser. They have to stay in sync (the same syntax, the same error recovery). The mitigation is to generate the Lezer grammar from the Aether parser's grammar (a build step).
- **The v1 playground keeps the textarea.** Users who like the simple v1 experience can keep using it; the v2 playground will have a "simple mode" toggle.

## Open questions

1. **Incremental type-checking.** How fine-grained is the re-check on edit? Per-binding, per-function, per-module. The v2 design tracks this; the v1 sema re-checks the whole program (fast enough for small programs, but won't scale to a 10K-line file).
2. **Cross-file rename.** `textDocument/rename` across modules requires resolving the identifier across the module graph. The v2 design supports this; the implementation is non-trivial.
3. **Code-action complexity.** Quick fixes like "add missing match arm" need to know the enum's variants and generate the arm bodies. The v2 design supports simple quick fixes (add `;`, wrap in `Option::Some`); complex ones (generate match arms) are deferred.
4. **Inlay hint noise.** Showing parameter names on every call is noisy. The v2 design lets users toggle per-kind (parameter names, inferred types, closure types).
5. **Playground LSP latency.** Running an LSP in a Web Worker adds message-passing latency. For small documents (<1000 lines), this is sub-millisecond; for large documents, it's noticeable. The v2 design uses request coalescing to mitigate.
6. **Formatter idempotence.** Running `aether fmt` twice should produce the same output as running it once. This is a property of the formatter; the v2 design tests it.

## Cross-references

- [RFC-003 modules and packages](rfc-003-modules-and-packages.md) — the module resolution algorithm used by go-to-definition.
- [RFC-002 bytecode VM](rfc-002-bytecode-vm.md) — the runtime for `aether run` and `aether test` (via the LSP's `textDocument/codeLens`).
- [../decisions/adr-07-single-playground-route.md](../decisions/adr-07-single-playground-route.md) — the playground's current single-route architecture.
- [../decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md) — the implementation test runner.
- [../tutorials/tooling.md](../tutorials/tooling.md) § 3 — the v2 plan from the tooling angle.
- [../tutorials/testing.md](../tutorials/testing.md) § 5 — the v2 test runner integration.

## Prior art

- **rust-analyzer** — the Rust LSP. The closest analogue; Aether's LSP design follows rust-analyzer's patterns.
- **TypeScript Language Service** — the TS LSP (used by VS Code and others). The diagnostic format and completion are similar.
- **gopls** — Go's LSP.
- **pyright** — Microsoft's Python LSP.
- **Prettier** — the formatter design (AST-based pretty-printing).
- **ESLint** — the linter design (configurable rules, severity levels).

## Status

This RFC is at stage 0 (Proposal). The next step is to prototype the LSP's diagnostic publishing for the v1 playground (without the CodeMirror upgrade, just publishing diagnostics to a virtual document and showing them inline) to validate the protocol. If the prototype works, the RFC moves to stage 1 (Implementation sketch) and the CodeMirror integration is specified in detail.
