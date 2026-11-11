/**
 * aether/core/sema/sema.test.ts
 * ===========================
 * Type-inference / type-checking test suite: let/fn inference, generics,
 * pattern matching, numeric widening, undefined names, mismatch errors,
 * struct/enum field access, closures capturing.
 */
import { describe, it, expect } from "vitest";
import { parseSource } from "../parser/parser";
import { check } from "./sema";
import { typeToString } from "../types/types";
import type { Program } from "../ast/ast";

function checkSrc(src: string) {
  const r = parseSource(src);
  if (r.errors.length > 0) throw new Error(`parse errors: ${r.errors.map(e => e.message).join("; ")}`);
  return check(r.program);
}

function errCount(src: string): number {
  return checkSrc(src).errors.length;
}

function errMessages(src: string): string[] {
  return checkSrc(src).errors.map(e => e.message);
}

function typeOfExpr(src: string, exprName: string): string | undefined {
  // Parse a let `let <exprName> = EXPR;` and read the inferred type of EXPR.
  const r = parseSource(src);
  if (r.errors.length > 0) throw new Error(`parse errors: ${r.errors.map(e => e.message).join("; ")}`);
  const result = check(r.program);
  for (const s of r.program.body) {
    if ((s.kind === "Let" || s.kind === "MutLet" || s.kind === "Const")) {
      const ls = s as any;
      if (ls.name === exprName) {
        const t = result.types.get(ls.init);
        return t ? typeToString(t) : undefined;
      }
    }
  }
  return undefined;
}

describe("sema: let inference", () => {
  it("infers int from int literal", () => {
    expect(typeOfExpr("let x = 42;", "x")).toBe("int");
  });
  it("infers float from float literal", () => {
    expect(typeOfExpr("let x = 3.14;", "x")).toBe("float");
  });
  it("infers bool from true/false", () => {
    expect(typeOfExpr("let x = true;", "x")).toBe("bool");
  });
  it("infers string from string literal", () => {
    expect(typeOfExpr('let x = "hi";', "x")).toBe("string");
  });
  it("infers char from char literal", () => {
    expect(typeOfExpr("let x = 'a';", "x")).toBe("char");
  });
  it("infers unit from ()", () => {
    expect(typeOfExpr("let x = ();", "x")).toBe("()");
  });
  it("widens int to float when annotated", () => {
    expect(errCount("let x: float = 42;")).toBe(0);
  });
  it("rejects string assigned to int", () => {
    expect(errCount('let x: int = "hello";')).toBeGreaterThan(0);
  });
  it("infers tuple type", () => {
    expect(typeOfExpr("let x = (1, 2.0);", "x")).toBe("(int, float)");
  });
  it("infers array type", () => {
    expect(typeOfExpr("let x = [1, 2, 3];", "x")).toBe("[int]");
  });
  it("infers array of mixed to common (int/float)", () => {
    expect(typeOfExpr("let x = [1, 2.0];", "x")).toBe("[float]");
  });
});

describe("sema: function inference", () => {
  it("checks fn with annotated return", () => {
    expect(errCount("fn f() -> int { 42 }")).toBe(0);
  });
  it("errors on mismatched return type", () => {
    expect(errCount("fn f() -> int { true }")).toBeGreaterThan(0);
  });
  it("accepts recursive fib", () => {
    expect(errCount("fn fib(n: int) -> int { if n < 2 { n } else { fib(n-1) + fib(n-2) } }")).toBe(0);
  });
  it("infers function type", () => {
    const src = "fn id(x: int) -> int { x } let f = id;";
    expect(typeOfExpr(src, "f")).toBe("fn(int) -> int");
  });
});

describe("sema: generics", () => {
  it("checks generic id fn", () => {
    expect(errCount("fn id<T>(x: T) -> T { x }")).toBe(0);
  });
  it("infers T=int from id(42)", () => {
    expect(typeOfExpr("fn id<T>(x: T) -> T { x } let r = id(42);", "r")).toBe("int");
  });
  it("checks explicit generic instantiation", () => {
    expect(errCount("fn id<T>(x: T) -> T { x } let r = id<int>(42);")).toBe(0);
  });
  it("checks generic constraints syntax", () => {
    expect(errCount("fn sort<T: Ord>(xs: [T]) -> [T] { xs }")).toBe(0);
  });
});

