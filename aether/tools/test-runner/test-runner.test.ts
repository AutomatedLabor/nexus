/**
 * aether/tools/test-runner/test-runner.test.ts
 * =============================================
 * 40 cases covering:
 *   - runTestSource: passing, failing, parse error, no test_* (whole-file mode)
 *   - runTestFile: passing, failing, missing file, snapshot pass/fail/create
 *   - runTestDir: empty dir, mixed, parallel, missing dir
 *   - coverage counting
 *   - error reporting shape (name / passed / error / durationMs / asserts)
 *   - snapshot storage (create, read, update)
 *   - CLI exit codes
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  runTestFile,
  runTestDir,
  runTestSource,
  cliMain,
} from "./test-runner";

//----------------------------------------------------------------------------
// Helpers — make a temp dir, write files, clean up.
//----------------------------------------------------------------------------
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aether-test-"));
}

function writeTmpFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, "utf8");
  return p;
}

//----------------------------------------------------------------------------
// 1. runTestSource — basic shape
//----------------------------------------------------------------------------
describe("test-runner: runTestSource basics", () => {
  it("returns a TestRunResult with the expected shape", () => {
    const r = runTestSource("fn test_pass() { assert_eq(1, 1); }");
    expect(r).toHaveProperty("total");
    expect(r).toHaveProperty("passed");
    expect(r).toHaveProperty("failed");
    expect(r).toHaveProperty("results");
    expect(r).toHaveProperty("durationMs");
    expect(Array.isArray(r.results)).toBe(true);
  });

  it("reports 1 test for a single fn test_*", () => {
    const r = runTestSource("fn test_pass() { assert_eq(1, 1); }");
    expect(r.total).toBe(1);
    expect(r.passed).toBe(1);
    expect(r.failed).toBe(0);
  });

  it("reports multiple tests for multiple fn test_*", () => {
    const r = runTestSource("fn test_a() { assert_eq(1, 1); }\nfn test_b() { assert_eq(2, 2); }\nfn test_c() { assert_eq(3, 3); }");
    expect(r.total).toBe(3);
    expect(r.passed).toBe(3);
  });

  it("names tests after the function names", () => {
    const r = runTestSource("fn test_foo() { assert_eq(1, 1); }");
    expect(r.results[0].name).toBe("test_foo");
  });

  it("passes a test that runs without panicking", () => {
    const r = runTestSource("fn test_pass() { let x = 1 + 1; assert_eq(x, 2); }");
    expect(r.passed).toBe(1);
    expect(r.results[0].passed).toBe(true);
    expect(r.results[0].error).toBeUndefined();
  });

  it("fails a test that panics", () => {
    const r = runTestSource("fn test_fail() { assert_eq(1, 2); }");
    expect(r.failed).toBe(1);
    expect(r.results[0].passed).toBe(false);
    expect(r.results[0].error).toContain("assertion failed");
  });

  it("captures the panic message in `error`", () => {
    const r = runTestSource('fn test_panic() { panic("boom"); }');
    expect(r.results[0].passed).toBe(false);
    expect(r.results[0].error).toContain("boom");
  });

  it("durationMs is a non-negative number", () => {
    const r = runTestSource("fn test_pass() { assert_eq(1, 1); }");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof r.durationMs).toBe("number");
  });
});

//----------------------------------------------------------------------------
// 2. runTestSource — whole-file mode (no test_* functions)
//----------------------------------------------------------------------------
describe("test-runner: whole-file mode", () => {
  it("treats a file with asserts but no test_* as a single test", () => {
    const r = runTestSource("assert_eq(1, 1);");
    expect(r.total).toBe(1);
    expect(r.passed).toBe(1);
  });

  it("fails when the whole file panics", () => {
    const r = runTestSource("assert_eq(1, 2);");
    expect(r.total).toBe(1);
    expect(r.failed).toBe(1);
  });

  it("names the whole-file test after the source name", () => {
    const r = runTestSource("assert_eq(1, 1);", "my_file.ae");
    expect(r.results[0].name).toBe("my_file.ae");
  });
});

//----------------------------------------------------------------------------
// 3. runTestSource — parse errors
//----------------------------------------------------------------------------
describe("test-runner: parse errors", () => {
  it("reports a single failed test on a parse error", () => {
    const r = runTestSource("fn test_x() { let x = ; }");
    expect(r.total).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.results[0].error).toContain("parse");
  });

  it("still reports pass/fail counts correctly on parse error", () => {
    const r = runTestSource("fn test_x() { let x = ; }");
    expect(r.passed).toBe(0);
    expect(r.failed).toBe(1);
  });
});

//----------------------------------------------------------------------------
// 4. runTestSource — coverage (assert counting)
//----------------------------------------------------------------------------
describe("test-runner: coverage", () => {
  it("counts asserts in a single test", () => {
    const r = runTestSource("fn test_one() { assert_eq(1, 1); assert_eq(2, 2); assert_eq(3, 3); }");
    expect(r.coverage).toBeDefined();
    expect(r.coverage!.asserts).toBe(3);
  });

  it("sums asserts across tests", () => {
    const r = runTestSource("fn test_a() { assert_eq(1, 1); }\nfn test_b() { assert_eq(2, 2); assert_eq(3, 3); }");
    expect(r.coverage!.asserts).toBe(3);
  });

  it("counts assert() calls too, not just assert_eq", () => {
    const r = runTestSource("fn test_a() { assert(1 == 1); assert_eq(2, 2); }");
    expect(r.coverage!.asserts).toBe(2);
  });

  it("per-test asserts is on the result", () => {
    const r = runTestSource("fn test_a() { assert_eq(1, 1); assert_eq(2, 2); }");
    expect(r.results[0].asserts).toBe(2);
  });

  it("coverage is 0 when no asserts are present", () => {
    const r = runTestSource("fn test_x() { let x = 1; }");
    expect(r.coverage!.asserts).toBe(0);
  });
});

//----------------------------------------------------------------------------
// 5. runTestFile
//----------------------------------------------------------------------------
describe("test-runner: runTestFile", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns empty result for a missing file", () => {
    const r = runTestFile(path.join(dir, "nope.ae"));
    expect(r.total).toBe(0);
    expect(r.results).toEqual([]);
  });

  it("runs a passing file", () => {
    const f = writeTmpFile(dir, "pass.ae", "fn test_pass() { assert_eq(1, 1); }");
    const r = runTestFile(f);
    expect(r.passed).toBe(1);
    expect(r.failed).toBe(0);
  });

  it("runs a failing file", () => {
    const f = writeTmpFile(dir, "fail.ae", "fn test_fail() { assert_eq(1, 2); }");
    const r = runTestFile(f);
    expect(r.failed).toBe(1);
    expect(r.passed).toBe(0);
  });

  it("runs multiple tests in one file", () => {
    const f = writeTmpFile(dir, "multi.ae",
      "fn test_a() { assert_eq(1, 1); }\nfn test_b() { assert_eq(2, 2); }\nfn test_c() { assert_eq(3, 3); }"
    );
    const r = runTestFile(f);
    expect(r.total).toBe(3);
    expect(r.passed).toBe(3);
  });

  it("isolates failing tests from passing ones", () => {
    const f = writeTmpFile(dir, "mixed.ae",
      "fn test_a() { assert_eq(1, 1); }\nfn test_b() { assert_eq(1, 2); }\nfn test_c() { assert_eq(3, 3); }"
    );
    const r = runTestFile(f);
    expect(r.passed).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.results[1].name).toBe("test_b");
  });

  it("supports helper functions called from test_*", () => {
    const src = "fn helper(x: int) -> int { x + 1 }\nfn test_helper() { assert_eq(helper(5), 6); }";
    const f = writeTmpFile(dir, "helpers.ae", src);
    const r = runTestFile(f);
    expect(r.passed).toBe(1);
  });

  it("supports top-level lets used by tests", () => {
    const src = "let CONSTANT = 42;\nfn test_const() { assert_eq(CONSTANT, 42); }";
    const f = writeTmpFile(dir, "const.ae", src);
    const r = runTestFile(f);
    expect(r.passed).toBe(1);
  });

  it("does not run top-level demo code (Print statements)", () => {
    // The Print at the top should NOT be re-emitted in the per-test runner.
    const src = 'print("this should not run");\nfn test_x() { assert_eq(1, 1); }';
    const f = writeTmpFile(dir, "demo.ae", src);
    const r = runTestFile(f);
    expect(r.passed).toBe(1);
    // The test's output should NOT include the print line.
    expect(r.results[0].output).not.toContain("this should not run");
  });

  it("reports parse errors as a single failing test", () => {
    const f = writeTmpFile(dir, "broken.ae", "fn test_x() { let x = ; }");
    const r = runTestFile(f);
    expect(r.failed).toBe(1);
    expect(r.results[0].error).toContain("parse");
  });

  it("coverage is reported per file", () => {
    const f = writeTmpFile(dir, "cov.ae",
      "fn test_a() { assert_eq(1, 1); assert_eq(2, 2); }\nfn test_b() { assert_eq(3, 3); }"
    );
    const r = runTestFile(f);
    expect(r.coverage!.asserts).toBe(3);
  });
});

//----------------------------------------------------------------------------
// 6. runTestDir
//----------------------------------------------------------------------------
describe("test-runner: runTestDir", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns empty for a missing dir", () => {
    const r = runTestDir(path.join(dir, "nope"));
    expect(r.total).toBe(0);
  });

  it("returns empty for a dir with no .ae files", () => {
    writeTmpFile(dir, "README.md", "nope");
    const r = runTestDir(dir);
    expect(r.total).toBe(0);
  });

  it("runs every .test.ae file in the dir", () => {
    writeTmpFile(dir, "a.test.ae", "fn test_a() { assert_eq(1, 1); }");
    writeTmpFile(dir, "b.test.ae", "fn test_b() { assert_eq(2, 2); }");
    const r = runTestDir(dir);
    expect(r.total).toBe(2);
    expect(r.passed).toBe(2);
  });

  it("aggregates results from multiple files", () => {
    writeTmpFile(dir, "a.test.ae", "fn test_a() { assert_eq(1, 1); }");
    writeTmpFile(dir, "b.test.ae", "fn test_b() { assert_eq(1, 2); }");
    const r = runTestDir(dir);
    expect(r.total).toBe(2);
    expect(r.passed).toBe(1);
    expect(r.failed).toBe(1);
  });

  it("recurses into subdirectories", () => {
    fs.mkdirSync(path.join(dir, "sub"));
    writeTmpFile(dir, "a.test.ae", "fn test_a() { assert_eq(1, 1); }");
    fs.writeFileSync(path.join(dir, "sub", "b.test.ae"), "fn test_b() { assert_eq(2, 2); }");
    const r = runTestDir(dir);
    expect(r.total).toBe(2);
  });

  it("ignores .ae files without assert/assert_eq by default", () => {
    writeTmpFile(dir, "demo.ae", 'print("hello");');
    const r = runTestDir(dir);
    expect(r.total).toBe(0);
  });

  it("includes .ae files with assert/assert_eq (legacy)", () => {
    writeTmpFile(dir, "legacy.ae", "assert_eq(1, 1);");
    const r = runTestDir(dir);
    expect(r.total).toBe(1);
  });

  it("includeNonTestFiles option picks up all .ae files", () => {
    writeTmpFile(dir, "demo.ae", 'print("hello");');
    const r = runTestDir(dir, { includeNonTestFiles: true });
    expect(r.total).toBe(1);
  });

  it("parallel: true returns the same aggregated result as sequential", () => {
    writeTmpFile(dir, "a.test.ae", "fn test_a() { assert_eq(1, 1); }");
    writeTmpFile(dir, "b.test.ae", "fn test_b() { assert_eq(2, 2); }");
    const seq = runTestDir(dir, { parallel: false });
    const par = runTestDir(dir, { parallel: true });
    expect(par.total).toBe(seq.total);
    expect(par.passed).toBe(seq.passed);
    expect(par.failed).toBe(seq.failed);
  });

  it("aggregates coverage across files", () => {
    writeTmpFile(dir, "a.test.ae", "fn test_a() { assert_eq(1, 1); assert_eq(2, 2); }");
    writeTmpFile(dir, "b.test.ae", "fn test_b() { assert_eq(3, 3); }");
    const r = runTestDir(dir);
    expect(r.coverage!.asserts).toBe(3);
  });

  it("handles mixed pass/fail across files", () => {
    writeTmpFile(dir, "pass.test.ae", "fn test_p() { assert_eq(1, 1); }");
    writeTmpFile(dir, "fail.test.ae", "fn test_f() { assert_eq(1, 2); }");
    const r = runTestDir(dir);
    expect(r.passed).toBe(1);
    expect(r.failed).toBe(1);
  });
});

//----------------------------------------------------------------------------
// 7. Snapshot testing
//----------------------------------------------------------------------------
describe("test-runner: snapshot", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("creates a snapshot file on first run", () => {
    const src = 'fn test_snap() { assert_eq("hello", snapshot("hello")); }';
    const f = writeTmpFile(dir, "snap.test.ae", src);
    runTestFile(f);
    const snapPath = f + ".snap";
    expect(fs.existsSync(snapPath)).toBe(true);
  });

  it("first run passes (snapshot matches)", () => {
    const src = 'fn test_snap() { assert_eq("hello", snapshot("hello")); }';
    const f = writeTmpFile(dir, "snap.test.ae", src);
    const r = runTestFile(f);
    expect(r.passed).toBe(1);
  });

  it("subsequent run passes if value unchanged", () => {
    const src = 'fn test_snap() { assert_eq("hello", snapshot("hello")); }';
    const f = writeTmpFile(dir, "snap.test.ae", src);
    runTestFile(f);
    const r = runTestFile(f);
    expect(r.passed).toBe(1);
  });

  it("subsequent run fails if value changed", () => {
    // First run: snapshot "hello".
    let src = 'fn test_snap() { assert_eq("hello", snapshot("hello")); }';
    const f = writeTmpFile(dir, "snap.test.ae", src);
    runTestFile(f);
    // Second run: snapshot "world" — but stored is "hello", so assert_eq fails.
    src = 'fn test_snap() { assert_eq("world", snapshot("world")); }';
    fs.writeFileSync(f, src);
    const r = runTestFile(f);
    expect(r.failed).toBe(1);
  });

  it("snapshot file is JSON", () => {
    const src = 'fn test_snap() { assert_eq("v1", snapshot("v1")); }';
    const f = writeTmpFile(dir, "snap.test.ae", src);
    runTestFile(f);
    const snap = JSON.parse(fs.readFileSync(f + ".snap", "utf8"));
    expect(snap).toHaveProperty("test_snap");
  });

  it("snapshot stores the displayed string value", () => {
    const src = "fn test_snap() { assert_eq(42, snapshot(42)); }";
    const f = writeTmpFile(dir, "snap.test.ae", src);
    runTestFile(f);
    const snap = JSON.parse(fs.readFileSync(f + ".snap", "utf8"));
    expect(snap.test_snap).toBe("42");
  });

  it("in-memory snapshots work without a file (runTestSource)", () => {
    // runTestSource doesn't write a snapshot file, but the snapshot
    // builtin still works in-memory.
    const r = runTestSource('fn test_x() { assert_eq("hi", snapshot("hi")); }');
    expect(r.passed).toBe(1);
  });
});

//----------------------------------------------------------------------------
// 8. Error reporting shape
//----------------------------------------------------------------------------
describe("test-runner: error reporting", () => {
  it("failed test includes the panic message", () => {
    const r = runTestSource('fn test_x() { panic("custom message"); }');
    expect(r.results[0].error).toBe("custom message");
  });

  it("passed test has undefined error", () => {
    const r = runTestSource("fn test_x() { assert_eq(1, 1); }");
    expect(r.results[0].error).toBeUndefined();
  });

  it("per-test durationMs is a number", () => {
    const r = runTestSource("fn test_x() { assert_eq(1, 1); }");
    expect(typeof r.results[0].durationMs).toBe("number");
    expect(r.results[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("output is a string (joined by newlines)", () => {
    const r = runTestSource('fn test_x() { print("hi"); assert_eq(1, 1); }');
    expect(typeof r.results[0].output).toBe("string");
  });
});

//----------------------------------------------------------------------------
// 9. CLI entry point (cliMain)
//----------------------------------------------------------------------------
describe("test-runner: cliMain", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns 0 when all tests pass", () => {
    const f = writeTmpFile(dir, "pass.ae", "fn test_x() { assert_eq(1, 1); }");
    expect(cliMain([f])).toBe(0);
  });

  it("returns 1 when a test fails", () => {
    const f = writeTmpFile(dir, "fail.ae", "fn test_x() { assert_eq(1, 2); }");
    expect(cliMain([f])).toBe(1);
  });

  it("returns 2 when no target is given", () => {
    expect(cliMain([])).toBe(2);
  });

  it("returns 0 for a passing dir", () => {
    writeTmpFile(dir, "pass.test.ae", "fn test_x() { assert_eq(1, 1); }");
    expect(cliMain([dir])).toBe(0);
  });

  it("returns 1 for a dir with a failing test", () => {
    writeTmpFile(dir, "fail.test.ae", "fn test_x() { assert_eq(1, 2); }");
    expect(cliMain([dir])).toBe(1);
  });
});
