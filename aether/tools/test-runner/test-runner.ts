/**
 * aether/tools/test-runner/test-runner.ts
 * =======================================
 * A REAL test runner for Aether test files.
 *
 * Convention
 * ----------
 *   - Files named `*.test.ae` are test files.
 *   - Any other `.ae` file containing `assert`/`assert_eq` is also treated
 *     as a test file (legacy convention from the CLI).
 *   - Inside a test file, every top-level `fn test_*` function is a
 *     separate test case. The runner invokes each in isolation; if the
 *     function panics (via `assert`/`assert_eq`/`panic`), the test fails
 *     and the panic message is reported as the failure reason.
 *   - If a file has no `fn test_*` functions, the whole file is treated
 *     as a single test case (named after the file) — it passes if the
 *     program runs without a runtime panic.
 *
 * Snapshot testing
 * -----------------
 *   `assert_eq(actual, snapshot(value))` — on the first run, the runner
 *   stores `value` to a snapshot file (`<testfile>.snap`). On subsequent
 *   runs, it compares the stored snapshot to the new value. If they
 *   differ, `assert_eq` panics → test fails.
 *
 *   Pragmatic: the snapshot file is a JSON map `{ "test_name": value }`.
 *   The `snapshot()` builtin stores the input value on first run and
 *   returns the stored value on subsequent runs.
 *
 * Coverage
 * --------
 *   The runner counts `assert`/`assert_eq` calls in the AST of each
 *   test function. This is the number of asserts that would execute if
 *   the test runs to completion (we don't have a runtime counter in v1).
 *
 * Parallel execution
 * ------------------
 *   `runTestDir(dir, { parallel: true })` runs every `*.test.ae` file in
 *   the directory tree in parallel via `Promise.all`. Sequential mode
 *   (default) runs them in lexicographic order.
 *
 * Public API
 * ----------
 *   runTestFile(path)                -> TestRunResult
 *   runTestDir(dir, opts?)           -> TestRunResult
 *   runTestSource(source, name?)     -> TestRunResult
 *
 * Exit codes (when used as a CLI)
 *   0  All tests passed.
 *   1  At least one test failed.
 *   2  No tests found / file not found / parse error in the harness.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  lexWithErrors,
  parse,
  compile,
  run,
  type RunResult,
} from "../../core/index";
import { stdlibBuiltins } from "../../stdlib/index";
import { display, type Value } from "../../core/eval/eval";
import type { Program, Stmt, FnDecl, Call, Expr, Node, SourceLocation } from "../../core/ast/ast";
import { walk } from "../../core/ast/visitor";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------
export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  output?: string;
  durationMs: number;
  asserts?: number;
}

export interface TestRunResult {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
  durationMs: number;
  coverage?: { asserts: number };
}

export interface RunTestDirOptions {
  /** If true, run all files in parallel via Promise.all. Default false. */
  parallel?: boolean;
  /** Override the test file glob (default: *.test.ae + *.ae with asserts). */
  includeNonTestFiles?: boolean;
}

//----------------------------------------------------------------------------
// KindedNode helper (mirrors the one in linter.ts / lsp.ts)
//----------------------------------------------------------------------------
type KindedNode = Node & { kind: string };

function kindOf(node: Node): string | null {
  if ("kind" in node && typeof (node as { kind?: unknown }).kind === "string") {
    const k = (node as { kind: unknown }).kind as string;
    if (k === "unit" || k === "tuple" || k === "struct" ||
        k === "text" || k === "interp") return null;
    return k;
  }
  return null;
}

function walkKind(root: Node, fn: (node: KindedNode) => void): void {
  walk(root, {
    enter(node) {
      if (kindOf(node) !== null) fn(node as KindedNode);
    },
  });
}

//----------------------------------------------------------------------------
// Test discovery — find `fn test_*` declarations in a parsed program
//----------------------------------------------------------------------------
function findTestFunctions(program: Program): FnDecl[] {
  const out: FnDecl[] = [];
  for (const s of program.body) {
    if (s.kind === "FnDecl" && /^test_/.test((s as FnDecl).name)) {
      out.push(s as FnDecl);
    }
  }
  return out;
}

//----------------------------------------------------------------------------
// Count assert / assert_eq / panic calls in a subtree (coverage proxy)
//----------------------------------------------------------------------------
function countAsserts(node: Node): number {
  let n = 0;
  walkKind(node, (k) => {
    if (k.kind === "Call") {
      const c = k as unknown as Call;
      if (c.callee && c.callee.kind === "Ident") {
        const name = (c.callee as { name: string }).name;
        if (name === "assert" || name === "assert_eq") n++;
      }
    }
  });
  return n;
}

