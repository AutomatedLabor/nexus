# aether/tools/lsp — Aether Language Server Protocol

A real, working [Language Server Protocol][lsp] implementation for the Aether
language. The server speaks JSON-RPC 2.0 over stdio and provides 21 LSP
methods backed by the *actual* Aether pipeline — lex → parse → check → lint →
format → run — so every response reflects what the compiler believes about
the user's program at this moment, not a heuristic approximation.

```
┌──────────┐  stdin   ┌─────────────┐  lex/parse/check  ┌──────────────────┐
│  Editor  │ ───────► │  AetherLSP  │ ─────────────────► │  DocState cache  │
│ (VSCode, │          │             │                    │  tokens, AST,    │
│  Neovim) │  stdout  │  JSON-RPC   │  ◄── queries ────  │  types, lint     │
│          │ ◄─────── │  dispatcher │                    │  diagnostics     │
└──────────┘          └─────────────┘                    └──────────────────┘
```

[lsp]: https://microsoft.github.io/language-server-protocol/

## Quick start

Run the server directly:

```bash
bun aether/tools/lsp/lsp.ts
```

Pipe a JSON-RPC message in by hand to see it respond:

```bash
printf 'Content-Length: 60\r\n\r\n{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  | bun aether/tools/lsp/lsp.ts
```

The server replies with the full capabilities object, then keeps reading
stdin for more messages until EOF.

## Public API

```ts
export class AetherLSP {
  // Document tracking.
  openDoc(uri: string, source: string, version?: number): void;
  updateDoc(uri: string, source: string, version?: number): void;
  closeDoc(uri: string): void;

  // JSON-RPC dispatch: parses one message, returns the response (or null
  // for notifications).
  handleMessage(msg: any): any | null;

  // LSP methods — each takes the LSP params shape and returns LSP-shaped
  // responses. Tests call these directly without going through JSON-RPC.
  initialize(params: InitializeParams): InitializeResult;
  textDocumentCompletion(params: TextDocumentPositionParams): CompletionItem[];
  textDocumentHover(params: TextDocumentPositionParams): Hover | null;
  textDocumentDefinition(params: TextDocumentPositionParams): Location | null;
  textDocumentReferences(params: TextDocumentPositionParams): Location[];
  textDocumentRename(params: RenameParams): WorkspaceEdit | null;
  textDocumentDiagnostics(params: TextDocumentPositionParams): Diagnostic[];
  textDocumentFormatting(params: DocumentFormattingParams): TextEdit[];
  textDocumentCodeAction(params: CodeActionParams): CodeAction[];
  textDocumentSemanticTokens(params: SemanticTokensParams): SemanticTokens;
  textDocumentDocumentSymbol(params: DocumentSymbolParams): DocumentSymbol[];
  textDocumentSignatureHelp(params: TextDocumentPositionParams): SignatureHelp | null;
  // Plus aliases: declaration, typeDefinition, implementation, documentHighlight,
  // codeLens, publishDiagnostics (notification).
}

export function runLSP(): void; // stdio JSON-RPC loop
```

## Pipeline coupling

Every per-document state is computed once on `openDoc`/`updateDoc` and cached
on the `DocState` object:

| Stage   | Output                                | Used by                              |
|---------|---------------------------------------|--------------------------------------|
| `lex`   | `tokens`, `lexErrors`                 | semanticTokens, diagnostics          |
| `parse` | `ast: Program`, `parseErrors`        | everything except formatting        |
| `check` | `typeErrors`, `nodeTypes: Map<Expr, Type>` | hover, signatureHelp, diagnostics |
| `lint`  | `lint: LintDiagnostic[]`            | codeAction, diagnostics              |
| `format`| (called on demand in `formatting`)   | textDocumentFormatting               |

The `nodeTypes` map is *node-identity-keyed* — the type checker stores types
on the AST node object itself, not on a string id. This means each LSP query
re-uses the AST cached on `DocState`; we never look up types by `(uri, range)`.

