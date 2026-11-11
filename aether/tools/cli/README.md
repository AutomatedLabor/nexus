# Aether CLI — `aether/tools/cli`

> The standalone `aether` command-line tool. Runs Aether programs on
> either the tree-walker or the bytecode VM, checks for type errors,
> discovers + runs tests, formats source, scaffolds new projects, builds
> bytecode binaries, and provides an interactive REPL.

## 1. What this is

`aether/tools/cli/cli.ts` is a real, runnable CLI — invoke it with:

```sh
bun aether/tools/cli/cli.ts <command> [args]
# or, after `bun install`:
bun run aether <command> [args]
# or, after the bin is symlinked:
aether <command> [args]
```

The CLI dispatches on the first argument and prints results to stdout /
errors to stderr. It returns an exit code: 0 for success, 1 for compile /
runtime / test failures, 2 for usage errors (unknown command, missing
arg, file not found).

## 2. Commands

### `aether run <file.ae>`

Compile + run an Aether file on the tree-walker (the v1 runtime). Print
the program's stdout. Exit 1 on any compile / runtime error; exit 2 if the
file can't be read.

```sh
$ cat hello.ae
print("Hello, Aether!");
$ aether run hello.ae
Hello, Aether!

$ cat fib.ae
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
print(fib(10));
$ aether run fib.ae
55
```

**Multi-file support.** If the entry file contains `import { ... } from
"./mod.ae";`, the CLI routes through `runModule` (see
`aether/core/modules/modules.ts`) for full multi-file resolution. The
single-file path uses `compile` directly (no module-system overhead).

```sh
$ cat main.ae
import { greet } from "./utils.ae";
print(greet("Aether"));
$ cat utils.ae
pub fn greet(name: string) -> string { "Hello, " + name + "!" }
$ aether run main.ae
Hello, Aether!
```

### `aether run:vm <file.ae>`

Same as `run` but uses the bytecode VM (the v2 runtime target). The VM
is faster than the tree-walker and is the production runtime target.
Multi-file programs aren't supported via VM yet (the `compileToVm` API is
single-file); use `aether run` for those.

```sh
$ aether run:vm fib.ae
55
```

### `aether check <file.ae>`

Compile + print type errors only (no run). Exits 1 if there are any type,
parse, or lex errors; exits 0 with `OK` if clean.

```sh
$ aether check hello.ae
OK

$ cat typerr.ae
let x: int = "hello";
$ aether check typerr.ae
aether check: type: expected int, found string
$ echo $?
1

$ cat parseerr.ae
let x = ;
$ aether check parseerr.ae
aether check: parse: unexpected token ';' at 1:9
aether check: parse: expected ';', found '<eof>' at 2:1
```

Type errors are non-fatal in the playground (a script with type warnings
still runs); `aether check` makes them fatal — useful in CI.

### `aether test <dir>`

Discover and run all `*.test.ae` files in the directory tree (recursively).
Also discovers any `*.ae` file containing `assert` or `assert_eq`. Each
file is compiled + run via `compile`; the file passes if the run produces
no runtime error (assertions inside the program panic on failure, which
surfaces as a runtime error).

Prints one line per test (`PASS <file>` or `FAIL <file>: <error>`), then a
summary (`N passed, M failed`). Exits 1 if any test failed, 0 otherwise.

```sh
$ ls tests/
t1.test.ae    # assert_eq(1+1, 2);
t2.test.ae    # assert_eq(2+2, 4);
fail.test.ae  # assert_eq(1, 2);

$ aether test tests/
PASS tests/t2.test.ae
FAIL tests/fail.test.ae: assertion failed: 1 != 2
PASS tests/t1.test.ae

2 passed, 1 failed
$ echo $?
1
```

### `aether fmt <file.ae> [--check]`

