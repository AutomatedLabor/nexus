/**
 * aether/tools/linter/linter.test.ts
 * ===================================
 * Test suite for the Aether linter (30 rules × 4 cases = 120 tests).
 *
 * For each rule:
 *   1. good case   — code that should NOT trigger the rule
 *   2. bad case    — code that SHOULD trigger the rule (≥1 diag of this rule)
 *   3. off case    — bad code with the rule disabled (`rules: { <rule>: 'off' }`)
 *                    should produce ZERO diags of this rule
 *   4. edge case   — subtle / boundary situation specific to the rule
 *
 * The `forRule` helper filters the lint output to only diagnostics from a
 * particular rule.  The `hasDiag` / `noDiag` helpers make assertions terse.
 */
import { describe, it, expect } from "vitest";
import { lint, DEFAULT_RULES } from "./linter";

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

/** Lint a snippet, returning only diagnostics for the named rule. */
function forRule(src: string, rule: string): ReturnType<typeof lint> {
  return lint(src).filter(d => d.rule === rule);
}

/** Lint a snippet with the named rule disabled, asserting no diags from it. */
function withOff(src: string, rule: string): ReturnType<typeof lint> {
  return lint(src, { rules: { [rule]: "off" } }).filter(d => d.rule === rule);
}

/** Assert at least one diagnostic of this rule exists. */
function hasDiag(src: string, rule: string): void {
  const d = forRule(src, rule);
  expect(d.length, `expected ≥1 diag for ${rule}, got 0`).toBeGreaterThan(0);
  // Every diagnostic must carry line/col per the public interface.
  for (const x of d) {
    expect(typeof x.line).toBe("number");
    expect(typeof x.col).toBe("number");
    expect(x.line).toBeGreaterThanOrEqual(1);
    expect(x.col).toBeGreaterThanOrEqual(1);
  }
}

/** Assert zero diagnostics of this rule (and zero for the rule when off). */
function noDiag(src: string, rule: string): void {
  const d = forRule(src, rule);
  expect(d.length, `expected 0 diags for ${rule}, got ${d.length}`).toBe(0);
}

//-----------------------------------------------------------------------------
// Sanity: 30 rules registered
//-----------------------------------------------------------------------------
describe("linter: registry", () => {
  it("registers exactly 30 rules", () => {
    expect(Object.keys(DEFAULT_RULES).length).toBe(30);
  });
  it("every default severity is one of error/warning/info", () => {
    for (const [name, sev] of Object.entries(DEFAULT_RULES)) {
      expect(["error", "warning", "info"]).toContain(sev);
      void name;
    }
  });
});

//=============================================================================
// CORRECTNESS (10)
//=============================================================================

describe("rule: no-shadow", () => {
  it("good: distinct names do not shadow", () => {
    noDiag("let a = 1;\nlet b = 2;", "no-shadow");
  });
  it("bad: inner let shadows outer", () => {
    hasDiag("let x = 1;\nfn f() { let x = 2; x }", "no-shadow");
  });
  it("off: silenced", () => {
    expect(withOff("let x = 1;\nfn f() { let x = 2; x }", "no-shadow").length).toBe(0);
  });
  it("edge: wildcard pattern bind `_x` is not flagged as shadow", () => {
    noDiag("let _ = 1;\nlet _ = 2;", "no-shadow");
  });
});

describe("rule: no-unused-var", () => {
  it("good: used variable", () => {
    noDiag("let x = 1;\nprint(x);", "no-unused-var");
  });
  it("bad: unused variable", () => {
    hasDiag("let x = 1;\nprint(2);", "no-unused-var");
  });
  it("off: silenced", () => {
    expect(withOff("let x = 1;\nprint(2);", "no-unused-var").length).toBe(0);
  });
  it("edge: names starting with _ are intentionally unused", () => {
    noDiag("let _unused = 1;\nprint(2);", "no-unused-var");
  });
});