Source positions are 1-based `line/col` in the AST and 0-based
`line/character` in LSP. The internal helpers `toLspPos`, `fromLspPos`,
`toLspRange`, and `lspPosInLoc` convert between the two conventions.

## Methods implemented (21)

### Lifecycle

#### `initialize(params)` → `InitializeResult`

Returns server capabilities: `textDocumentSync: 1` (full sync),
`completionProvider`, `hoverProvider`, `definitionProvider`, `referencesProvider`,
`renameProvider`, `documentFormattingProvider`, `codeActionProvider`,
`semanticTokensProvider` (with the legend), `documentSymbolProvider`,
`signatureHelpProvider`, `documentHighlightProvider`, `codeLensProvider`,
and `diagnosticProvider`. Also returns `serverInfo: { name: "aether-lsp",
version: "1.0.0" }`.

#### `shutdown` → `null`

Marks `shutdownRequested = true` and returns `null`. The transport loop exits
on `exit` notification.

### Document sync (notifications — no response)

#### `textDocument/didOpen` → publishes diagnostics

Calls `openDoc(uri, text, version)`, then publishes diagnostics via the
`textDocument/publishDiagnostics` notification. In tests (no `stdout` wired),
the pushed diagnostics are stored on `server.lastDiagnostics`.

#### `textDocument/didChange` → republishes diagnostics

Supports full-document sync: takes the last entry in `contentChanges` and
replaces the document text. Per LSP spec, incremental sync (with `range`)
is not implemented — full sync is what most editors send anyway.

#### `textDocument/didClose` → drops the doc

Removes the doc from the `docs` map. Subsequent queries return `[]`/`null`.

### Queries

#### `textDocument/completion` → `CompletionItem[]`

Combines four sources, deduplicated by label:

1. **Keywords** — `let`, `mut`, `const`, `fn`, `enum`, `struct`, `type`,
   `match`, `if`, `else`, `while`, `for`, `in`, `return`, `break`,
   `continue`, `print`, `true`, `false`, `unit`, `self`, `as`, `range`,
   `import`, `pub`, `use`, `or`, `do` — marked `CompletionItemKind.Keyword`.
2. **Stdlib functions** — every function in `STDLIB_MANIFEST` across all
   modules (`string`, `math`, `collections`, `io`, `datetime`, `regex`,
   `encoding`, `crypto`, `text`, `list`, `set`, `functional`, `statistics`,
   `bits`, `validate`, `tree`, `uuid`, …). Each carries its `sig` as `detail`
   and its `desc` as `documentation`.
3. **Inline builtins** — `print`, `println`, `range`, `len`, `type_of`,
   `assert`, `assert_eq`, `panic`, `str`, `int`, `float`, `min`, `max`,
   `abs`, `sqrt`, `push`, `pop`, `map`, `filter`, `reduce` — always in
   scope.
4. **Variables / functions / types in scope at the position** — collected
   by walking the AST. Includes top-level decls, function params (when
   `pos` is inside the function body), `let`/`mut`/`const` bindings whose
   location precedes `pos`, `for`-loop variables, lambda params, and
   match-arm pattern bindings.

`insertText` is always equal to `label` (no snippet placeholders yet).
`insertTextFormat` is `1` (PlainText).

#### `textDocument/hover` → `Hover | null`

Resolves the identifier under the cursor (AST `Ident` node first, then a
word-at-position fallback that catches binding names like the `x` in
`let x = 1` which have no `Ident` node). Then:

1. **Inline builtins** — short `*(builtin)*` docstring.
2. **Top-level `fn`/`enum`/`struct`/`type` declaration** — the declaration
   signature (e.g. `` `fn helper(a: int) -> int` ``). This wins over the
   type lookup so users see the *declaration*, not just the inferred type.
3. **Stdlib function** — markdown with `` `sig` `` and `desc`.
4. **Local variable** — looks up the type from `nodeTypes` if hovering on
   a usage site (`Ident` node), else infers the type from the initializer
   expression (`d.init` of the `Let`/`MutLet`/`Const`).