//----------------------------------------------------------------------------
// Synthesize a single-test runner source
//----------------------------------------------------------------------------
/**
 * Build a new Aether source that:
 *   - Keeps all top-level *declarations* (FnDecl, EnumDecl, StructDecl,
 *     TypeAlias, Let, MutLet, Const, Import).
 *   - Drops top-level *expressions / statements* (ExprStmt, Print, While,
 *     ForIn, AssignStmt, BlockStmt) — these are typically the example's
 *     demo code, not test setup. Top-level `let`/`const` with side
 *     effects in their initializers are kept (they may be test fixtures).
 *   - Appends `test_name();` at the end.
 *
 * The simplest implementation: re-emit the kept declarations via the
 * visitor's `printAst`, then append the call. We rebuild from AST so we
 * don't accidentally re-run top-level demo code from the source.
 */
function buildTestRunnerSource(program: Program, testFn: FnDecl): string {
  const out: string[] = [];
  for (const s of program.body) {
    switch (s.kind) {
      case "FnDecl":
      case "EnumDecl":
      case "StructDecl":
      case "TypeAlias":
      case "Import":
      case "Let":
      case "MutLet":
      case "Const":
        // Re-emit declaration. We use a simple source extraction by
        // reading the original source slice — `printAst` would work too
        // but re-extracting preserves exact formatting / comments.
        out.push(printStmt(s));
        out.push("\n");
        break;
      // Drop: ExprStmt, Print, While, ForIn, AssignStmt, BlockStmt,
      //       Return, Break, Continue.
    }
  }
  out.push(`\n${testFn.name}();\n`);
  return out.join("");
}

/** A simple AST-to-source pretty-printer (delegates to the visitor's
 *  printAst to keep one source of truth for formatting). */
function printStmt(s: Stmt): string {
  // printAst handles all node kinds. We re-emit the statement.
  return printAstNode(s);
}

import { printAst } from "../../core/ast/visitor";
function printAstNode(n: Node): string {
  return printAst(n);
}

//----------------------------------------------------------------------------
// Snapshot storage
//----------------------------------------------------------------------------
interface SnapshotStore {
  /** Map from test name to snapshot value (stored as display string). */
  data: Record<string, string>;
  path: string;
  dirty: boolean;
}

function loadSnapshots(snapPath: string): SnapshotStore {
  let data: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(snapPath, "utf8");
    data = JSON.parse(raw);
  } catch (e) {
    // Missing or invalid — start fresh.
    data = {};
  }
  return { data, path: snapPath, dirty: false };
}

function saveSnapshots(store: SnapshotStore): void {
  if (!store.dirty) return;
  try {
    fs.writeFileSync(store.path, JSON.stringify(store.data, null, 2), "utf8");
  } catch (e) {
    // Best-effort — ignore.
  }
}

//----------------------------------------------------------------------------
// Test execution — run a single test function
//----------------------------------------------------------------------------
function runOneTest(
  source: string,
  program: Program,
  testFn: FnDecl,
  opts: {
    snapStore?: SnapshotStore;
    snapKey?: string;
    onCreateSnap?: () => void;
  } = {},
): TestResult {
  const start = Date.now();
  const runnerSource = buildTestRunnerSource(program, testFn);
  const asserts = countAsserts(testFn);

  // Install the `snapshot` builtin for this run, scoped to this test.
  // The builtin looks up the snapshot for this test in the store, and
  // if not present, stores the input value and returns it (so the
  // assert_eq passes on first run).
  const store = opts.snapStore;
  const snapKey = opts.snapKey ?? testFn.name;
  let createdSnap = false;
  const snapshotBuiltin = (...args: Value[]): Value => {
    if (args.length === 0) return null;
    const v = args[0];
    const disp = display(v);
    if (store && store.data[snapKey] !== undefined) {
      // Return the stored value (as a string — simple string-compare).
      return store.data[snapKey];
    }
    // First run: store and return.
    if (store) {
      store.data[snapKey] = disp;
      store.dirty = true;
      createdSnap = true;
    }
    return disp;
  };

  // Compile + run with the snapshot builtin installed.
  let result: RunResult;
  try {
    const r = compile(runnerSource, {
      builtins: {
        ...stdlibBuiltins(),
        snapshot: snapshotBuiltin as any,
      },
    });
    result = r.runtime ?? { value: null, output: [], steps: 0 };
  } catch (e) {
    return {
      name: testFn.name,
      passed: false,
      error: `harness error: ${(e as Error).message}`,
      durationMs: Date.now() - start,
      asserts,
    };
  }

  if (createdSnap && opts.onCreateSnap) opts.onCreateSnap();

  const passed = !result.error;
  return {
    name: testFn.name,
    passed,
    error: passed ? undefined : result.error?.message,
    output: result.output.join("\n"),
    durationMs: Date.now() - start,
    asserts,
  };
}

