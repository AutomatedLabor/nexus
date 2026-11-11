# Chapter 13 — Tooling

> Aether v2's tooling: the CLI (run, run:vm, check, test, fmt, repl, new, build), the formatter (idempotent, brace-depth-based indentation), the linter (30 rules, in progress), the planned LSP, the test runner, and the docgen. This chapter covers each.

---

## 13.1 The CLI

`aether/tools/cli/cli.ts` is the standalone `aether` CLI. Run via `bun aether/tools/cli/cli.ts` (or `node` after a build).

### 13.1.1 Commands

```
aether run <file.ae>              Compile + run on the tree-walker.
aether run:vm <file.ae>           Compile + run on the bytecode VM.
aether check <file.ae>            Compile + print type errors only.
aether test <dir>                 Discover + run *.test.ae / *.ae with assert.
aether fmt <file.ae> [--check]    Re-indent based on brace depth (writes file).
                                  With --check, exit 1 if the file would change.
aether repl                        Interactive REPL (or read from stdin if piped).
aether new <name>                  Scaffold a new project.
aether build <file.ae> -o <out>   Compile to bytecode + write assembled binary.
aether help                        Print the usage message.
```

### 13.1.2 Exit codes

- `0` — success.
- `1` — compile / runtime / parse / test failure.
- `2` — CLI usage error (unknown command, missing arg, file not found).

### 13.1.3 Examples

Run a file:

```bash
$ aether run examples/fibonacci.ae
== Fibonacci implementations ==
  n  |  recursive  |  iterative  |  memoized
-----+-------------+-------------+-------------
  15 |  610        |  610        |  610
  ...
```

Type-check only:

```bash
$ aether check examples/fibonacci.ae
# (no output if clean; errors otherwise)
```

Run on the VM:

```bash
$ aether run:vm examples/fibonacci.ae
# (same output, faster)
```

Run tests:

```bash
$ aether test examples/
# discovers examples/*.test.ae (or *.ae with assert/assert_eq)
# runs each, prints pass/fail, exits 1 if any fail
```

Format a file:

```bash
$ aether fmt examples/fibonacci.ae
# (writes the formatted file in place)

$ aether fmt --check examples/fibonacci.ae
# (exit 1 if the file would change; useful in CI)
```

REPL:

```bash
$ aether repl
Aether REPL v2. Type :help for help.
> let x = 42;
> print(x);
42
> :quit
```

Scaffold a new project:

```bash
$ aether new myproject
Created myproject/
  myproject/main.ae
  myproject/README.md
  myproject/aether.toml
```

Build to bytecode:

```bash
$ aether build examples/fibonacci.ae -o fib.bin
Wrote fib.bin (3.2k bytes)
```

---

## 13.2 The formatter

`aether/tools/formatter/formatter.ts` is Aether's formatter. It's *idempotent* — running it twice produces the same output as running it once. The formatting rules:

### 13.2.1 Indentation

Indentation is 2 spaces per brace-depth level:

```aether
fn f() -> () {
  let x = 1;
  if x > 0 {
    print("positive");
  }
}
```

The formatter re-indents based on `{` and `}` depth. (It doesn't track parens or brackets — only braces, since they're the block delimiter.)

### 13.2.2 Semicolons

The formatter *normalizes* semicolons:

- Always adds a `;` after a statement that needs one (let, expression statement, return, break, continue).
- Removes `;;` and trailing `;` after `}`.

```aether
// Before:
let x = 42 ;;
fn f() -> () { print("hi"); };

// After:
let x = 42;
fn f() -> () { print("hi"); };
```

### 13.2.3 Spaces

- One space after each comma in a parameter list / argument list / array / tuple.
- One space after the `:` in a type annotation.
- One space around binary operators (`+`, `-`, `*`, `/`, `==`, etc.).
- No space around `.` (field access), `::` (variant access), or `[]` (indexing).
- One space before and after `=>` in a match arm.

```aether
// Before:
fn f(x:int,y:int)->int{x+y}
let p = Point{x:1,y:2};

// After:
fn f(x: int, y: int) -> int { x + y }
let p = Point { x: 1, y: 2 };
```

### 13.2.4 Trailing commas

The formatter *adds* trailing commas in multi-line lists:

```aether
// Before:
enum Color {
  Red,
  Green,
  Blue
}

// After:
enum Color {
  Red,
  Green,
  Blue,
}
```