Re-indent the source based on brace depth. Writes the formatted source
back to the file (in place). With `--check`, exits 1 if the file would
change (doesn't write); exits 0 if already formatted. Useful in CI to
enforce consistent formatting.

The formatter is intentionally simple (brace-depth-based indenting, 2
spaces per level, trailing whitespace stripped). It is NOT a full
pretty-printer — that's a Wave 3 deliverable. The current formatter:

- Strips trailing whitespace.
- Re-indents each line to `2 * braceDepth` spaces (de-indents lines
  starting with `}`).
- Counts `{` and `}` at brace depth, skipping those inside string / char
  literals and line / block comments.
- Preserves blank lines.
- Preserves a trailing newline if the source had one; doesn't add one if
  the source had none.

```sh
$ cat unfmt.ae
fn foo() {
let x = 5;
if x > 0 {
print("positive");
};
}

$ aether fmt unfmt.ae
aether fmt: formatted 'unfmt.ae'

$ cat unfmt.ae
fn foo() {
  let x = 5;
  if x > 0 {
    print("positive");
  };
}

$ aether fmt unfmt.ae --check
$ echo $?
0

$ aether fmt unfmt.ae --check   # if we mess it up
$ echo $?
1
```

### `aether repl`

Interactive REPL (read-eval-print loop). Type Aether code at the prompt;
each line is compiled + run; the value of the last expression is printed.
`:q` to quit, `:help` for help.

For non-interactive use (piped stdin), reads all of stdin and runs as one
program. Useful for scripting:

```sh
$ echo 'print("hello from repl");' | aether repl
hello from repl
```

The interactive REPL is minimal — each line is compiled + run
independently (no persistent env between lines yet). A proper REPL with
persistent env (so you can `let x = 5;` and then `print(x);` on the next
line) is a Wave 3 deliverable.

### `aether new <name>`

Scaffold a new project at `<name>/`:

```
<name>/
├── main.ae        # hello-world program
├── README.md       # short project README
└── aether.toml     # package manifest stub
```

The directory is created relative to the current working directory (or
at the absolute path if `name` starts with `/`). The package name in
`aether.toml` is `path.basename(name)`. Exits 2 if the directory already
exists.

```sh
$ aether new myproject
aether new: created 'myproject' in '/path/to/myproject' (main.ae, README.md, aether.toml)

$ ls myproject/
README.md   aether.toml   main.ae

$ aether run myproject/main.ae
Hello, Aether!
0
```

### `aether build <file.ae> -o <out>`

Compile to bytecode and write the assembled binary (uses `assemble` from
`aether/vm/bytecode`). The output file contains the `BytecodeModule`
serialized via `assemble()`:

- Magic bytes: `AETH` (4 bytes).
- Version: u16 LE (currently 1).
- Function count: u16 LE.
- Per-function blobs (name, nparams, nlocals, captures, strings,
  constants, matchTables, regLists, fieldLists, code).
- Entry function index: u16 LE.

See `aether/vm/bytecode/bytecode.ts` for the format spec.

Exits 1 on compile error (parse, type, runtime), 2 if `-o` is missing.

```sh
$ aether build fib.ae -o fib.aec
aether build: wrote 233 bytes to 'fib.aec'

$ od -c fib.aec | head -2
0000000   A   E   T   H 001  \0 002  \0 006  \0   <   m   a   i   n   >
0000020
```

### `aether help` / no args

Print the usage message:

```sh
$ aether help
aether — the Aether language CLI

Usage:
  aether run <file.ae>              Compile + run on the tree-walker.
  aether run:vm <file.ae>           Compile + run on the bytecode VM.
  aether check <file.ae>            Compile + print type errors only.
  aether test <dir>                 Discover + run *.test.ae / *.ae with assert.
  aether fmt <file.ae> [--check]    Re-indent based on brace depth (writes file).
                                    With --check, exit 1 if the file would change.
  aether repl                       Interactive REPL (or read from stdin if piped).
  aether new <name>                 Scaffold a new project.
  aether build <file.ae> -o <out>   Compile to bytecode + write assembled binary.
  aether help                       Print this message.

Exit codes:
  0  Success.
  1  Compile / runtime / parse / test failure.
  2  CLI usage error (unknown command, missing arg, file not found).

Examples:
  aether run hello.ae
  aether run:vm hello.ae
  aether check hello.ae
  aether test .
  aether fmt hello.ae
  aether new myproject
  aether build hello.ae -o hello.aec
```

## 3. Exit codes

| Code | Meaning                                                         |
|------|-----------------------------------------------------------------|
| 0    | Success — output printed, command completed cleanly.           |
| 1    | Compile / runtime / parse / test failure.                      |
| 2    | CLI usage error — unknown command, missing arg, file not found.|

## 4. The `aether.toml` manifest format

`aether new` scaffolds a stub `aether.toml`:

```toml
[package]
name = "myproject"
version = "0.1.0"
edition = "v2"

[dependencies]
# aether-http = "1.2.3"
# serde = { version = "0.4", source = "github:aether-lang/serde" }
```

The format (per RFC-003):

- `[package]` — package metadata.
  - `name` — the package name (must match the directory name; used by
    importers).
  - `version` — semver.
  - `edition` — `"v1"` (tree-walker, sync, no modules) or `"v2"`
    (bytecode VM, async, modules). The edition determines the runtime.
- `[dependencies]` — a map of name → version spec (or detailed table).
  Versions are semver. Sources: the default is the registry (RFC-003's
  `aether install` command, a v2.1 item); `github:owner/repo` is a git
  source; `path: "..."` is a local path (for monorepos).

The v1 module system in `aether/core/modules/modules.ts` doesn't read
`aether.toml` yet — it just resolves relative paths. The manifest is
scaffolded as a stub for future v2.1 tooling.

## 5. Argument parsing

The CLI uses a small inline parser (`parseArgs`) supporting:

- Positional args (any arg that doesn't start with `-` or `--`).
- Long flags: `--flag value` or `--flag` (boolean).
- Short flags: `-o value` or `-f` (boolean).
- The first positional is the command name (e.g. `run`, `check`).
- Subsequent positionals are command arguments.

Examples:

```sh
aether run hello.ae                              # command=run, positional=[hello.ae]
aether build hello.ae -o hello.aec               # command=build, positional=[hello.ae], flags={o: "hello.aec"}
aether fmt hello.ae --check                       # command=fmt, positional=[hello.ae], flags={check: true}
aether test .                                     # command=test, positional=["."]
```

`aether help` and `aether` (no args) both print the usage message.

## 6. The inline formatter

The `formatSource(src)` function re-indents Aether source based on brace
depth. It's the implementation behind `aether fmt`. Algorithm:

1. Split source into lines.
2. Track `depth` (number of unmatched `{`).
3. For each line:
   - Strip trailing whitespace.
   - Strip leading whitespace (we'll re-indent).
   - If the line is empty, emit blank (no indent).
   - If the line starts with `}`, use `depth - 1` for indent (close braces
     close the current scope before they appear).
   - Emit `"  ".repeat(effectiveDepth) + trimmedStart`.
   - Update `depth` based on `{` `}` in this line, skipping braces inside
     string literals, char literals, line comments, and block comments.
4. Join with `\n`; append a trailing `\n` if the source had one.

This is intentionally simple — not a full pretty-printer. It handles the
common case of inconsistent indentation in hand-written Aether. A proper
formatter (à la `gofmt` or `rustfmt`) is future work for Wave 3.

## 7. Multi-file program support

`aether run` detects multi-file programs via a regex that matches
`import { ... } from "..."` or `import "..."`. If the regex matches, the
CLI routes through `runModule` (from `aether/core/modules/modules.ts`)
for full multi-file resolution; otherwise, it uses `compile` directly
(no module-system overhead).

This means:

- Single-file programs (no imports) work identically to v1's
  `compileAndRun`.
- Multi-file programs work via the v1 module system: `import { greet }
  from "./utils.ae";` resolves `utils.ae` relative to the importer,
  loads it, collects its `pub` exports, and wires them into the
  importer's scope.

`aether run:vm` doesn't yet support multi-file programs — the
`compileToVm` API is single-file. Use `aether run` for multi-file
programs; `aether run:vm` for single-file VM execution.

## 8. Testing

`cli.test.ts` has 45 tests covering:

- `parseArgs`: command + positional, long/short flags with values,
  boolean flags, default command.
- `main` dispatch: help, no-args, unknown command, missing positional.
- `cmdRun` single-file: simple program, fib(10), runtime error, file
  not found.
- `cmdRun` multi-file: import from utils.ae.
- `cmdRunVm`: runs on bytecode VM, exits 1 on runtime error.
- `cmdCheck`: clean (OK), type error, parse error.
- `cmdTest`: discovers *.test.ae, FAIL on assert failure, missing
  directory, discovers *.ae with assert, no test files.
- `formatSource`: re-indents, strips trailing whitespace, preserves
  string braces, handles comments, no trailing newline added, preserves
  trailing newline, idempotent.
- `cmdFmt`: in place, --check returns 1 if changes, --check returns 0 if
  clean.
- `cmdNew`: scaffolds files, scaffolded main.ae runs, exits 2 if dir
  exists.
- `cmdBuild`: writes binary with `AETH` magic, exits 2 without -o, exits
  1 on parse error.
- Subprocess integration: `bun cli.ts run`, `run:vm`, `new`, `help`,
  `repl` (piped stdin).

Run with:

```sh
bunx vitest run aether/tools/cli
```

## 9. Implementation notes

- The CLI is one self-contained file (`cli.ts`, ~600 LOC). Each command
  is a separate exported function so tests can call them directly.
- The entry point guard (`if (import.meta.path === Bun.main)`) only
  fires when run as the main module of a Bun script. When imported (by
  tests in vitest's node env where `Bun` is undefined), the entry point
  doesn't fire, so `main()` can be called directly without exiting the
  test process.
- `cmdRun`'s import detection uses the regex
  `/^[ \t]*import[ \t]*(\{[^}]*\}[ \t]*from[ \t]*)?"[^"]+"[ \t]*;?[ \t]*$/m`
  which matches both RFC-003-style `import { names } from "path";` and
  the v1 string-literal form `import "path";`. The `m` flag makes `^`
  match line starts.
- `cmdBuild` validates via `compile` (which exposes `parseErrors`)
  first, then compiles to bytecode via `compileToVm`. This double-parse
  is wasteful but lets us surface parse errors with the right error
  message; `compileToVm` doesn't expose `parseErrors` in its result.
- The `formatSource` formatter preserves trailing newlines (doesn't add
  one if the source had none, preserves one if the source had one). This
  makes `--check` deterministic.

## 10. Cross-references

- `aether/core/index.ts` — `compile` (tree-walker) and `compileToVm`
  (bytecode VM) are the per-command entry points.
- `aether/core/modules/modules.ts` — `runModule` powers `aether run` for
  multi-file programs.
- `aether/vm/bytecode/bytecode.ts` — `assemble` powers `aether build`.
- `docs/rfcs/rfc-003-modules-and-packages.md` — the `aether.toml`
  manifest format and the package-manager plan.
- `docs/spec/13-tooling.md` — the broader v2 tooling spec.
- `docs/tutorials/tooling.md` — the v1 vs v2 tooling tutorial.