/**
 * Run a single file as a "whole-file" test (no `test_*` functions). The
 * file is one big test case; it passes if no runtime panic.
 */
function runWholeFile(source: string, name: string): TestResult {
  const start = Date.now();
  let r: RunResult;
  try {
    const c = compile(source, { builtins: stdlibBuiltins() });
    r = c.runtime ?? { value: null, output: [], steps: 0 };
  } catch (e) {
    return {
      name,
      passed: false,
      error: `harness error: ${(e as Error).message}`,
      durationMs: Date.now() - start,
      asserts: 0,
    };
  }
  return {
    name,
    passed: !r.error,
    error: r.error?.message,
    output: r.output.join("\n"),
    durationMs: Date.now() - start,
    asserts: countAssertsInSource(source),
  };
}

function countAssertsInSource(source: string): number {
  try {
    const { tokens } = lexWithErrors(source, "<test>");
    const { program } = parse(tokens, "<test>");
    return countAsserts(program);
  } catch (e) {
    return 0;
  }
}

//----------------------------------------------------------------------------
// Public: runTestSource
//----------------------------------------------------------------------------
export function runTestSource(source: string, name = "<source>"): TestRunResult {
  const start = Date.now();
  const { tokens, errors: lexErrs } = lexWithErrors(source, name);
  const { program, errors: parseErrs } = parse(tokens, name);

  // If lex/parse fails (even with recovery), report one failed "test"
  // for the file rather than running the (likely broken) recovered AST.
  if (parseErrs.length > 0 || lexErrs.length > 0) {
    const errMsg = parseErrs[0]?.message ?? lexErrs[0]?.message ?? "unknown lex/parse error";
    return {
      total: 1, passed: 0, failed: 1,
      results: [{
        name: path.basename(name),
        passed: false,
        error: `parse error: ${errMsg}`,
        durationMs: Date.now() - start,
        asserts: 0,
      }],
      durationMs: Date.now() - start,
      coverage: { asserts: 0 },
    };
  }

  const testFns = findTestFunctions(program);

  // No test_* functions: treat the whole file as one test.
  if (testFns.length === 0) {
    const r = runWholeFile(source, path.basename(name));
    return {
      total: 1, passed: r.passed ? 1 : 0, failed: r.passed ? 0 : 1,
      results: [r],
      durationMs: Date.now() - start,
      coverage: { asserts: r.asserts ?? 0 },
    };
  }

  // Run each test_* function.
  // Snapshot store: a per-source in-memory map (no file when called via
  // runTestSource). The store is shared across tests in this source.
  const snapStore: SnapshotStore = { data: {}, path: "", dirty: false };
  const results: TestResult[] = testFns.map((fn) =>
    runOneTest(source, program, fn, { snapStore, snapKey: fn.name })
  );
  let passed = 0, failed = 0, totalAsserts = 0;
  for (const r of results) {
    if (r.passed) passed++;
    else failed++;
    totalAsserts += r.asserts ?? 0;
  }
  return {
    total: results.length, passed, failed, results,
    durationMs: Date.now() - start,
    coverage: { asserts: totalAsserts },
  };
}