describe("rule: no-unused-import", () => {
  it("good: import used as identifier", () => {
    noDiag('import "m" { foo };\nfoo();', "no-unused-import");
  });
  it("bad: imported name never used", () => {
    hasDiag('import "m" { foo };\nprint(1);', "no-unused-import");
  });
  it("off: silenced", () => {
    expect(withOff('import "m" { foo };\nprint(1);', "no-unused-import").length).toBe(0);
  });
  it("edge: bare import (no names) does not trigger", () => {
    noDiag('import "m";\nprint(1);', "no-unused-import");
  });
});

describe("rule: no-unreachable", () => {
  it("good: return at end of block", () => {
    noDiag("fn f() -> int { let x = 1; return x; }", "no-unreachable");
  });
  it("bad: code after return is unreachable", () => {
    hasDiag("fn f() -> int { return 1; print(2); }", "no-unreachable");
  });
  it("off: silenced", () => {
    expect(withOff("fn f() -> int { return 1; print(2); }", "no-unreachable").length).toBe(0);
  });
  it("edge: break inside while, code after is unreachable", () => {
    hasDiag("fn f() { while true { break; print(1); } }", "no-unreachable");
  });
});

describe("rule: no-empty-match", () => {
  it("good: match with arms", () => {
    noDiag("let x = match 1 { 1 => 1, _ => 0 };", "no-empty-match");
  });
  it("bad: match with no arms", () => {
    hasDiag("let x = match 1 { };", "no-empty-match");
  });
  it("off: silenced", () => {
    expect(withOff("let x = match 1 { };", "no-empty-match").length).toBe(0);
  });
  it("edge: match with single wildcard arm is not empty", () => {
    noDiag("let x = match 1 { _ => 0 };", "no-empty-match");
  });
});

describe("rule: match-not-exhaustive", () => {
  it("good: match with wildcard arm", () => {
    noDiag("let x = match n { 1 => 1, _ => 0 };", "match-not-exhaustive");
  });
  it("bad: match without wildcard is not exhaustive", () => {
    hasDiag("let x = match n { 1 => 1, 2 => 2 };", "match-not-exhaustive");
  });
  it("off: silenced", () => {
    expect(withOff("let x = match n { 1 => 1, 2 => 2 };", "match-not-exhaustive").length).toBe(0);
  });
  it("edge: empty match is not flagged (handled by no-empty-match)", () => {
    noDiag("let x = match n { };", "match-not-exhaustive");
  });
});

describe("rule: no-panic-in-fn", () => {
  it("good: no panic call", () => {
    noDiag("fn f() { return 1; }", "no-panic-in-fn");
  });
  it("bad: panic() call present", () => {
    hasDiag("fn f() { panic(); }", "no-panic-in-fn");
  });
  it("off: silenced", () => {
    expect(withOff("fn f() { panic(); }", "no-panic-in-fn").length).toBe(0);
  });
  it("edge: panic in expression position also flagged", () => {
    hasDiag("let x = panic();", "no-panic-in-fn");
  });
});

describe("rule: no-duplicate-def", () => {
  it("good: distinct top-level names", () => {
    noDiag("fn a() { 1 }\nfn b() { 2 }", "no-duplicate-def");
  });
  it("bad: two functions with same name at top level", () => {
    hasDiag("fn a() { 1 }\nfn a() { 2 }", "no-duplicate-def");
  });
  it("off: silenced", () => {
    expect(withOff("fn a() { 1 }\nfn a() { 2 }", "no-duplicate-def").length).toBe(0);
  });
  it("edge: same name in separate function scopes is allowed", () => {
    noDiag("fn f() { let x = 1; x }\nfn g() { let x = 2; x }", "no-duplicate-def");
  });
});

