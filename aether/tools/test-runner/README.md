# aether/tools/test-runner — Aether Test Runner

A REAL test runner for Aether test files. Discovers `fn test_*` functions
inside any `.ae` file, runs each in isolation, captures `assert_eq` /
`assert` / `panic` failures, and reports per-test pass/fail with timing
and a coverage proxy (assert call count).

The runner is the canonical way to test Aether code; it's the same
harness that the `aether test` CLI command uses, but exposed as a
library so it can be embedded in build tools, editor plugins, and CI
scripts.

## Quick start

Run a single file:

```bash
bun -e "import { runTestFile } from './aether/tools/test-runner/test-runner'; \
  console.log(runTestFile('/path/to/my.test.ae'));"
```

Run a whole directory (recursively):

```bash
bun -e "import { runTestDir } from './aether/tools/test-runner/test-runner'; \
  console.log(runTestDir('./tests'));"
```

Use as a CLI (exits 0 on success, 1 on failure, 2 on usage error):

```bash
bun aether/tools/test-runner/test-runner.ts ./tests
```

## Convention

A file is treated as a *test file* if either:

- its name ends in `.test.ae` (the conventional suffix), OR
- it contains the regex `\bassert(_eq)?\b` (legacy: any file with an
  `assert` / `assert_eq` call is a test file).

Inside a test file, every top-level `fn test_*` declaration is a
separate test case. The function name (starting with `test_`) is the
test name shown in the report. Other top-level declarations (`fn`
helpers, `enum`, `struct`, `type`, `let`, `const`, `import`) are kept
as the "preamble" — they're available to every test function in the
file. Top-level *statements* (`print(...)`, `expr;`, `while ...`,
`for ... in ...`, `x = 1;`) are dropped — they're typically the
file's demo code, not test fixtures.

If a test file has no `fn test_*` declarations, the runner falls back
to *whole-file mode*: the entire file is one test case, named after the
file. It passes if the program runs without a runtime panic.

## Public API

```ts
export interface TestResult {
  name: string;        // "test_foo" or basename of the file
  passed: boolean;
  error?: string;      // panic message on failure
  output?: string;     // captured stdout, lines joined by "\n"
  durationMs: number;
  asserts?: number;    // AST-level count of assert/assert_eq in this test
}

export interface TestRunResult {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
  durationMs: number;
  coverage?: { asserts: number };
}

export function runTestFile(path: string): TestRunResult;
export function runTestDir(dir: string, opts?: {
  parallel?: boolean;
  includeNonTestFiles?: boolean;
}): TestRunResult;
export function runTestSource(source: string, name?: string): TestRunResult;

// Optional CLI entry point.
export function cliMain(argv: string[]): number;
```

## Writing a test

The simplest test:

```aether
fn test_add() {
  assert_eq(1 + 1, 2);
}
```

A test with helpers and fixtures:

```aether
let fixtures = [3, 1, 2];

fn sorted(xs: [int]) -> [int] {
  // ... bubblesort ...
  xs
}

fn test_sorts_asc() {
  assert_eq(sorted(fixtures), [1, 2, 3]);
}

fn test_empty_input() {
  assert_eq(sorted([]), []);
}

fn test_singleton() {
  assert_eq(sorted([42]), [42]);
}
```

A test that's expected to panic (negative test):

```aether
fn test_panics_on_bad_index() {
  let xs = [1, 2, 3];
  // Indexing out of bounds panics — this test "passes" if the program
  // runs to completion, but we want it to panic. So we wrap it:
  let mut panicked = false;
  // Aether v1 doesn't have try/catch, so the panic propagates and
  // fails the test. To assert that something *should* panic, the
  // convention is to call a helper that does the dangerous op and
  // expects to never return. (Future: a `should_panic` annotation.)
  let _ = xs[10]; // panics
}
```

## How tests are run

For each `fn test_*` function, the runner:

1. **Builds a per-test source** by re-emitting only the declarations
   from the file's AST (`printAst` over each kept statement), then
   appending `<test_name>();` at the end. This guarantees the test
   function runs *and* that no top-level demo code pollutes the test
   output.

2. **Compiles + runs** the per-test source via `aether/core`'s
   `compile()` function, with `stdlibBuiltins()` merged into the
   builtins map. (See `aether/stdlib/index.ts` for the full list.)

3. **Captures the result**:
   - If `runtime.error` is set (a `PanicSignal` was thrown), the test
     FAILS with the panic message as `error`.
   - Otherwise, the test PASSES.

4. **Counts asserts** by walking the test function's AST subtree and
   counting `Call` nodes whose callee is `assert` or `assert_eq`. This
   is an AST-level proxy for "asserts executed" — it's the number of
   asserts that *would* run if the test reaches completion. (A runtime
   counter would be more accurate but requires instrumenting the
   evaluator, which is a v2 target.)

## Snapshot testing

A snapshot test pins the value of an expression to a stored "golden"
value, then re-checks it on every subsequent run. Aether's snapshot
support is intentionally pragmatic — a simple string comparison.

```aether
fn test_render() {
  let out = "Hello, World!";
  assert_eq(out, snapshot(out));
}
```

How it works:

- On the first run, the `snapshot()` builtin stores the displayed
  string of its argument to a JSON file at `<testfile>.snap`, keyed
  by the test name. It returns the input value, so `assert_eq` passes.
- On subsequent runs, `snapshot()` reads the stored value from the
  file and returns it. `assert_eq` then compares the current value
  against the stored value — if they differ, the test fails with an
  assertion-failed panic.

The snapshot file format:

```json
{
  "test_render": "Hello, World!",
  "test_other": "[1, 2, 3]"
}
```