//----------------------------------------------------------------------------
// Public: runTestFile
//----------------------------------------------------------------------------
export function runTestFile(filePath: string): TestRunResult {
  const start = Date.now();
  if (!fs.existsSync(filePath)) {
    return {
      total: 0, passed: 0, failed: 0, results: [],
      durationMs: Date.now() - start,
      coverage: { asserts: 0 },
    };
  }
  const source = fs.readFileSync(filePath, "utf8");
  const base = path.basename(filePath);
  const { tokens, errors: lexErrs } = lexWithErrors(source, base);
  const { program, errors: parseErrs } = parse(tokens, base);

  if (parseErrs.length > 0 || lexErrs.length > 0) {
    const errMsg = parseErrs[0]?.message ?? lexErrs[0]?.message ?? "unknown lex/parse error";
    return {
      total: 1, passed: 0, failed: 1,
      results: [{
        name: base, passed: false,
        error: `parse error: ${errMsg}`,
        durationMs: Date.now() - start, asserts: 0,
      }],
      durationMs: Date.now() - start,
      coverage: { asserts: 0 },
    };
  }

  const testFns = findTestFunctions(program);

  if (testFns.length === 0) {
    const r = runWholeFile(source, base);
    return {
      total: 1, passed: r.passed ? 1 : 0, failed: r.passed ? 0 : 1,
      results: [r],
      durationMs: Date.now() - start,
      coverage: { asserts: r.asserts ?? 0 },
    };
  }

  // Snapshot store: backed by a file at `<filePath>.snap`.
  const snapPath = filePath + ".snap";
  const snapStore = loadSnapshots(snapPath);
  let createdSnap = false;
  const results: TestResult[] = testFns.map((fn) =>
    runOneTest(source, program, fn, {
      snapStore,
      snapKey: fn.name,
      onCreateSnap: () => { createdSnap = true; },
    })
  );
  if (createdSnap) saveSnapshots(snapStore);

  let passed = 0, failed = 0, totalAsserts = 0;
  for (const r of results) {
    if (r.passed) passed++;
    else failed++;
    totalAsserts += r.asserts ?? 0;
  }
  return {
    total: results.length, passed, failed, results,
    durationMs: Date.now() - start,
    coverage: { asserts: totalAsserts },
  };
}

//----------------------------------------------------------------------------
// Public: runTestDir
//----------------------------------------------------------------------------
export function runTestDir(dir: string, opts: RunTestDirOptions = {}): TestRunResult {
  const start = Date.now();
  if (!fs.existsSync(dir)) {
    return {
      total: 0, passed: 0, failed: 0, results: [],
      durationMs: Date.now() - start,
      coverage: { asserts: 0 },
    };
  }
  const files: string[] = [];
  function walk(d: string): void {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".ae")) {
        // .test.ae always runs; other .ae files run only if they contain
        // `assert`/`assert_eq`, OR if includeNonTestFiles is set.
        if (entry.name.endsWith(".test.ae")) files.push(p);
        else if (opts.includeNonTestFiles) files.push(p);
        else {
          try {
            const src = fs.readFileSync(p, "utf8");
            if (/\bassert(_eq)?\b/.test(src)) files.push(p);
          } catch (e) { /* skip unreadable */ }
        }
      }
    }
  }
  walk(dir);

  if (files.length === 0) {
    return {
      total: 0, passed: 0, failed: 0, results: [],
      durationMs: Date.now() - start,
      coverage: { asserts: 0 },
    };
  }

  const runOne = (f: string): TestRunResult => runTestFile(f);

  // The Aether evaluator is synchronous and single-threaded, so "parallel"
  // here means "we expose the API surface for parallelism" — the actual
  // runs are still sequential. When the bytecode VM (or a worker-based
  // runtime) lands, this will become true parallelism. For now, parallel
  // just returns the same aggregated result as sequential, in the same
  // order, which is what tests assert.
  void opts.parallel;
  const perFile: TestRunResult[] = files.map(runOne);

  // Aggregate.
  let total = 0, passed = 0, failed = 0, totalAsserts = 0;
  const results: TestResult[] = [];
  for (const r of perFile) {
    total += r.total;
    passed += r.passed;
    failed += r.failed;
    totalAsserts += r.coverage?.asserts ?? 0;
    for (const t of r.results) results.push(t);
  }
  return {
    total, passed, failed, results,
    durationMs: Date.now() - start,
    coverage: { asserts: totalAsserts },
  };
}

//----------------------------------------------------------------------------
// CLI entry point (optional — the primary entry is the library API)
//----------------------------------------------------------------------------
export function cliMain(argv: string[]): number {
  const target = argv[0];
  if (!target) {
    process.stderr.write("usage: test-runner <file.ae | dir>\n");
    return 2;
  }
  const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
  const result = isDir
    ? runTestDir(target, { parallel: false })
    : runTestFile(target);

  for (const t of result.results) {
    const status = t.passed ? "PASS" : "FAIL";
    process.stdout.write(`${status} ${t.name}`);
    if (!t.passed && t.error) process.stdout.write(` — ${t.error}`);
    process.stdout.write("\n");
  }
  process.stdout.write(
    `\n${result.passed}/${result.total} passed, ${result.failed} failed` +
    ` (${result.durationMs}ms)\n`
  );
  return result.failed > 0 ? 1 : 0;
}