(Single-line lists don't get a trailing comma: `[1, 2, 3]` stays.)

### 13.2.5 Empty lines

- At most one consecutive empty line.
- No empty lines at the top or bottom of a block.
- One empty line between top-level declarations (`fn`, `struct`, `enum`).

### 13.2.6 Idempotency

Running `aether fmt` twice on the same file produces the same output as running it once. This is a hard rule — the formatter is its own fixpoint. The test suite (`formatter.test.ts`) verifies this on a corpus of ~50 files.

### 13.2.7 What the formatter doesn't do

- Re-wrap long lines (no line-length limit enforced).
- Reorder imports (planned for v2.1).
- Re-order struct fields or enum variants (deliberate — order is meaningful).
- Format comments beyond indentation.

---

## 13.3 The linter

`aether/tools/linter/linter.ts` is Aether's linter. 30 rules (in progress; some are implemented, some are planned). The rules fall into categories:

### 13.3.1 Style rules

- `unused-mut` — `let mut` binding that's never reassigned. Suggest `let`.
- `unused-binding` — `let` binding that's never read. Suggest removing it.
- `unused-parameter` — function parameter that's never used in the body. Suggest renaming to `_` or removing.
- `unnecessary-semicolon` — `;` after a block expression (e.g., `if x { 1 };`).
- `double-semicolon` — `;;`. (Already handled by the formatter.)
- `trailing-comma` — multi-line lists should have a trailing comma. (Already handled by the formatter.)

### 13.3.2 Correctness rules

- `unreachable-code` — code after a `return`, `break`, `continue`, or `panic`.
- `match-arms-after-wildcard` — `match` arms after a `_ => ...` arm (unreachable).
- `if-else-unnecessary` — `if cond { true } else { false }` — simplify to `cond`.
- `if-always-true` — `if true { ... }` with no `else` (the `if` is redundant).

### 13.3.3 Suspicious-pattern rules

- `float-equality` — `f == 0.0` (float equality is fragile; suggest `abs(f - 0.0) < epsilon`).
- `int-division-by-zero` — `x / 0` (constant zero divisor).
- `modulo-by-zero` — `x % 0`.
- `empty-array-len` — `len([])` (constant 0).
- `infinite-loop` — `while true { ... }` with no `break`.
- `match-non-exhaustive` — `match` without a `_` arm and without enumerating all variants (v1 doesn't check exhaustiveness; the linter can warn).

### 13.3.4 Performance rules

- `string-concat-in-loop` — `s = s + ...` inside a loop (O(n²)). Suggest a `StringBuilder` (planned for v2.1) or `join`.
- `map-filter-chain` — `map(filter(xs, ...), ...)` — suggest `filter` then `map` (avoids mapping filtered-out elements).
- `repeated-len-in-loop` — `while i < len(xs) { ... }` — `len(xs)` is recomputed each iteration (it's not cached in v1).

### 13.3.5 Idiomatic rules

- `prefer-option-result` — `null` literals (planned for v2.x) or `panic` for expected failure. Suggest `Option`/`Result`.
- `prefer-pattern-match` — chain of `if x is Option::Some { ... }` (planned for v2.x). Suggest `match`.
- `prefer-for-over-while` — `let mut i = 0; while i < n { ...; i = i + 1; }` — suggest `for i in range(0, n) { ... }`.

### 13.3.6 Running the linter

```bash
$ aether lint examples/fibonacci.ae
examples/fibonacci.ae:42:3  warning  unused-mut  binding `cache` is never reassigned
examples/fibonacci.ae:58:1  warning  match-non-exhaustive  match may miss variants
```

(Or in the planned LSP integration, inline as diagnostics — see RFC-007.)

The linter is in progress; the full 30 rules will be complete in v2.1.

---

## 13.4 The test runner

`aether test <dir>` discovers and runs tests:

- Files named `*.test.ae` are run as tests.
- Files named `*.ae` that contain at least one `assert` or `assert_eq` call are also run as tests.
- Each file is compiled and run. If it panics (from `assert`/`assert_eq`), the test *fails*. Otherwise it *passes*.
- The runner prints a summary: `12 passed, 0 failed` and exits 0 if all passed, 1 if any failed.

### 13.4.1 Writing a test

A test is a regular Aether file with `assert` / `assert_eq` calls:

```aether
// mytest.test.ae
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

assert_eq(fib(10), 55);
assert_eq(fib(15), 610);
assert_eq(fib(0), 0);
assert_eq(fib(1), 1);

// If any assertion fails, the test fails with the message:
// assertion failed: <a> != <b>
```

### 13.4.2 Test conventions

- Test files go in `tests/` or alongside the source they test.
- File names: `<module>.test.ae` for unit tests; `tests/<feature>.ae` for integration tests.
- A test that's expected to fail (a "negative test") goes in a file with `_fails` in the name and uses `panic` directly (planned for v2.1: `// expect-error`).

---

## 13.5 The REPL

`aether repl` is an interactive REPL. It reads from stdin, evaluates each expression/statement, and prints the result. Multi-line input is supported (the REPL detects unclosed braces and continues reading).

### 13.5.1 REPL commands

- `:help` — print the help.
- `:quit` (or `:q`) — exit.
- `:type expr` — print the type of `expr`.
- `:load file.ae` — load a file into the REPL's environment.
- `:reset` — clear the REPL's environment.
- `:vm` — toggle the VM backend.
- `:time expr` — evaluate `expr` and print the elapsed time.

### 13.5.2 REPL state

The REPL keeps state across lines (you can `let x = 42;` on one line and `print(x);` on the next). The state is the evaluator's environment.

### 13.5.3 REPL piped from stdin

If stdin is piped (not a TTY), the REPL reads the entire input as a single Aether program and runs it. This is useful for scripting:

```bash
$ echo 'print(1 + 2);' | aether repl
3
```

---

## 13.6 The planned LSP

Aether v2.x will have a full LSP (Language Server Protocol) implementation — RFC-007. The LSP will provide:

- **Diagnostics** — lex/parse/type errors inline in the editor.
- **Hover** — type info on hover.
- **Autocompletion** — names, keywords, types.
- **Go-to-definition** — jump to the declaration.
- **Find-references** — find all uses of a name.
- **Document symbols** — outline view.
- **Formatting** — `textDocument/formatting`.
- **Semantic tokens** — syntax highlighting.
- **Rename refactoring** — rename a symbol everywhere.
- **Code actions** — quick fixes for linter suggestions.
- **Inlay hints** — parameter names, inferred types.

The LSP will be a separate process (a Node/Bun script), talking JSON-RPC to the editor. The first editor to be supported is VS Code (via a small extension); Neovim, Zed, Helix, and Emacs will follow via the standard LSP protocol.

See RFC-007 for the implementation plan.

---

## 13.7 Docgen

Aether v2.x will have a docgen tool (`aether doc`) that extracts doc comments from source files and produces HTML or Markdown documentation. The format (planned):

```aether
/// Compute the nth Fibonacci number.
/// - `n` must be >= 0.
/// - Time: O(2^n) for the naive version; O(n) for the iterative version.
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
```

The `///` (three slashes) marks a doc comment. The docgen tool extracts these and produces:

- A `fn` page with the signature, the doc comment, examples (from any `# Example:` blocks in the comment), and cross-references to other documented items.
- A module index page listing all documented items.
- A search index.

(Docgen is a v2.1 item; not yet implemented.)

---

## 13.8 The benchmarks view

The playground has a Benchmarks view that runs six canned benchmarks (`fib-15`, `fib-20`, `sum-500k`, `str-concat`, `array-build`, `factorial-100`) on both backends and shows the elapsed ms and step counts, bar-charted.

The benchmarks view is the quickest way to see the v2 VM's speedup over the v1 tree-walker (Chapter 9's numbers come from this view).

---

## 13.9 The examples view

The playground's Examples view has 17 canned programs:

1. `fibonacci.ae` — three Fibonacci implementations.
2. `fizzbuzz.ae` — the classic.
3. `quicksort.ae` — recursive quicksort.
4. `interpret_brainfuck.ae` — a Brainfuck interpreter in Aether.
5. `json_parser.ae` — a hand-written JSON parser.
6. `linked_list.ae` — a singly-linked list from a recursive enum.
7. `binary_tree.ae` — a binary search tree.
8. `game_of_life.ae` — Conway's Game of Life.
9. `calculator.ae` — an arithmetic expression calculator.
10. `number_guessing.ae` — a number-guessing game.
11. `primes.ae` — the Sieve of Eratosthenes.
12. `string_utils.ae` — string manipulation examples.
13. `expression_formatter.ae` — a code formatter.
14. `matrix_ops.ae` — matrix multiplication.
15. `todo_cli.ae` — a small TODO CLI.
16. `string_utils.md` — markdown writeup.
17. (Plus several `.md` writeups of each example.)

These examples double as the canonical test corpus for backend parity (Chapter 9).

---

## 13.10 Eight runnable examples (CLI commands)

**1. Run on the tree-walker.**

```bash
aether run examples/fibonacci.ae
```

**2. Run on the VM.**

```bash
aether run:vm examples/fibonacci.ae
```

**3. Type-check.**

```bash
aether check examples/fibonacci.ae
```

**4. Run tests.**

```bash
aether test examples/
```

**5. Format in place.**

```bash
aether fmt examples/fibonacci.ae
```

**6. Format check (for CI).**

```bash
aether fmt --check examples/fibonacci.ae
```

**7. Scaffold a new project.**

```bash
aether new myproject
```

**8. Build to bytecode.**

```bash
aether build examples/fibonacci.ae -o fib.bin
```

---

## 13.11 Summary

- The CLI has 8 commands: `run`, `run:vm`, `check`, `test`, `fmt`, `repl`, `new`, `build`.
- Exit codes: 0 success, 1 compile/runtime/test failure, 2 CLI usage error.
- The formatter is idempotent, brace-depth-based, with rules for indentation, semicolons, spaces, trailing commas, and empty lines.
- The linter has 30 rules across style, correctness, suspicious patterns, performance, and idioms — in progress for v2.1.
- The test runner discovers `*.test.ae` and any `.ae` with `assert`/`assert_eq`, runs each, and reports pass/fail.
- The REPL is interactive (or piped from stdin for scripting).
- The planned LSP (RFC-007) will provide diagnostics, hover, completion, go-to-def, find-refs, rename, code actions, inlay hints.
- Docgen (planned for v2.1) will extract `///` doc comments to HTML or Markdown.

The next chapter is writing idiomatic Aether: 20 patterns + 20 anti-patterns.
