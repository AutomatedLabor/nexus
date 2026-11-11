# 13 — Tooling

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/tools/*`
> **Spec version:** 0.1

Aether ships with a small, opinionated toolchain. Each tool is a
separate subcommand of the `aether` driver and lives in its own
directory under `aether/tools/`. Tools share the compiler's lexer,
parser, sema, and checker via the public `aether/core` API; they
do not duplicate any front-end logic.

```
aether/
└── tools/
    ├── repl/        # interactive read-eval-print loop
    ├── formatter/   # `aether fmt`
    ├── linter/      # `aether lint`
    ├── build/       # `aether build` (drives the whole pipeline)
    ├── test/        # `aether test`
    ├── lsp/         # `aether lsp` (Language Server Protocol)
    ├── docgen/      # `aether docgen`
    └── bench/       # `aether bench`
```

## 1. The `aether` driver

The driver `aether <subcommand> [flags]` dispatches to the
matching tool. Global flags:

| Flag | Effect |
|---|---|
| `--manifest <path>` | path to `aether.toml` (default: search upward) |
| `--edition <ver>`  | override edition |
| `--cfg key=value`  | additional cfg token |
| `--no-color`       | disable ANSI color in diagnostics |
| `--quiet`, `-q`    | suppress non-error output |
| `--verbose`, `-v`  | more diagnostics |
| `--profile <name>` | build profile (`debug`, `release`, `bench`) |
| `--target <triple>` | cross-compile target |
| `--offline`        | do not touch the network |
| `--frozen`         | require `aether.lock` to be up-to-date |

Exit codes: `0` success, `1` generic failure, `2` usage error,
`101` compilation failure, `102` test failure, `103` bench failure.

## 2. `aether build`

Drives the pipeline specified in [§09](./09-compiler-pipeline.md).

```
aether build [--release] [--target <triple>] [--emit <kind>...]
              [--watch] [--no-debug-info]
              [--features <list>]
```

- Default build profile: `debug`.
- `--emit` selects one or more of: `image` (default), `asm`,
  `ast`, `typed-ast`, `bytecode`, `dep-graph`, `diagnostics`.
- `--watch` recompiles on file change using the incremental
  engine ([§09 §4](./09-compiler-pipeline.md#incremental-compilation)).
- Build artifacts go to `dist/<target>/<profile>/` by default,
  configurable via `aether.toml → [build] out_dir`.

The build tool is the de-facto entry point for IDE integration
when `aether lsp` is unavailable; it produces a
machine-readable diagnostics stream (`--emit diagnostics`) that
editors can consume.

## 3. `aether fmt`

A pretty-printer that formats Aether source to a canonical form.
It is idempotent: `aether fmt <(aether fmt file)` is a no-op.

```
aether fmt [--check] [--write] [--line-width <n>]
           [<path>...]
```

- `--check` exits with code 1 if any file would be reformatted;
  prints a diff. No files are modified. (CI use.)
- `--write` writes the formatted output in place (default when
  no `--check`).
- `--line-width` (default 100) sets the target maximum line width.
  The formatter *may* exceed this for unavoidable cases (e.g. long
  string literals).

Formatting rules (a subset):

- 4 spaces per indent, no tabs.
- Trailing comma in multi-line collection literals and call args.
- Single space inside `{ ... }` blocks and around binary
  operators.
- Brace style: K&R (opening brace on same line) for `fn`,
  `struct`, `enum`, `trait`, `impl`, `mod`, `if`, `match`, `for`,
  `while`, `loop`.
- `match` arms: `pattern => expr,` with the `=>` aligned across
  arms in a block of consecutive arms.
- Imports sorted lexicographically, grouped: stdlib, external
  crates, intra-crate, with blank lines between groups.
- One item per line in struct/enum bodies; one import per line in
  `use` groups.

`aether fmt` is *not* configurable beyond the flags listed. The
philosophy is: the formatter's output is the canonical form, and
teams should not argue about it.

## 4. `aether lint`

A static analyzer that runs after sema and reports suspicious
patterns. Lints are tagged by level: `allow` (off), `warn`
(default), `deny` (error). Lints are configurable in
`aether.toml → [lints]` and per-item via `#[allow(...)]` /
`#[deny(...)]` attributes.

```
aether lint [--fix] [--no-fix] [--explain <code>]
            [-- <lint>:<level>...
```

Built-in lints (a representative subset):

| Code | Default | Description |
|---|---|---|
| `unused_imports` | warn | `use` not referenced in module |
| `unused_variables` | warn | local never read |
| `dead_code` | warn | item never reachable |
| `unreachable_code` | warn | statement after diverging expression |
| `unused_result` | warn | `Result` return value discarded |
| `unwrap_used` | allow | `.unwrap()` called |
| `panic_in_lib` | warn | `panic!` in a library crate |
| `let_underscore_must_use` | warn | `#[must_use]` return dropped |
| `match_arms_same_type` | warn | `match` arms differ in type modulo never |
| `redundant_else` | warn | `else` after `return`/`raise` in `if` |
| `if_same_then_else` | warn | `if` and `else` bodies identical |
| `large_enum_variant` | warn | enum variant much larger than others |
| `too_many_arguments` | warn | function with > 7 parameters |
| `cognitive_complexity` | warn | function complexity > threshold |
| `non_exhaustive_externals` | warn | external type not marked `#[non_exhaustive]` |
| `glob_imports_in_pub_iface` | warn | `*` import in `pub` module |
| `shadow_binding` | warn | `let` shadows a previous binding in same scope |

`--fix` applies machine-applicable suggestions emitted by the
diagnostic. `--explain <code>` prints the human-readable
explanation of a lint.

## 5. `aether test`

Runs tests declared with `#[test]` and benchmarks with `#[bench]`.

```
aether test [<filter>] [--release] [--no-run]
            [--features <list>]
            [-- <name>...]
            [--snapshot]
            [--coverage]
            [--junit <path>]
```

- A `#[test]` function takes no parameters and returns `()` or
  `Result<(), E>`. Failure is `panic!` or `Err(e)`.
- A `#[bench]` function takes a `&mut Bench` and runs the
  benchmark; reported as `mean ± stddev` of `iter` samples.
- `--snapshot` runs in snapshot mode: missing snapshots are
  created, mismatched snapshots are reported as test failures
  with a diff. Snapshots live in `tests/snapshots/` and are
  reviewed with `aether test --snapshot --review`.
- `--coverage` instruments the build for line+branch coverage.
  Report formats: `text` (default), `lcov`, `cobertura`.
- `--junit <path>` writes a JUnit XML report.

The test runner uses the `aether-test` harness package; it
parallelizes tests across tasks (not threads) within a single VM
instance.

A test file conventionally lives in `tests/<name>.ae` and is
auto-discovered. In-module tests live in a `mod tests { ... }`
block guarded by `#[cfg(test)]`.

## 6. `aether lsp`

Implements the Language Server Protocol 3.17 over stdio. Provides:

- `textDocument/didOpen`, `didChange`, `didClose`, `didSave`.
- `textDocument/publishDiagnostics` (live diagnostics on every
  keystroke via incremental sema).
- `textDocument/hover` — types, docs, and `let`-bound inferred
  types.
- `textDocument/definition`, `declaration`, `typeDefinition`,
  `implementation` — name-resolution jumps.
- `textDocument/references` — find-all-references via the
  dependency graph.
- `textDocument/rename` — workspace-wide rename, safe across
  modules.
- `textDocument/codeAction` — quick fixes from `aether lint`
  suggestions; "extract closure", "invert if", "convert to
  `let-else`".
- `textDocument/formatting` — wraps `aether fmt`.
- `textDocument/completion` — name completion + snippet
  completion for common patterns (`match`, `if let`, `for`).
- `textDocument/inlayHint` — inferred types and parameter names.
- `textDocument/semanticTokens` — semantic highlight tokens.
- `workspace/symbol` — symbol search across the workspace.

The LSP is implemented as a long-running `aether lsp` process
that hosts a `Workspace` object containing all loaded modules'
AST + side tables. Incremental updates flow from
`didChange` → re-lex+re-parse the changed file → re-run sema
for affected modules → re-emit diagnostics.

## 7. `aether docgen`

Generates reference documentation from source.

```
aether docgen [--format html|md|json]
              [--out <dir>]
              [--private]
              [--features <list>]
```

- Input: a package's `lib.ae` (and all transitively-imported
  files).
- Output: a `docs/reference/` tree (or a single JSON file).
- Doc comments (`/// ...`, `/** ... */`) become the rendered
  documentation.
- Cross-references like `[Display]` link to the named item's
  page.
- The HTML format is a static site (no JS) with a sidebar, a
  search index, and per-item anchors.
- `--private` includes non-`pub` items.

The docgen tool is used to produce both the stdlib reference
under [`docs/reference/`](../reference/) and the in-package
documentation for any package.

## 8. `aether repl`

An interactive REPL using the AST-walking interpreter
(`aether/core/eval`).

```
aether repl [--load <file>] [--no-color]
```

Features:

- Multi-line input, terminated when braces and parentheses
  balance.
- `:type <expr>` — print the inferred type of an expression.
- `:doc <name>` — print the doc comment of an item.
- `:load <file>` — load a file and bring its `pub` items into
  scope.
- `:reload` — re-load all loaded files (incremental sema).
- `:bench <expr>` — time an expression over 1000 iterations.
- `:quit` (or EOF).
- History persisted to `~/.aether/repl-history`.
- Tab completion of identifiers and module paths.

The REPL uses the same `Workspace` infrastructure as the LSP, so
semantics are identical.

## 9. `aether bench`

Runs benchmarks declared with `#[bench]` and produces a
report.