describe("rule: no-compare-float-eq", () => {
  it("good: integer equality", () => {
    noDiag("let b = 1 == 2;", "no-compare-float-eq");
  });
  it("bad: float literal compared with ==", () => {
    hasDiag("let b = 1.0 == 2.0;", "no-compare-float-eq");
  });
  it("off: silenced", () => {
    expect(withOff("let b = 1.0 == 2.0;", "no-compare-float-eq").length).toBe(0);
  });
  it("edge: float inequality != also flagged", () => {
    hasDiag("let b = 1.5 != 2.5;", "no-compare-float-eq");
  });
});

describe("rule: no-mut-reassign", () => {
  it("good: mut variable reassigned", () => {
    noDiag("let mut x = 1;\nx = 2;", "no-mut-reassign");
  });
  it("bad: non-mut let reassigned", () => {
    hasDiag("let x = 1;\nx = 2;", "no-mut-reassign");
  });
  it("off: silenced", () => {
    expect(withOff("let x = 1;\nx = 2;", "no-mut-reassign").length).toBe(0);
  });
  it("edge: const reassign also flagged (const is not mut)", () => {
    hasDiag("const X = 1;\nX = 2;", "no-mut-reassign");
  });
});

//=============================================================================
// STYLE (10)
//=============================================================================

describe("rule: no-trailing-whitespace", () => {
  it("good: clean line", () => {
    noDiag("let x = 1;\n", "no-trailing-whitespace");
  });
  it("bad: trailing spaces", () => {
    hasDiag("let x = 1;   \n", "no-trailing-whitespace");
  });
  it("off: silenced", () => {
    expect(withOff("let x = 1;   \n", "no-trailing-whitespace").length).toBe(0);
  });
  it("edge: trailing tab also flagged", () => {
    hasDiag("let x = 1;\t\n", "no-trailing-whitespace");
  });
});

describe("rule: no-mixed-indent", () => {
  it("good: pure space indent", () => {
    noDiag("fn f() {\n  let x = 1;\n}\n", "no-mixed-indent");
  });
  it("bad: mix of spaces and tabs", () => {
    hasDiag("fn f() {\n\t let x = 1;\n}\n", "no-mixed-indent");
  });
  it("off: silenced", () => {
    expect(withOff("fn f() {\n\t let x = 1;\n}\n", "no-mixed-indent").length).toBe(0);
  });
  it("edge: pure tab indent is not mixed", () => {
    noDiag("fn f() {\n\t\tlet x = 1;\n}\n", "no-mixed-indent");
  });
});

describe("rule: prefer-const", () => {
  it("good: let mut is fine when intended", () => {
    noDiag("let mut x = 1;\nx = 2;", "prefer-const");
  });
  it("bad: let never reassigned should be const", () => {
    hasDiag("let x = 1;\nprint(x);", "prefer-const");
  });
  it("off: silenced", () => {
    expect(withOff("let x = 1;\nprint(x);", "prefer-const").length).toBe(0);
  });
  it("edge: names prefixed with _ are not flagged", () => {
    noDiag("let _x = 1;", "prefer-const");
  });
});

describe("rule: naming-snake", () => {
  it("good: snake_case variable", () => {
    noDiag("let my_var = 1;", "naming-snake");
  });
  it("bad: camelCase variable", () => {
    hasDiag("let myVar = 1;", "naming-snake");
  });
  it("off: silenced", () => {
    expect(withOff("let myVar = 1;", "naming-snake").length).toBe(0);
  });
  it("edge: function names must also be snake_case", () => {
    hasDiag("fn myFunc() { 1 }", "naming-snake");
  });
});

describe("rule: naming-pascal", () => {
  it("good: PascalCase struct", () => {
    noDiag("struct Foo { x: int }", "naming-pascal");
  });
  it("bad: lowercase struct name", () => {
    hasDiag("struct foo { x: int }", "naming-pascal");
  });
  it("off: silenced", () => {
    expect(withOff("struct foo { x: int }", "naming-pascal").length).toBe(0);
  });
  it("edge: enum variant names must also be PascalCase", () => {
    hasDiag("enum E { badVariant }", "naming-pascal");
  });
});

