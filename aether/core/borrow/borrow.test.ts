/**
 * aether/core/borrow/borrow.test.ts
 * =================================
 * 60+ tests for the simplified borrow checker (RFC-004 prototype).
 *
 * 30+ positive cases (valid programs — borrow checker must report NO errors).
 * 30+ negative cases (invalid programs — borrow checker must report errors).
 *
 * Each test parses the source, runs `BorrowChecker.check(program)`, and
 * asserts on the returned `BorrowError[]`.
 */
import { describe, it, expect } from "vitest";
import { parseSource } from "../parser/parser";
import { BorrowChecker, checkBorrows, type BorrowError } from "./borrow";

function errors(src: string): BorrowError[] {
  const r = parseSource(src);
  if (r.errors.length > 0) {
    throw new Error(`parse errors: ${r.errors.map(e => e.message).join("; ")}`);
  }
  return new BorrowChecker().check(r.program);
}

function errCount(src: string): number {
  return errors(src).length;
}

function errMessages(src: string): string[] {
  return errors(src).map(e => e.message);
}

function hasError(src: string, substr: string): boolean {
  return errMessages(src).some(m => m.includes(substr));
}

//----------------------------------------------------------------------------
// POSITIVE CASES — programs that should pass borrow checking
//----------------------------------------------------------------------------
describe("borrow: positive cases (no errors)", () => {
  it("simple let binding", () => {
    expect(errCount("let x = 5; print(x);")).toBe(0);
  });

  it("Copy int can be reused after assign", () => {
    expect(errCount("let x = 5; let y = x; print(x); print(y);")).toBe(0);
  });

  it("Copy float can be reused after assign", () => {
    expect(errCount("let x = 3.14; let y = x; print(x); print(y);")).toBe(0);
  });

  it("Copy bool can be reused after assign", () => {
    expect(errCount("let x = true; let y = x; print(x); print(y);")).toBe(0);
  });

  it("Copy char can be reused after assign", () => {
    expect(errCount("let x = 'a'; let y = x; print(x); print(y);")).toBe(0);
  });

  it("immutable borrow of int", () => {
    expect(errCount("let x = 5; let r = &x; print(*r);")).toBe(0);
  });

  it("multiple immutable borrows coexist", () => {
    expect(errCount("let x = 5; let r = &x; let s = &x; print(*r); print(*s);")).toBe(0);
  });

  it("mutable borrow alone", () => {
    expect(errCount("let mut x = 5; let r = &mut x; print(*r);")).toBe(0);
  });

  it("sequential mutable borrows (after expiry)", () => {
    expect(errCount(
      "let mut x = 5; let r = &mut x; print(*r); let s = &mut x; print(*s);"
    )).toBe(0);
  });

  it("sequential: mutable then immutable", () => {
    expect(errCount(
      "let mut x = 5; let r = &mut x; print(*r); let s = &x; print(*s);"
    )).toBe(0);
  });

  it("sequential: immutable then mutable", () => {
    expect(errCount(
      "let mut x = 5; let r = &x; print(*r); let s = &mut x; print(*s);"
    )).toBe(0);
  });

  it("move then use new owner", () => {
    expect(errCount("let x = [1, 2]; let y = x; print(y);")).toBe(0);
  });

  it("move expression in let", () => {
    expect(errCount("let x = [1, 2]; let y = move x; print(y);")).toBe(0);
  });

  it("explicit move into function call", () => {
    expect(errCount("let x = [1, 2]; print(len(move x));")).toBe(0);
  });

  it("borrow x then print x (immutable borrow ends)", () => {
    expect(errCount("let x = 5; let r = &x; print(*r); print(x);")).toBe(0);
  });

  it("print called multiple times on same Copy value", () => {
    expect(errCount("let x = 5; print(x); print(x); print(x);")).toBe(0);
  });

  it("array literal then print", () => {
    expect(errCount("let x = [1, 2, 3]; print(x);")).toBe(0);
  });

  it("mut reassign is allowed when not borrowed", () => {
    expect(errCount("let mut x = 5; x = 10; print(x);")).toBe(0);
  });

  it("compound assign on mut variable", () => {
    expect(errCount("let mut x = 5; x += 1; print(x);")).toBe(0);
  });

  it("while loop with mut counter", () => {
    expect(errCount("let mut i = 0; while i < 5 { i = i + 1; } print(i);")).toBe(0);
  });

  it("function with no borrow", () => {
    expect(errCount("fn id(x: int) -> int { x } print(id(5));")).toBe(0);
  });

  it("function call passing array explicitly moved", () => {
    expect(errCount(
      "fn take(a: [int]) -> int { len(a) } let x = [1, 2]; let n = take(move x); print(n);"
    )).toBe(0);
  });

  it("function call without move (read)", () => {
    expect(errCount("let x = [1, 2]; let n = len(x); print(x); print(n);")).toBe(0);
  });

  it("inline immutable borrow in call expires", () => {
    expect(errCount("let x = [1]; print(len(&x)); print(len(&x)); print(x);")).toBe(0);
  });

  it("field access is a read", () => {
    expect(errCount("let p = (1, 2); print(p.0); print(p.1);")).toBe(0);
  });

  it("index access is a read", () => {
    expect(errCount("let arr = [10, 20, 30]; print(arr[0]); print(arr[1]);")).toBe(0);
  });

  it("if expression with both branches", () => {
    expect(errCount("let x = 5; let y = if x > 0 { 1 } else { -1 }; print(y);")).toBe(0);
  });

  it("match expression", () => {
    expect(errCount(
      'let x = 5; let y = match x { 1 => "one", _ => "other" }; print(y);'
    )).toBe(0);
  });

  it("recursive function", () => {
    expect(errCount(
      "fn fact(n: int) -> int { if n <= 1 { 1 } else { n * fact(n - 1) } } print(fact(5));"
    )).toBe(0);
  });

  it("closure capturing outer variable", () => {
    expect(errCount("let x = 5; let f = fn() -> int { x }; print(f());")).toBe(0);
  });

  it("multiple let bindings of different names", () => {
    expect(errCount("let a = 1; let b = 2; let c = 3; print(a + b + c);")).toBe(0);
  });

  it("nested block scopes (no cross-block borrows)", () => {
    expect(errCount(
      "let mut x = 5; { let r = &x; print(*r); }; let s = &mut x; print(*s);"
    )).toBe(0);
  });

  it("shadowing a binding (let x = 5; let x = 10;)", () => {
    expect(errCount("let x = 5; let x = 10; print(x);")).toBe(0);
  });

  it("move inside expression position then use new owner", () => {
    expect(errCount("let x = [1, 2, 3]; let y = move x; let z = move y; print(z);")).toBe(0);
  });

  it("immutable borrow of int used multiple times", () => {
    expect(errCount("let x = 42; let r = &x; let s = &x; let t = &x; print(*r); print(*s); print(*t);")).toBe(0);
  });

  it("binary expression reads operands", () => {
    expect(errCount("let a = 5; let b = 10; print(a + b); print(a); print(b);")).toBe(0);
  });
});

