# RFC-007 — LSP implementation plan

> Status: Draft
> Stage: 1 (Proposal)
> Discussion: open
> Related: [RFC-005 LSP](rfc-005-lsp.md) (the design), [ADR-15 v2 keeps tree-walker](../decisions/adr-15-v2-keeps-tree-walker.md), [ADR-09 vitest-for-implementation-tests](../decisions/adr-09-vitest-for-implementation-tests.md)

> This RFC is the **implementation plan** for the LSP specified in RFC-005. RFC-005 is the design (what the LSP does, what messages it supports, what features it provides). This RFC is the implementation (how we build it, what files we touch, what tests we write, what the milestones are).

## Summary

RFC-005 specifies the LSP *interface*: diagnostics, hover, completion, go-to-definition, find-references, formatting, semantic tokens, rename, code actions, inlay hints. This RFC specifies the *implementation*: the language server process, the document state model, the incremental-recompile strategy, the request handlers, the test plan, the playground integration, and the editor extensions.

The LSP is a separate process (a Node/Bun script) that talks JSON-RPC to the editor. The first editor is VS Code (via a small extension that just launches the server and proxies JSON-RPC). Neovim, Zed, Helix, Emacs follow via the standard LSP protocol.

## Motivation

RFC-005 covers the user-facing motivation (diagnostics inline, hover, completion, etc.). This RFC's motivation is *engineering*: how do we build the LSP without bloating the codebase, without regressing the v1 tree-walker (which is the LSP's primary execution backend, per ADR-15), and without locking out future backends (WASM, native).

The specific challenges:

1. **Incremental recompile.** The LSP has to react to every keystroke. A full lex+parse+sema on every keystroke is too slow (~100ms for a 1000-line file). We need incremental parsing and incremental type-checking.
2. **Document state.** The LSP holds the document in memory. Edits (textDocument/didChange) modify it; the LSP has to maintain a consistent view across requests.
3. **Request latency.** Hover, completion, go-to-def should respond in <50ms. Type-check can be slower (~100ms) but should not block the editor.
4. **Cross-file navigation.** Go-to-def may jump to another file (the imported module). The LSP has to load and parse all imported files.
5. **Test surface.** The LSP is a separate process; testing it requires spawning the process, sending JSON-RPC messages, and asserting on the responses. This is more complex than unit-testing a function.

## Detailed design

### The language server process

`aether/tools/lsp/lsp.ts` is the language server entry point. It's a Node/Bun script that:

1. Reads JSON-RPC messages from stdin (framed with `Content-Length:` headers, per LSP spec).
2. Dispatches each message to a handler (a method on the `LSPServer` class).
3. Writes JSON-RPC responses to stdout.
4. Publishes diagnostics via `textDocument/publishDiagnostics` notifications.

The server is *stateful*: it holds the open documents in a `Map<uri, Document>`, and on each `didChange` it re-lexes, re-parses, re-type-checks the affected document (and any documents that depend on it).

### The document state

```typescript
class Document {
  uri: string;
  version: number;
  text: string;
  tokens: Token[];
  ast: AST;
  errors: { lex: LexError[]; parse: ParseError[]; type: TypeError[] };
  // Cached analyses:
  symbols: Symbol[];     // for completion, go-to-def
  references: Reference[]; // for find-references
  semanticTokens: SemanticToken[];
}
```

Each document is a complete parse-and-type-check result. The LSP keeps the documents in memory; on `didChange`, it re-parses and re-checks.

### Incremental recompile

A full lex+parse+sema on a 1000-line file is ~100ms. The LSP can't do that on every keystroke — the editor would lag.

The strategy:

1. **Debounce.** The LSP debounces `didChange` notifications by 200ms. If the user types fast, only the latest state is re-compiled.
2. **Incremental lex.** The lexer can re-lex just the changed range (a few lines around the edit). v2.1.
3. **Incremental parse.** The parser can re-parse just the changed statement (or block). v2.1.
4. **Incremental type-check.** The type checker can re-check just the changed scope. v2.2.

For v2.0 (the initial release), we do *non-incremental* recompile with debouncing. The 200ms debounce is enough for interactive use; the full recompile is fast enough for files up to ~5000 lines. Incremental everything is a v2.1+ optimization.

### Request handlers

The LSP server has a handler per LSP method. The handlers are:

- `initialize` — set up the server, return capabilities.
- `initialized` — the editor's ack.
- `shutdown` — clean up.
- `textDocument/didOpen` — add a document.
- `textDocument/didChange` — modify a document (debounced).
- `textDocument/didClose` — remove a document.
- `textDocument/publishDiagnostics` — push diagnostics (notification, not a request).
- `textDocument/hover` — return type info for a position.
- `textDocument/completion` — return completion items.
- `textDocument/definition` — return go-to-def location.
- `textDocument/references` — return find-references locations.
- `textDocument/documentSymbol` — return the symbol outline.
- `textDocument/formatting` — return edits to format the document.
- `textDocument/semanticTokens/full` — return semantic tokens (for syntax highlighting).
- `textDocument/rename` — return a workspace edit (renames everywhere).
- `textDocument/codeAction` — return code actions (quick fixes for linter suggestions).
- `textDocument/inlayHint` — return inlay hints (parameter names, inferred types).