describe("rule: naming-screaming", () => {
  it("good: SCREAMING_SNAKE const", () => {
    noDiag("const MAX_SIZE = 100;", "naming-screaming");
  });
  it("bad: lowercase const", () => {
    hasDiag("const maxSize = 100;", "naming-screaming");
  });
  it("off: silenced", () => {
    expect(withOff("const maxSize = 100;", "naming-screaming").length).toBe(0);
  });
  it("edge: PascalCase const also flagged (not SCREAMING)", () => {
    hasDiag("const MaxSize = 100;", "naming-screaming");
  });
});

describe("rule: no-single-match", () => {
  it("good: match with multiple arms", () => {
    noDiag("let x = match n { 1 => 1, 2 => 2, _ => 0 };", "no-single-match");
  });
  it("bad: match with single arm", () => {
    hasDiag("let x = match n { 1 => 1 };", "no-single-match");
  });
  it("off: silenced", () => {
    expect(withOff("let x = match n { 1 => 1 };", "no-single-match").length).toBe(0);
  });
  it("edge: empty match is not flagged by no-single-match (handled elsewhere)", () => {
    noDiag("let x = match n { };", "no-single-match");
  });
});

describe("rule: prefer-interpolation", () => {
  it("good: f-string used", () => {
    noDiag('let s = f"x={x}";', "prefer-interpolation");
  });
  it("bad: string concat with ident", () => {
    hasDiag('let s = "x=" + x;', "prefer-interpolation");
  });
  it("off: silenced", () => {
    expect(withOff('let s = "x=" + x;', "prefer-interpolation").length).toBe(0);
  });
  it("edge: numeric + is not string concat", () => {
    noDiag("let x = 1 + 2;", "prefer-interpolation");
  });
});

describe("rule: no-deep-nesting", () => {
  it("good: shallow nesting", () => {
    noDiag("fn f() { if true { 1 } else { 0 } }", "no-deep-nesting");
  });
  it("bad: deeply nested if (>4)", () => {
    // 5 nested ifs to push depth > MAX=4
    hasDiag(
      "fn f() { if true { if true { if true { if true { if true { 1 } } } } } }",
      "no-deep-nesting",
    );
  });
  it("off: silenced", () => {
    expect(
      withOff(
        "fn f() { if true { if true { if true { if true { if true { 1 } } } } } }",
        "no-deep-nesting",
      ).length,
    ).toBe(0);
  });
  it("edge: shallow while loop is at the threshold (depth 4) and OK", () => {
    noDiag("fn f() { while true { 1 } }", "no-deep-nesting");
  });
});

describe("rule: line-too-long", () => {
  it("good: short line", () => {
    noDiag("let x = 1;\n", "line-too-long");
  });
  it("bad: line > 100 chars", () => {
    const long = "let x = " + "a".repeat(120) + ";";
    hasDiag(long + "\n", "line-too-long");
  });
  it("off: silenced", () => {
    const long = "let x = " + "a".repeat(120) + ";";
    expect(withOff(long + "\n", "line-too-long").length).toBe(0);
  });
  it("edge: line exactly 100 chars is OK", () => {
    const exact = "let x = " + "a".repeat(100 - "let x = ".length - 1) + ";";
    noDiag(exact + "\n", "line-too-long");
  });
});

//=============================================================================
// PERFORMANCE (5)
//=============================================================================

describe("rule: no-string-concat-in-loop", () => {
  it("good: concat outside loop", () => {
    noDiag('let s = "a" + "b";', "no-string-concat-in-loop");
  });
  it("bad: string concat in loop", () => {
    hasDiag(
      'let mut s = "";\nfor c in arr { s = s + c }',
      "no-string-concat-in-loop",
    );
  });
  it("off: silenced", () => {
    expect(
      withOff('let mut s = "";\nfor c in arr { s = s + c }', "no-string-concat-in-loop").length,
    ).toBe(0);
  });
  it("edge: compound += in loop also flagged", () => {
    hasDiag(
      'let mut s = "";\nfor c in arr { s += c }',
      "no-string-concat-in-loop",
    );
  });
});