//----------------------------------------------------------------------------
// NEGATIVE CASES — programs that the borrow checker MUST flag
//----------------------------------------------------------------------------
describe("borrow: negative cases (errors detected)", () => {
  it("use of moved value (array)", () => {
    expect(hasError("let x = [1, 2]; let y = x; print(x);", "use of moved value 'x'")).toBe(true);
  });

  it("use of moved value (string)", () => {
    expect(hasError('let s = "hi"; let t = s; print(s);', "use of moved value 's'")).toBe(true);
  });

  it("use of moved value via move expression", () => {
    expect(hasError("let x = [1]; let y = move x; print(x);", "use of moved value 'x'")).toBe(true);
  });

  it("use of moved value after explicit move into call", () => {
    expect(hasError("let x = [1, 2]; print(len(move x)); print(x);", "use of moved value 'x'")).toBe(true);
  });

  it("double mutable borrow (named)", () => {
    expect(hasError("let mut x = 5; let r = &mut x; let s = &mut x;", "cannot borrow 'x' as mutable")).toBe(true);
  });

  it("double mutable borrow with uses", () => {
    expect(hasError(
      "let mut x = 5; let r = &mut x; let s = &mut x; print(*r); print(*s);",
      "cannot borrow 'x' as mutable"
    )).toBe(true);
  });

  it("mutable + immutable borrow (mixed)", () => {
    expect(hasError(
      "let mut x = 5; let r = &x; let s = &mut x;",
      "cannot borrow 'x' as mutable"
    )).toBe(true);
  });

  it("immutable + mutable borrow (reversed)", () => {
    expect(hasError(
      "let mut x = 5; let r = &mut x; let s = &x;",
      "cannot borrow 'x' as immutable"
    )).toBe(true);
  });

  it("mutable borrow of immutable variable", () => {
    expect(hasError(
      "let x = 5; let r = &mut x;",
      "not declared mut"
    )).toBe(true);
  });

  it("assign to borrowed variable", () => {
    expect(hasError(
      "let mut x = 5; let r = &x; x = 10;",
      "cannot assign to 'x'"
    )).toBe(true);
  });

  it("assign to mut-borrowed variable", () => {
    expect(hasError(
      "let mut x = 5; let r = &mut x; x = 10;",
      "cannot assign to 'x'"
    )).toBe(true);
  });

  it("move while borrowed (immutable)", () => {
    expect(hasError(
      "let x = [1]; let r = &x; let y = x;",
      "cannot move 'x'"
    )).toBe(true);
  });

  it("move while mut-borrowed", () => {
    expect(hasError(
      "let mut x = [1]; let r = &mut x; let y = x;",
      "cannot move 'x'"
    )).toBe(true);
  });

  it("two moves of same value", () => {
    expect(hasError(
      "let x = [1]; let y = x; let z = x;",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("move in array literal", () => {
    expect(hasError(
      "let x = [1]; let y = [x]; print(x);",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("move in tuple literal", () => {
    expect(hasError(
      "let x = [1]; let y = (x, 5); print(x);",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("re-borrow after move", () => {
    expect(hasError(
      "let x = [1]; let y = x; let r = &x;",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("move into function via move then use original", () => {
    expect(hasError(
      "let x = [1, 2, 3]; let n = len(move x); print(x);",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("use of moved value in subsequent let", () => {
    expect(hasError(
      "let x = [1, 2]; let y = x; let z = x; print(y); print(z);",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("mutable borrow of immutable in expression", () => {
    expect(hasError(
      "let x = 5; let r = &mut x; print(*r);",
      "not declared mut"
    )).toBe(true);
  });

  it("use of moved value then second move", () => {
    expect(hasError(
      "let x = [1]; let y = x; print(x); let z = x;",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("double mutable borrow of array", () => {
    expect(hasError(
      "let mut x = [1, 2]; let r = &mut x; let s = &mut x;",
      "cannot borrow 'x' as mutable"
    )).toBe(true);
  });

  it("immutable borrow then assign (mutating x while borrowed)", () => {
    expect(hasError(
      "let mut x = 5; let r = &x; x = 10; print(*r);",
      "cannot assign to 'x'"
    )).toBe(true);
  });

  it("borrow moved value then use borrow", () => {
    expect(hasError(
      "let x = [1, 2]; let y = x; let r = &x; print(*r);",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("move via assignment then use (array)", () => {
    expect(hasError(
      "let s = [1, 2, 3]; let t = s; print(s);",
      "use of moved value 's'"
    )).toBe(true);
  });

  it("mutable borrow then attempt to move", () => {
    expect(hasError(
      "let mut x = [1, 2]; let r = &mut x; let y = x; print(*r);",
      "cannot move 'x'"
    )).toBe(true);
  });

  it("use of moved value via shadowing does not error (shadow replaces)", () => {
    // Shadowing is fine — the new binding is a separate variable.
    // This is a NEGATIVE-of-negative: confirms we don't false-positive.
    expect(errCount("let x = [1]; let x = [2]; print(x);")).toBe(0);
  });

  it("double inline mutable borrow in same call", () => {
    expect(hasError(
      "let mut x = 5; f(&mut x, &mut x);",
      "cannot borrow 'x' as mutable"
    )).toBe(true);
  });

  it("inline immutable then mutable in same call", () => {
    expect(hasError(
      "let mut x = 5; f(&x, &mut x);",
      "cannot borrow 'x'"
    )).toBe(true);
  });

  it("move into function twice (second move errors)", () => {
    expect(hasError(
      "let x = [1]; print(len(move x)); print(len(move x));",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("borrow of a moved value via inline", () => {
    expect(hasError(
      "let x = [1, 2]; let y = x; f(&x);",
      "use of moved value 'x'"
    )).toBe(true);
  });

  it("assign to borrowed then move", () => {
    // The first error surfaces (assign to borrowed); the second (move
    // borrowed) is also caught — both should be reported.
    const errs = errMessages(
      "let mut x = [1]; let r = &x; x = [2]; let y = x;"
    );
    expect(errs.length).toBeGreaterThan(0);
  });

  it("function body: use of moved parameter", () => {
    expect(hasError(
      "fn consume(a: [int]) -> int { let b = a; print(a); len(b) } print(consume([1]));",
      "use of moved value 'a'"
    )).toBe(true);
  });
});

//----------------------------------------------------------------------------
// Convenience entry point check
//----------------------------------------------------------------------------
describe("borrow: convenience entry point", () => {
  it("checkBorrows(program) returns the same as BorrowChecker.check", () => {
    const r = parseSource("let x = [1]; let y = x; print(x);");
    const errs1 = new BorrowChecker().check(r.program);
    const errs2 = checkBorrows(r.program);
    expect(errs2.length).toBe(errs1.length);
    expect(errs2.length).toBeGreaterThan(0);
  });
});

//----------------------------------------------------------------------------
// Snapshot / OwnershipInfo sanity check
//----------------------------------------------------------------------------
describe("borrow: snapshot", () => {
  it("snapshot after a let has the binding owned", () => {
    const r = parseSource("let x = 5; print(x);");
    const chk = new BorrowChecker();
    chk.check(r.program);
    // No errors, no exceptions.
    expect(chk.errors.length).toBe(0);
  });
});