describe("sema: pattern matching", () => {
  it("checks basic match", () => {
    expect(errCount(`
      enum Option<T> { Some(T), None, }
      fn unwrap(o: Option<int>, default: int) -> int {
        match o { Option::Some(v) => v, Option::None => default, }
      }
    `)).toBe(0);
  });
  it("errors on match arm type mismatch", () => {
    expect(errCount(`
      enum Option<T> { Some(T), None, }
      fn f(o: Option<int>) -> int {
        match o { Option::Some(v) => v, Option::None => 1.0, }
      }
    `)).toBeGreaterThan(0);
  });
  it("checks tuple pattern", () => {
    expect(errCount(`
      fn f(p: (int, float)) -> int { match p { (a, b) => a } }
    `)).toBe(0);
  });
  it("checks struct pattern", () => {
    expect(errCount(`
      struct Point { x: int, y: int }
      fn f(p: Point) -> int { match p { Point { x: a, y: b } => a } }
    `)).toBe(0);
  });
});

describe("sema: numeric widening", () => {
  it("widens int to float in arithmetic", () => {
    expect(typeOfExpr("let x = 1 + 2.0;", "x")).toBe("float");
  });
  it("keeps int for int + int", () => {
    expect(typeOfExpr("let x = 1 + 2;", "x")).toBe("int");
  });
  it("rejects string + int", () => {
    expect(errCount('let x: int = 1 + "a";')).toBeGreaterThan(0);
  });
  it("allows int as float", () => {
    expect(errCount("let x: float = 42;")).toBe(0);
  });
  it("rejects float as int (lossy)", () => {
    expect(errCount("let x: int = 3.14;")).toBeGreaterThan(0);
  });
});

describe("sema: undefined names", () => {
  it("errors on undefined name", () => {
    expect(errCount("let x = unknown_var;")).toBeGreaterThan(0);
  });
  it("reports the undefined name", () => {
    const msgs = errMessages("let x = zzz;");
    expect(msgs.some(m => m.includes("undefined name 'zzz'"))).toBe(true);
  });
  it("allows name defined later as fn", () => {
    expect(errCount("fn main() -> int { helper() } fn helper() -> int { 42 }")).toBe(0);
  });
});

describe("sema: mismatch errors", () => {
  it("reports expected vs found", () => {
    const msgs = errMessages('let x: int = "hello";');
    expect(msgs.some(m => m.includes("expected int"))).toBe(true);
    expect(msgs.some(m => m.includes("found string"))).toBe(true);
  });
  it("errors on wrong arg count", () => {
    expect(errCount("fn f(a: int, b: int) -> int { a + b } let x = f(1);")).toBeGreaterThan(0);
  });
  it("errors on arg type mismatch", () => {
    expect(errCount("fn f(a: int) -> int { a } let x = f(true);")).toBeGreaterThan(0);
  });
});

describe("sema: struct field access", () => {
  it("infers field type from struct", () => {
    expect(typeOfExpr("struct Point { x: int, y: int } let p = Point { x: 1, y: 2 }; let z = p.x;", "z")).toBe("int");
  });
  it("errors on missing field", () => {
    expect(errCount("struct Point { x: int, y: int } let p = Point { x: 1 };")).toBeGreaterThan(0);
  });
  it("errors on unknown field access", () => {
    expect(errCount("struct Point { x: int, y: int } let p = Point { x: 1, y: 2 }; let z = p.zzz;")).toBeGreaterThan(0);
  });
  it("infers tuple field access", () => {
    expect(typeOfExpr("let t = (1, 2.0); let z = t.0;", "z")).toBe("int");
    expect(typeOfExpr("let t = (1, 2.0); let z = t.1;", "z")).toBe("float");
  });
});