Snapshots are stored as display strings (the same format used by
`print` / `assert_eq` failure messages), so a single string-compare
suffices. The file is human-readable, git-friendly, and easy to
manually update when an intentional change is made (just delete the
file or edit the line).

When using `runTestSource` (no backing file), the snapshot store is
in-memory only — it persists across tests in the same source string
but not across runs.

## Coverage

The runner reports a coverage proxy: the total number of
`assert` / `assert_eq` calls across all tests in the file (or
directory). This is reported on `TestRunResult.coverage.asserts`.

It's a *proxy* because:

- It counts AST nodes, not runtime executions. If a test fails at the
  first assert, the runner still counts all the asserts in that
  test's AST (even the ones that didn't run).
- It doesn't track branch coverage, line coverage, or which asserts
  actually executed.

That said, it's a useful number for CI dashboards: "we have 134
asserts across 22 tests" gives a rough sense of how thoroughly the
codebase is exercised. A true line-coverage tool is a v2 target.

## Parallel execution

`runTestDir(dir, { parallel: true })` exposes the API surface for
parallel file execution. The Aether evaluator is synchronous and
single-threaded, so v1's "parallel" mode actually runs files
sequentially — the result is identical to `parallel: false`. The
option exists so that callers can opt in to the API today and get
true parallelism automatically when the bytecode VM (or a
worker-based runtime) lands.

A real worker-thread implementation would spawn one Bun worker per
file, run them via `Promise.all`, and aggregate the results. The
public API (`runTestDir` is sync, returns `TestRunResult`) stays the
same — only the implementation behind it changes.

## Error reporting

Each `TestResult` carries:

- `name` — the `fn test_*` name, or the file basename in whole-file
  mode.
- `passed` — `true` if the test ran without a panic.
- `error` — the panic message (the same string `panic(msg)` /
  `assert_eq` failures would print). Undefined when `passed` is true.
- `output` — captured stdout, with one entry per `print` / `println`
  call, joined by `\n`. Useful for debugging a failing test.
- `durationMs` — wall-clock time of the compile+run, in milliseconds.
- `asserts` — the AST-level assert count for this test (see Coverage).

The aggregate `TestRunResult` adds:

- `total` / `passed` / `failed` — count of tests by outcome.
- `results` — the per-test `TestResult[]`.
- `durationMs` — wall-clock time of the whole run.
- `coverage.asserts` — sum of all per-test `asserts`.

## CI exit codes

The CLI entry point (`cliMain`) returns:

- `0` — All tests passed.
- `1` — At least one test failed.
- `2` — Usage error (no target given, target not found).

Use it in a `package.json` script:

```json
{
  "scripts": {
    "test:aether": "bun aether/tools/test-runner/test-runner.ts ./tests"
  }
}
```

Or directly in CI:

```yaml
- name: Run Aether tests
  run: bun aether/tools/test-runner/test-runner.ts ./tests
```

## Examples

### A minimal passing file

`tests/add.test.ae`:

```aether
fn test_add() {
  assert_eq(1 + 1, 2);
}
```

### A file with helpers and multiple tests

`tests/sort.test.ae`:

```aether
fn bubble_sort(xs: [int]) -> [int] {
  let mut a = xs;
  let n = len(a);
  let mut i = 0;
  while i < n {
    let mut j = 0;
    while j < n - 1 {
      if a[j] > a[j + 1] {
        let tmp = a[j];
        a[j] = a[j + 1];
        a[j + 1] = tmp;
      };
      j = j + 1;
    };
    i = i + 1;
  };
  a
}

fn test_sorts_basic() {
  assert_eq(bubble_sort([3, 1, 2]), [1, 2, 3]);
}

fn test_empty() {
  assert_eq(bubble_sort([]), []);
}

fn test_singleton() {
  assert_eq(bubble_sort([42]), [42]);
}

fn test_already_sorted() {
  assert_eq(bubble_sort([1, 2, 3]), [1, 2, 3]);
}
```

Run it:

```
$ bun aether/tools/test-runner/test-runner.ts tests/sort.test.ae
PASS test_sorts_basic
PASS test_empty
PASS test_singleton
PASS test_already_sorted

4/4 passed, 0 failed (3ms)
```

### Snapshot test

`tests/render.test.ae`:

```aether
fn render(name: string) -> string {
  "Hello, " + name + "!"
}

fn test_render_world() {
  assert_eq(render("World"), snapshot("Hello, World!"));
}
```

First run creates `tests/render.test.ae.snap`:

```json
{
  "test_render_world": "Hello, World!"
}
```

Subsequent runs pass as long as `render("World")` returns
`"Hello, World!"`. If someone changes `render` to return a different
string, the test fails with `assertion failed: <new> != Hello, World!`
— a clear signal that the snapshot needs reviewing.

## File layout

```
aether/tools/test-runner/
├── test-runner.ts       # the runner (~480 LOC)
├── test-runner.test.ts  # 55 test cases
└── README.md            # this document
```

## Limitations (v1)

- **No try/catch in Aether.** You can't easily assert that something
  *should* panic. Workaround: write a `should_panic_*` test that
  intentionally does the dangerous op and let it fail; the test
  "passes" if it doesn't panic (the inverse of what you want). A
  proper `should_panic` annotation is a v2 target.
- **Coverage is AST-level.** A runtime counter (instrumented
  evaluator) would give true assert-execution counts. Pragmatic
  choice for v1.
- **Parallel mode is sequential.** The API surface is there; the
  implementation will follow when the runtime supports true
  concurrency.
- **No test filtering.** The runner runs every test in the target;
  `--grep` / `--only` / `--skip` patterns are a v2 target.