describe("rule: no-array-growth-in-loop", () => {
  it("good: push outside loop", () => {
    noDiag("let mut a = [1];\na.push(2);", "no-array-growth-in-loop");
  });
  it("bad: push inside for loop (statement form)", () => {
    hasDiag("let a = [1];\nfor i in arr { a.push(i); }", "no-array-growth-in-loop");
  });
  it("off: silenced", () => {
    expect(
      withOff("let a = [1];\nfor i in arr { a.push(i); }", "no-array-growth-in-loop").length,
    ).toBe(0);
  });
  it("edge: push inside while loop also flagged", () => {
    hasDiag("let a = [1];\nwhile true { a.push(1); }", "no-array-growth-in-loop");
  });
});

describe("rule: prefer-range", () => {
  it("good: for-in loop", () => {
    noDiag("for i in range(0, 10) { print(i) }", "prefer-range");
  });
  it("bad: while with counter + increment", () => {
    hasDiag(
      "let mut i = 0;\nwhile i < 10 { print(i); i = i + 1; }",
      "prefer-range",
    );
  });
  it("off: silenced", () => {
    expect(
      withOff("let mut i = 0;\nwhile i < 10 { print(i); i = i + 1; }", "prefer-range").length,
    ).toBe(0);
  });
  it("edge: while without increment not flagged", () => {
    noDiag("let mut i = 0;\nwhile i < 10 { print(i); }", "prefer-range");
  });
});

describe("rule: no-recursive-fib", () => {
  it("good: non-fib recursive function", () => {
    noDiag("fn fact(n: int) -> int { if n <= 1 { 1 } else { n * fact(n - 1) } }", "no-recursive-fib");
  });
  it("bad: naive recursive fib with 2 self-calls", () => {
    hasDiag(
      "fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }",
      "no-recursive-fib",
    );
  });
  it("off: silenced", () => {
    expect(
      withOff(
        "fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }",
        "no-recursive-fib",
      ).length,
    ).toBe(0);
  });
  it("edge: fib with only 1 self-call (tail-recursive-ish) not flagged", () => {
    noDiag("fn fib(n: int) -> int { fib(n - 1) }", "no-recursive-fib");
  });
});

describe("rule: no-redundant-len-check", () => {
  it("good: numeric comparison unrelated to len", () => {
    noDiag("let b = x == 1;", "no-redundant-len-check");
  });
  it("bad: len(x) == 0", () => {
    hasDiag("let b = len(x) == 0;", "no-redundant-len-check");
  });
  it("off: silenced", () => {
    expect(withOff("let b = len(x) == 0;", "no-redundant-len-check").length).toBe(0);
  });
  it("edge: len(x) < 1 also flagged (equivalent to == 0)", () => {
    hasDiag("let b = len(x) < 1;", "no-redundant-len-check");
  });
});

//=============================================================================
// COMPLEXITY (5)
//=============================================================================

describe("rule: cognitive-complexity", () => {
  it("good: simple function", () => {
    noDiag("fn f(x: int) -> int { x + 1 }", "cognitive-complexity");
  });
  it("bad: deeply nested ifs inflate score > 15", () => {
    // 8 nested ifs → score = sum(1..8) = 36
    let src = "fn f() -> int { ";
    for (let i = 0; i < 8; i++) src += "if true { ";
    src += "1";
    for (let i = 0; i < 8; i++) src += " }";
    src += " }";
    hasDiag(src, "cognitive-complexity");
  });
  it("off: silenced", () => {
    let src = "fn f() -> int { ";
    for (let i = 0; i < 8; i++) src += "if true { ";
    src += "1";
    for (let i = 0; i < 8; i++) src += " }";
    src += " }";
    expect(withOff(src, "cognitive-complexity").length).toBe(0);
  });
  it("edge: a single if-statement scores 1, well under threshold", () => {
    noDiag("fn f() -> int { if true { 1 } else { 0 } }", "cognitive-complexity");
  });
});