```
aether bench [<filter>] [--release] [--json <path>]
              [--baseline <name>] [--save-baseline <name>]
              [--warmup <secs>] [--sample <n>]
```

- Each benchmark runs `--sample` (default 100) iterations after a
  `--warmup` (default 1s) period.
- The result is a statistical summary: mean, median, stddev,
  95th/99th percentile, throughput.
- `--baseline` compares against a previously saved baseline and
  reports regressions/improvements with confidence intervals.
- `--json <path>` writes a machine-readable report (consumable
  by CI).

The benchmark harness is designed for micro-benchmarks of pure
functions. For async benchmarks, use `#[bench(async)]` and the
harness wraps the future in a `Runtime::block_on`.

## 10. Built-in macros

Aether has no user-defined macros in 0.1. A small set of built-in
macros is provided by the compiler. They are listed here so the
tooling section can describe their expansion behavior uniformly.

| Macro | Form | Expansion |
|---|---|---|
| `format!(fmt, args...)`  | interpolation string + named/positional args | `String` |
| `println!(...)`         | `format!(...)` followed by `\n`, then `io::stdout().write_all` | `()` |
| `print!(...)`           | `format!(...)` then write without newline | `()` |
| `eprintln!(...)`        | same, to stderr | `()` |
| `dbg!(expr)`            | print `expr = <value>` at `expr`'s source location, return `expr` | `expr`'s type |
| `panic!(msg, args...)`  | construct a `Panic` payload, unwind | `!` |
| `todo!()`               | `panic!("not yet implemented")` | `!` |
| `unreachable!()`        | `panic!("internal error: unreachable")` | `!` |
| `assert!(cond, args...)` | on `false`, `panic!(...)` | `()` |
| `assert_eq!(a, b, ...)` | `assert!(a == b)` with a rich failure message | `()` |
| `assert_ne!(a, b, ...)` | `assert!(a != b)` | `()` |
| `select! { ... }`       | race futures, take first ready (§07 §4.5) | branch's type |

Each macro is expanded by the parser at parse time (so error
spans point at the macro call site, not at the expansion).
Macros are not first-class; they cannot be passed as values.

## 11. Conformance

A conformant toolchain MUST provide every subcommand listed in
this section with the flags listed, MUST use the same diagnostic
format as the compiler (`Diagnostic` struct, §09 §3), and MUST
exit with the documented exit codes.

The toolchain MAY provide additional subcommands, additional
flags, and additional lints, provided the defaults are
conformant.