### Diagnostics

Diagnostics are pushed via `textDocument/publishDiagnostics` whenever the document changes. The diagnostics are:

- **Lex errors** — from the lexer (Chapter 7's error catalog § 1).
- **Parse errors** — from the parser (§ 2).
- **Type errors** — from the type checker (§ 3).
- **Lint warnings** — from the linter (Chapter 13 § 13.3).

Each diagnostic has: a `range` (start and end position), a `severity` (Error, Warning, Information, Hint), a `message`, a `source` (e.g., "lex", "type", "lint"), and an optional `code` (for code-action lookup).

### Hover

`textDocument/hover` returns the *type* of the identifier at the given position. The LSP walks the AST to find the identifier, looks up its type in the type checker's environment, and returns a markdown-formatted string:

```
  ```aether
  fn(int) -> int
  ```
  
  Defined at /path/to/file.ae:42:1.
```

For functions, the hover includes the full signature and the doc comment (planned for v2.1's `aether doc`).

### Completion

`textDocument/completion` returns completion items. The LSP:

1. Walks the AST to find the identifier being completed (the "trigger").
2. Determines the context (are we in a `match` arm? a call argument? a `let` initializer?).
3. Returns completions from:
   - The current scope's bindings (locals, parameters).
   - The imported modules' exports.
   - The stdlib functions (filtered by the context — e.g., only functions when the trigger is a call).
   - The keywords (when the trigger is at the start of a statement).

Each completion item has: a `label` (the name), a `kind` (Function, Variable, Keyword, etc.), a `detail` (the type signature), and an `insertText` (what to insert, possibly with snippets for parameters).

### Go-to-definition

`textDocument/definition` returns the location of the identifier's declaration. The LSP:

1. Walks the AST to find the identifier.
2. Looks up the declaration in the type checker's environment.
3. If the declaration is in the current file, returns its range.
4. If the declaration is in an imported file, opens that file (loads it if not already loaded) and returns its range.

### Find-references

`textDocument/references` returns all the locations where the identifier is used. The LSP:

1. Walks the AST to find the identifier.
2. Determines the symbol (the binding, function, or type).
3. Walks the AST again, finding all uses of the symbol.
4. Optionally walks imported files (if the symbol is exported).

### Document symbols

`textDocument/documentSymbol` returns the outline of the document. The LSP walks the AST and returns the top-level declarations:

- `fn` declarations (with their parameter lists).
- `struct`, `enum`, `type` declarations.
- `let`, `const` declarations.

### Formatting

`textDocument/formatting` returns edits to format the document. The LSP calls the existing formatter (`aether/tools/formatter/formatter.ts`) and returns the diff as a list of `TextEdit` objects.

### Semantic tokens

`textDocument/semanticTokens/full` returns the semantic tokens for syntax highlighting. The LSP walks the AST and tags each token with a type (Keyword, Function, Variable, Type, String, Number, Operator, etc.) and modifiers (Declaration, Definition, Readonly, etc.).

### Rename

`textDocument/rename` returns a workspace edit that renames the symbol everywhere. The LSP:

1. Finds the symbol (like find-references).
2. For each use, computes the new text (the new name).
3. Returns the edits as a `WorkspaceEdit`.

(Some symbols can't be renamed: stdlib functions, built-in types. The LSP returns an error in those cases.)

### Code actions

`textDocument/codeAction` returns quick fixes for diagnostics. The LSP maps each linter rule to a code action:

- `unused-mut` → "Remove `mut`".
- `unused-binding` → "Remove unused binding".
- `unnecessary-semicolon` → "Remove `;`".
- `if-else-unnecessary` → "Simplify to `cond`".

Each code action has a `title`, an `edit` (the changes to apply), and a `kind` (Quick Fix, Refactor, etc.).

### Inlay hints

`textDocument/inlayHint` returns inlay hints — small annotations that the editor shows inline. For Aether:

- Parameter names in function calls: `print(value="hello")` (the `value=` is an inlay hint).
- Inferred types on `let` bindings without annotations: `let x = 42` shows `: int` as an inlay hint.
- The variant name on enum constructions: `Option::Some(v)` shows the variant's type.

Inlay hints are optional; the editor can turn them off.

## Playground integration

The playground's editor (currently a `<textarea>`) is upgraded to CodeMirror 6 with LSP integration. CodeMirror's `@codemirror/lsp` package provides the JSON-RPC client; the playground launches the LSP as a Web Worker (in-browser, via `bun build`'s worker support or via a separate WASM build).

The playground's LSP integration uses the *same* server as the editor extensions — the server is browser-runnable (see ADR-10) and Node-runnable.

## Editor extensions

### VS Code

`aether/tools/lsp/editors/vscode/` is a small VS Code extension:

- Launches the LSP as a child process.
- Proxies JSON-RPC between VS Code and the LSP.
- Adds the "Aether" language ID (with file association for `*.ae`).

The extension is ~100 lines of TypeScript; the heavy lifting is in the LSP.

### Neovim

Neovim's built-in LSP client (`vim.lsp.start_client`) connects to the LSP as a child process. The user adds a small `init.lua` snippet to register the Aether LSP.

### Zed, Helix, Emacs

Zed, Helix, and Emacs all support the standard LSP protocol. The user adds a small config snippet to point them at the LSP.

## Test plan

The LSP is tested at three levels:

1. **Unit tests** (in `lsp.test.ts`):
   - Each handler is tested with a mock document and a mock request.
   - The diagnostics, hover, completion, go-to-def, find-references, rename, formatting, code actions, inlay hints are each tested with a small test corpus.

2. **Integration tests** (in `lsp.integration.test.ts`):
   - The full LSP server is spawned; JSON-RPC messages are sent; responses are asserted on.
   - The test corpus is the same as the v1/v2 test corpus (~1455 tests).

3. **Editor smoke tests** (in `lsp.smoke.test.ts`):
   - The VS Code extension is launched; a small Aether file is opened; the diagnostics and hover are checked.

## Implementation milestones

- **M1 (1 week):** Skeleton server. Initialize, didOpen, didChange, didClose, publishDiagnostics. Diagnostics for lex/parse/type errors.
- **M2 (1 week):** Hover, completion, go-to-def, find-references, documentSymbol.
- **M3 (1 week):** Formatting, semanticTokens, rename.
- **M4 (1 week):** Code actions (linter integration), inlay hints.
- **M5 (1 week):** VS Code extension, Neovim config, smoke tests.
- **M6 (1 week):** Playground integration (CodeMirror 6 + LSP Web Worker).
- **M7 (1 week):** Documentation, ADR update, RFC-005 closure.

Total: ~7 weeks for a complete LSP, end-to-end.

## Drawbacks

- **Implementation cost.** ~3000 lines of new TypeScript (server + handlers + tests + extension).
- **Maintenance.** The LSP has to be updated for every new language feature (new AST nodes, new sema checks, new linter rules).
- **Latency.** Non-incremental recompile is OK for files up to ~5000 lines; larger files will need the v2.1 incremental work.
- **Complexity.** JSON-RPC, document state, debouncing, cross-file navigation — the LSP is the most complex tool in Aether's toolbox.

## Alternatives

### Alternative 1: Use an existing LSP framework (e.g., `vscode-languageserver`)

The `vscode-languageserver` Node package provides boilerplate for the LSP server.

**Pros:**

- Less code to write; the framework handles the JSON-RPC plumbing.

**Cons:**

- Adds a dependency (the Aether project is currently zero-dependency in the core).
- The framework's abstractions may not fit Aether's needs.

**Rejected** for v2.0 to keep the project zero-dependency. v2.1 may revisit if the boilerplate becomes a burden.

### Alternative 2: Use Tree-sitter for incremental parsing

Tree-sitter is an incremental parser generator. It would give us incremental parse for free.

**Pros:**

- Incremental parse out of the box.

**Cons:**

- Adds a native dependency (Tree-sitter is C with WASM bindings).
- Aether's parser is hand-written; rewriting in Tree-sitter's grammar is a big effort.

**Rejected** for v2.0. v2.x may revisit if incremental parsing becomes a bottleneck.

## Open questions

1. **Multi-file project support.** The LSP needs to load imported files. How does this interact with the file system (Node) vs the in-browser virtual file system (playground)?
2. **Workspace symbols.** `workspace/symbol` (search across all files) — needed?
3. **Call hierarchy.** `textDocument/prepareCallHierarchy` — needed?
4. **Code lenses.** `textDocument/codeLens` (e.g., "run this function") — useful for Aether's REPL-style code?

## Stages

- **Stage 0** — RFC-005 (the design).
- **Stage 1** (this RFC) — the implementation plan.
- **Stage 2** — M1-M2 (skeleton + basic features). Prototype.
- **Stage 3** — M3-M4 (advanced features). Beta.
- **Stage 4** — M5-M6 (editor integrations + playground). Release candidate.
- **Stage 5** — M7 (docs, ADR update, RFC closure). Release.

## Backwards compatibility

The LSP is *new*; no existing code breaks. The CLI keeps all its commands; the LSP is a separate process.

## Summary

This RFC is the implementation plan for the LSP specified in RFC-005. The LSP is a separate process that talks JSON-RPC to editors (VS Code, Neovim, Zed, Helix, Emacs) and to the playground (via a Web Worker). The implementation is ~7 weeks of work, organized into 7 milestones (M1-M7). The LSP uses the existing v1 tree-walker for low-latency features (hover, completion, go-to-def — these use the type checker, not the execution backend), and the existing formatter and linter for their respective features.

The next step is M1: the skeleton server with `initialize`, `didOpen`, `didChange`, `didClose`, and `publishDiagnostics`.