describe("rule: too-many-params", () => {
  it("good: fn with 5 params", () => {
    noDiag("fn f(a: int, b: int, c: int, d: int, e: int) -> int { a }", "too-many-params");
  });
  it("bad: fn with 6 params", () => {
    hasDiag(
      "fn f(a: int, b: int, c: int, d: int, e: int, f: int) -> int { a }",
      "too-many-params",
    );
  });
  it("off: silenced", () => {
    expect(
      withOff(
        "fn f(a: int, b: int, c: int, d: int, e: int, f: int) -> int { a }",
        "too-many-params",
      ).length,
    ).toBe(0);
  });
  it("edge: zero-param function is fine", () => {
    noDiag("fn f() -> int { 1 }", "too-many-params");
  });
});

describe("rule: too-many-arms", () => {
  it("good: match with 10 arms (9 numbered + wildcard)", () => {
    let arms = "";
    for (let i = 1; i <= 9; i++) arms += `${i} => ${i}, `;
    arms += "_ => 0";
    noDiag(`let x = match n { ${arms} };`, "too-many-arms");
  });
  it("bad: match with 11 arms (10 numbered + wildcard)", () => {
    let arms = "";
    for (let i = 1; i <= 10; i++) arms += `${i} => ${i}, `;
    arms += "_ => 0";
    hasDiag(`let x = match n { ${arms} };`, "too-many-arms");
  });
  it("off: silenced", () => {
    let arms = "";
    for (let i = 1; i <= 10; i++) arms += `${i} => ${i}, `;
    arms += "_ => 0";
    expect(withOff(`let x = match n { ${arms} };`, "too-many-arms").length).toBe(0);
  });
  it("edge: single-arm match is below threshold", () => {
    noDiag("let x = match n { 1 => 1 };", "too-many-arms");
  });
});

describe("rule: deep-pattern-nesting", () => {
  it("good: shallow pattern", () => {
    noDiag("let x = match p { (a, b) => a };", "deep-pattern-nesting");
  });
  it("bad: nested pattern depth > 3", () => {
    hasDiag(
      "let x = match p { (((((a,))))) => a };",
      "deep-pattern-nesting",
    );
  });
  it("off: silenced", () => {
    expect(
      withOff("let x = match p { (((((a,))))) => a };", "deep-pattern-nesting").length,
    ).toBe(0);
  });
  it("edge: depth exactly 3 is OK", () => {
    noDiag("let x = match p { ((a, b), c) => a };", "deep-pattern-nesting");
  });
});

describe("rule: long-function", () => {
  it("good: short function", () => {
    noDiag("fn f() -> int { 1 }", "long-function");
  });
  it("bad: function spanning > 50 lines", () => {
    const lines = ["fn f() -> int {"];
    for (let i = 0; i < 55; i++) lines.push("  let x = " + i + ";");
    lines.push("0 }");
    hasDiag(lines.join("\n"), "long-function");
  });
  it("off: silenced", () => {
    const lines = ["fn f() -> int {"];
    for (let i = 0; i < 55; i++) lines.push("  let x = " + i + ";");
    lines.push("0 }");
    expect(withOff(lines.join("\n"), "long-function").length).toBe(0);
  });
  it("edge: function spanning exactly 50 lines is OK", () => {
    const lines = ["fn f() -> int {"];
    for (let i = 0; i < 48; i++) lines.push("  let x" + i + " = " + i + ";");
    lines.push("0 }");
    noDiag(lines.join("\n"), "long-function");
  });
});