5. **Local `let`/`mut`/`const`** — `` `name: type` `` if type is known,
   else the declaration signature.

Returns `null` only when the name isn't a builtin, stdlib fn, or any
declaration. Hovering on whitespace, keywords, or punctuation returns
`null` because the wordAt fallback returns `null` for non-identifier
strings.

The `range` field on the returned `Hover` is always the identifier's
location (LSP 0-based coordinates).

#### `textDocument/definition` → `Location | null`

Finds the identifier under the cursor, calls `findDeclByName(name)` (which
walks top-level decls first, then nested ones via `walkKind`), and returns
the declaration's `loc` as a `Location`. Returns `null` if no declaration
exists.

#### `textDocument/declaration`, `textDocument/typeDefinition`, `textDocument/implementation`

For v1, these are aliases of `textDocument/definition`. The Aether type
system doesn't model distinct declaration-vs-definition-vs-implementation
sites yet (no separate `.h`/`.c`, no trait impls), so a single location is
correct.

#### `textDocument/references` → `Location[]`

Includes the declaration site (if any) followed by every `Ident` node with
the same name, in source order. Each location is `{uri, range}` where
`uri` is the document URI.

#### `textDocument/rename` → `WorkspaceEdit | null`

Returns `{changes: {[uri]: TextEdit[]}}` where the edits are: one for the
declaration's name position (using `nameRangeOfDecl` which calculates the
sub-range of the decl's `loc` that's just the name token) plus one per
`Ident` occurrence. All edits have `newText = params.newName`. Returns
`null` if no identifier is at the position.

#### `textDocument/diagnostic` (pull) → `Diagnostic[]`

Combines all four error sources into one sorted list:

- `lex` errors → `DiagnosticSeverity.Error`, `source: "lex"`.
- `parse` errors → `DiagnosticSeverity.Error`, `source: "parse"`.
- `type` errors → `DiagnosticSeverity.Error`, `source: "type"`.
- `lint` diagnostics → mapped from `severity` (`error`/`warning`/`info`
  → Error/Warning/Information), `source: "lint:<rule>"`, `code: <rule>`.

#### `textDocument/publishDiagnostics` (notification — pushed)

When the server is running over stdio, `didOpen`/`didChange` push the
diagnostics list to the client as a `textDocument/publishDiagnostics`
notification (the LSP-defined push channel). In tests, the notification is
captured on `server.lastDiagnostics` so the test can assert against it.

#### `textDocument/formatting` → `TextEdit[]`

Calls `format(doc.source)` from `aether/tools/formatter`. If the formatted
text equals the source (no changes), returns `[]`. Otherwise returns a
single `TextEdit` whose range covers the entire document and whose
`newText` is the formatted source.

This is a *full-document replacement* edit — the simplest pattern, since
the formatter pretty-prints the whole AST.

#### `textDocument/codeAction` → `CodeAction[]`

For every lint diagnostic that overlaps the requested `range`:

- If the lint diagnostic has a `fix` string, emits a `CodeAction` with
  `kind: "quickfix"`, `title: "Apply fix: <fix>"`, and a `WorkspaceEdit`
  that replaces the diagnostic's line with the fix text.
- If the lint diagnostic has no fix, emits a `CodeAction` with
  `kind: "quickfix"` and `title: "lint: <rule> (<message>)"` that simply
  surfaces the diagnostic (no edit) — useful for "show me what's wrong"
  flows.

The `prefer-range` lint rule is the canonical example of a rule with a
fix: it suggests replacing a `while i < N { i = i + 1 }` loop with a
`for i in range(0, N) { ... }` loop.

#### `textDocument/semanticTokens/full` → `SemanticTokens`

Emits a delta-encoded array of `(deltaLine, deltaChar, length, type,
modifiers)` 5-tuples. Token types follow the legend declared in
`initialize.capabilities.semanticTokensProvider.legend.tokenTypes`:

| Index | Type      | Source                                   |
|-------|-----------|------------------------------------------|
| 12    | function  | top-level fn names, `Ident` usages of fns |
| 15    | keyword   | every keyword token from the lexer       |
| 17    | comment   | line `//` and block `/* ... */` comments |
| 18    | string    | string + char literals                    |
| 19    | number    | int, float, hex, binary, octal literals  |
| 1     | type      | enum/struct/type-alias names              |
| 8     | variable  | `Ident` usages of variables + let names   |

Token modifiers (bitmask): `1 << 0 = declaration` — set on the
declaration's name token (e.g. the `foo` in `fn foo()`).

The encoder sorts tokens by `(line, char)` before delta-encoding so the
output is deterministic and matches what the LSP spec requires.

Comments are scanned manually because the lexer skips them — a small
state machine walks the source, tracking string/char state, and emits one
token per `//`-to-EOL or `/* ... */` span.

#### `textDocument/documentSymbol` → `DocumentSymbol[]`

Returns one `DocumentSymbol` per top-level declaration:

| Decl kind  | SymbolKind     | detail       |
|------------|---------------|--------------|
| `fn`       | Function (13) | `"fn"`       |
| `enum`     | Enum (10)     | `"enum"`     |
| `struct`   | Struct (23)   | `"struct"`   |
| `type`     | Class (5)     | `"type"`     |
| `let`      | Variable (14) | `"let"`     |
| `let mut`  | Variable (14) | `"let mut"`  |
| `const`    | Constant (15) | `"const"`    |

`range` is the whole declaration; `selectionRange` is just the name
position (using `nameRangeOfDecl`).

#### `textDocument/signatureHelp` → `SignatureHelp | null`

Finds the innermost `Call` expression whose `loc` contains `pos`, then
resolves the callee's signature:

1. **Stdlib function** — looks up `findStdlibFn(calleeName)` and parses
   the `sig` string to extract parameter labels.
2. **User fn** — looks up `findDeclByName(calleeName)` and synthesizes a
   label `fn name(p1: T1, p2: T2) -> T` from the `FnDecl`.
3. **Inferred fn type** — if neither matches, looks up the callee's
   inferred type in `nodeTypes` (must be a `TFunc`) and synthesizes
   `arg0: T0, arg1: T1, … -> Tret`.

`activeParameter` is `min(call.args.length - 1, paramCount - 1)`, clamped
at 0 — close enough to the LSP semantics for the common case (typing the
Nth argument).

Returns `null` when `pos` is not inside any `Call` expression's loc.

#### `textDocument/documentHighlight` → `DocumentHighlight[]`

Returns the declaration's name position (if any) plus every `Ident` node
with the same name as the identifier under the cursor. Each highlight has
`kind: 1` (Read — Aether doesn't yet distinguish reads/writes for
highlights).

#### `textDocument/codeLens` → `CodeLens[]`

Emits one lens per top-level `fn`: `command.title = "<N> param(s>"`
where N is the parameter count. The lens range is the function's loc.
Useful for at-a-glance signature complexity.

## JSON-RPC dispatch

`handleMessage(msg)` is the central dispatcher. It checks `msg.method`
and routes to the corresponding `textDocument*` method, returning a
`{jsonrpc:"2.0", id, result}` response for requests or `null` for
notifications. Unknown methods return a `{jsonrpc, id, error: {code:
-32601, message}}` JSON-RPC error response.

The dispatcher is intentionally synchronous — every Aether pipeline stage
is sync, so there's no need for async handlers. This keeps the test
surface simple: tests just call `handleMessage` and check the return
value.

## Transport — `runLSP()`

```ts
export function runLSP(): void {
  const server = new AetherLSP();
  server.stdout = (s) => process.stdout.write(s);
  // Read stdin, parse Content-Length-framed JSON-RPC messages,
  // dispatch each via server.handleMessage, and write the response
  // (or notification) back to stdout using the same framing.
}
```