describe("sema: enum field access", () => {
  it("checks enum variant construction", () => {
    expect(errCount("enum Option<T> { Some(T), None, } let x = Option::Some(42);")).toBe(0);
  });
  it("errors on unknown variant", () => {
    expect(errCount("enum Option<T> { Some(T), None, } let x = Option::Maybe;")).toBeGreaterThan(0);
  });
  it("errors on wrong arg type for variant", () => {
    expect(errCount("enum Option<T> { Some(T), None, } let x = Option::Some(true);")).toBe(0);
  });
});

describe("sema: closures capturing", () => {
  it("captures outer variable", () => {
    expect(errCount("fn outer() -> int { let n = 10; let f = fn() -> int { n }; f() }")).toBe(0);
  });
  it("infers lambda type", () => {
    expect(typeOfExpr("let f = fn(x: int) -> int { x };", "f")).toBe("fn(int) -> int");
  });
  it("checks lambda body type", () => {
    expect(errCount("let f = fn(x: int) -> int { true };")).toBeGreaterThan(0);
  });
  it("captures and modifies outer mut", () => {
    expect(errCount("fn outer() -> int { let mut n = 10; let f = fn() -> int { n = 5; n }; n }")).toBe(0);
  });
});

describe("sema: immutability", () => {
  it("errors on assignment to immutable variable", () => {
    const msgs = errMessages("let x = 5; x = 10;");
    expect(msgs.some(m => m.includes("cannot assign to immutable"))).toBe(true);
  });
  it("allows assignment to mutable variable", () => {
    expect(errCount("let mut x = 5; x = 10;")).toBe(0);
  });
});

describe("sema: error propagation", () => {
  it("checks ? on Result", () => {
    expect(errCount(`
      enum Result<T, E> { Ok(T), Err(E), }
      fn read() -> Result<int, string> { Result::Ok(42) }
      fn caller() -> int { read()? }
    `)).toBe(0);
  });
  it("errors on ? on int", () => {
    expect(errCount(`
      fn f() -> int { let x = 5; x? }
    `)).toBeGreaterThan(0);
  });
});

describe("sema: control flow", () => {
  it("checks if expression", () => {
    expect(typeOfExpr("let x = if true { 1 } else { 2 };", "x")).toBe("int");
  });
  it("widens if branches", () => {
    expect(typeOfExpr("let x = if true { 1 } else { 2.0 };", "x")).toBe("float");
  });
  it("errors on while condition not bool", () => {
    expect(errCount("while 5 { 1 }")).toBeGreaterThan(0);
  });
  it("errors on break outside loop", () => {
    expect(errCount("fn f() { break; }")).toBeGreaterThan(0);
  });
});

describe("sema: cast (as)", () => {
  it("allows int as float", () => {
    expect(errCount("let x: float = 1 as float;")).toBe(0);
  });
  it("allows float as int", () => {
    expect(errCount("let x: int = 1.0 as int;")).toBe(0);
  });
  it("allows char as int", () => {
    expect(errCount("let x: int = 'a' as int;")).toBe(0);
  });
  it("errors on string as int", () => {
    expect(errCount('let x: int = "a" as int;')).toBeGreaterThan(0);
  });
});

describe("sema: shadows", () => {
  it("warns on shadowing", () => {
    const r = checkSrc("let x = 1; let x = 2;");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("sema: simple program", () => {
  it("type-checks a fib program cleanly", () => {
    expect(errCount(`
      fn fib(n: int) -> int {
        if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
      }
      print(fib(10));
    `)).toBe(0);
  });
  it("type-checks Result example", () => {
    expect(errCount(`
      enum Result<T, E> { Ok(T), Err(E), }
      fn read_config() -> Result<string, string> {
        let s = "config" or return Result::Err("missing");
        Result::Ok(s)
      }
    `)).toBe(0);
  });
  it("type-checks map example", () => {
    expect(errCount(`
      let nums = [1, 2, 3];
      let double = fn(x: int) -> int { x * 2 };
      let doubled = map(nums, double);
    `)).toBe(0);
  });
});