The transport reads `Content-Length: N\r\n\r\n<json-body>` frames from
stdin, parses each as JSON, and dispatches via `handleMessage`. Responses
and notifications are written back with the same framing. The loop
exits when stdin closes (sends EOF).

Malformed headers are skipped; malformed JSON bodies are dropped (no
response — the spec doesn't define an error response for unparseable
messages). Exceptions thrown inside a handler are caught and returned as
JSON-RPC `-32603` internal errors with the message.

## Editor integration

### VSCode

Install the [`vscode-languageclient`][vlclient] npm package and write a
small extension that spawns the Aether LSP server as a child process:

```ts
const serverOptions = {
  command: "bun",
  args: ["/path/to/aether/tools/lsp/lsp.ts"],
  transport: TransportKind.stdio,
};
const clientOptions = { documentSelector: [{ scheme: "file", language: "aether" }] };
const client = new LanguageClient("aetherLSP", "Aether LSP", serverOptions, clientOptions);
client.start();
```

Add to `package.json`:

```json
{
  "contributes": {
    "languages": [{ "id": "aether", "extensions": [".ae"] }],
    "grammars": [{ "language": "aether", "scopeName": "source.aether", "path": "./syntaxes/aether.tmLanguage.json" }]
  }
}
```

[vlclient]: https://www.npmjs.com/package/vscode-languageclient

### Neovim

With [nvim-lspconfig][lspconfig], add to `lua/ lsp.lua`:

```lua
local lspconfig = require("lspconfig")
lspconfig.aether_lsp = {
  default_config = {
    cmd = { "bun", "/path/to/aether/tools/lsp/lsp.ts" },
    filetypes = { "aether" },
    root_dir = function(fname) return vim.fs.dirname(fname) end,
    settings = {},
  },
}
lspconfig.aether_lsp.setup({})
```

Then `:LspStart aether_lsp` (or auto-start on `.ae` files via an autocmd).
All capabilities declared in `initialize` (completion, hover, definition,
references, rename, formatting, code actions, semantic tokens, document
symbols, signature help, document highlights, code lenses) light up
automatically.

[lspconfig]: https://github.com/neovim/nvim-lspconfig

### Other editors (Sublime, Emacs, Helix, Zed)

Anything that speaks LSP 3.17 over stdio works. Point your editor's LSP
client at `bun /path/to/aether/tools/lsp/lsp.ts`. The server is fully
self-contained — no extra config files, no language server registry.

## Running the tests

```bash
bunx vitest run aether/tools/lsp
```

The test file (`lsp.test.ts`) contains 95 cases covering every method,
edge cases (unknown URIs, no-ident positions, empty docs), and the
JSON-RPC dispatcher itself. Each test calls `openDoc` then a `textDocument*`
method and asserts on the response shape.

## Limitations (v1)

- **Single-file projects.** The server doesn't resolve `import`
  statements; cross-file go-to-definition is not implemented. Each
  document is analyzed in isolation.
- **No incremental sync.** `didChange` requires the full new text.
  Incremental range-based edits are not parsed.
- **No workspace symbols.** `workspace/symbol` is not implemented.
- **Semantic tokens range requests** (`semanticTokens/range`) return
  empty; only the `full` request is supported.
- **No code-action resolve.** Code actions are returned fully formed;
  `codeAction/resolve` is a no-op.
- **Signature help is best-effort.** It picks the innermost enclosing
  `Call`, which is usually right but can be wrong for nested calls in
  unusual positions.

These limitations are intentional — v1 prioritizes the common path
(single-file, full-sync, real Aether pipeline) over LSP-spec completeness.
Each is a clear upgrade target for a follow-up wave.

## File layout

```
aether/tools/lsp/
├── lsp.ts          # the server (~1500 LOC)
├── lsp.test.ts     # 95 test cases
└── README.md       # this document
```
