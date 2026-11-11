/**
 * aether/core/eval/eval.test.ts
 * ==============================
 * End-to-end tests for the tree-walking evaluator. Every test runs Aether
 * source through the full `compileAndRun` pipeline (lex → parse → check → run)
 * and asserts on the runtime output / value / error.
 */
import { describe, it, expect } from "vitest";
import { compileAndRun } from "../index";
import { run } from "./eval";
import { parse } from "../parser/parser";
import { lexWithErrors } from "../lexer/lexer";

// Helper: run a source string and return the runtime result + ok flag.
function runSrc(src: string) {
  return compileAndRun(src);
}

// Helper: run a source string expecting no errors; return runtime.
function runOk(src: string) {
  const r = runSrc(src);
  if (r.parseErrors.length) throw new Error("parse errors: " + r.parseErrors.map(e => e.message).join("; "));
  if (r.runtime?.error) throw new Error("runtime error: " + r.runtime.error.message);
  return r;
}

// Helper: run and return joined output (single string), or value of last expr.
function out(src: string): string {
  const r = runOk(src);
  return (r.runtime?.output ?? []).join("\n");
}

// Helper: run and return the value of the last top-level expression.
function val(src: string): unknown {
  const r = runOk(src);
  return r.runtime?.value;
}

// Helper: run and return the runtime error message (or undefined if none).
function err(src: string): string | undefined {
  return runSrc(src).runtime?.error?.message;
}

// Bypass `compile`'s type-checker skip-when-types-bad heuristic — call
// run() directly so we can test the runtime in isolation even when the
// type-checker would complain (e.g. tests of runtime panics).
function runRaw(src: string) {
  const { tokens } = lexWithErrors(src, "<test>");
  const { program } = parse(tokens, "<test>");
  return run(program, {});
}

describe("eval: arithmetic", () => {
  it("adds two ints", () => { expect(out("print(1 + 2);")).toBe("3"); });
  it("subtracts", () => { expect(out("print(10 - 4);")).toBe("6"); });
  it("multiplies", () => { expect(out("print(3 * 4);")).toBe("12"); });
  it("divides (float)", () => { expect(out("print(7 / 2);")).toBe("3.5"); });
  it("modulo (Python positive)", () => { expect(out("print(-7 % 3);")).toBe("2"); });
  it("int division via cast", () => { expect(out("print((7 / 2) as int);")).toBe("3"); });
  it("negation", () => { expect(out("print(-5);")).toBe("-5"); });
  it("bitwise and", () => { expect(out("print(12 & 10);")).toBe("8"); });
  it("bitwise or", () => { expect(out("print(12 | 10);")).toBe("14"); });
  it("bitwise xor", () => { expect(out("print(12 ^ 10);")).toBe("6"); });
  it("left shift", () => { expect(out("print(1 << 4);")).toBe("16"); });
  it("right shift", () => { expect(out("print(256 >> 2);")).toBe("64"); });
});

describe("eval: precedence", () => {
  it("* over +", () => { expect(out("print(2 + 3 * 4);")).toBe("14"); });
  it("parens override", () => { expect(out("print((2 + 3) * 4);")).toBe("20"); });
  it("- binds tighter than <", () => { expect(out("print(1 - 2 < 0);")).toBe("true"); });
  it("&& over ||", () => { expect(out("print(true || false && false);")).toBe("true"); });
});

describe("eval: let / const / mut", () => {
  it("let binds value", () => { expect(out("let x = 42; print(x);")).toBe("42"); });
  it("const binds value", () => { expect(out("const y = 7; print(y);")).toBe("7"); });
  it("mut binds value", () => { expect(out("let mut z = 1; print(z);")).toBe("1"); });
  it("mut can be reassigned", () => {
    expect(out("let mut z = 1; z = 99; print(z);")).toBe("99");
  });
  it("immutable cannot be reassigned", () => {
    expect(err("let x = 1; x = 2;")).toMatch(/immutable/);
  });
  it("compound assign on mut", () => {
    expect(out("let mut a = 5; a += 3; print(a);")).toBe("8");
  });
  it("compound subtract on mut", () => {
    expect(out("let mut a = 10; a -= 4; print(a);")).toBe("6");
  });
});

describe("eval: closures", () => {
  it("closure captures outer variable", () => {
    expect(out(`
      let base = 10;
      let add = fn(x: int) -> int { x + base };
      print(add(5));
    `)).toBe("15");
  });
  it("closure mutates captured mut", () => {
    expect(out(`
      let mut counter = 0;
      let inc = fn() -> int { counter = counter + 1; counter };
      inc(); inc(); print(inc());
    `)).toBe("3");
  });
  it("nested closures", () => {
    expect(out(`
      let adder = fn(a: int) -> fn(int) -> int {
        fn(b: int) -> int { a + b }
      };
      let add5 = adder(5);
      print(add5(10));
    `)).toBe("15");
  });
});

describe("eval: recursion", () => {
  it("fib(10) = 55", () => {
    expect(out(`
      fn fib(n: int) -> int {
        if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
      }
      print(fib(10));
    `)).toBe("55");
  });
  it("factorial(5) = 120", () => {
    expect(out(`
      fn fact(n: int) -> int {
        if n <= 1 { 1 } else { n * fact(n - 1) }
      }
      print(fact(5));
    `)).toBe("120");
  });
});

describe("eval: pattern matching", () => {
  it("Option::Some unwraps", () => {
    expect(out(`
      enum Option<T> { Some(T), None }
      fn unwrap(o: Option<int>, d: int) -> int {
        match o {
          Option::Some(v) => v,
          Option::None => d,
        }
      }
      print(unwrap(Option::Some(42), 0));
    `)).toBe("42");
  });
  it("Option::None returns default", () => {
    expect(out(`
      enum Option<T> { Some(T), None }
      fn unwrap(o: Option<int>, d: int) -> int {
        match o {
          Option::Some(v) => v,
          Option::None => d,
        }
      }
      print(unwrap(Option::None, 7));
    `)).toBe("7");
  });
  it("Result::Err unwraps via match", () => {
    expect(out(`
      enum Result<T, E> { Ok(T), Err(E) }
      fn explain(r: Result<int, string>) -> string {
        match r {
          Result::Ok(n) => "ok",
          Result::Err(m) => m,
        }
      }
      print(explain(Result::Err("nope")));
    `)).toBe("nope");
  });
  it("wildcard matches anything", () => {
    expect(out(`
      fn f(n: int) -> int { match n { _ => 99 } }
      print(f(1));
    `)).toBe("99");
  });
  it("literal pattern", () => {
    expect(out(`
      fn f(n: int) -> int {
        match n { 0 => 100, 1 => 200, _ => 300 }
      }
      print(f(0)); print(f(1)); print(f(2));
    `)).toBe("100\n200\n300");
  });
  it("tuple pattern destructures", () => {
    expect(out(`
      fn f(p: (int, int)) -> int {
        match p { (a, b) => a + b }
      }
      print(f((3, 4)));
    `)).toBe("7");
  });
  it("array pattern with rest", () => {
    expect(out(`
      fn head(arr: [int]) -> int {
        match arr { [x, ..] => x }
      }
      print(head([10, 20, 30]));
    `)).toBe("10");
  });
  it("or pattern", () => {
    expect(out(`
      fn classify(n: int) -> int {
        match n { 0 | 1 | 2 => 1, _ => 0 }
      }
      print(classify(1)); print(classify(5));
    `)).toBe("1\n0");
  });
  it("guard via nested if", () => {
    expect(out(`
      fn sign(n: int) -> int {
        match n {
          _ => if n > 0 { 1 } else { if n < 0 { -1 } else { 0 } },
        }
      }
      print(sign(5)); print(sign(-3)); print(sign(0));
    `)).toBe("1\n-1\n0");
  });
});

describe("eval: structs", () => {
  it("construct + field access", () => {
    expect(out(`
      struct Point { x: int, y: int }
      let p = Point { x: 1, y: 2 };
      print(p.x + p.y);
    `)).toBe("3");
  });
  it("struct pattern match", () => {
    expect(out(`
      struct Point { x: int, y: int }
      fn sum(p: Point) -> int {
        match p { Point { x: a, y: b } => a + b }
      }
      print(sum(Point { x: 3, y: 4 }));
    `)).toBe("7");
  });
  it("struct spread (trailing)", () => {
    expect(out(`
      struct Point { x: int, y: int }
      let a = Point { x: 1, y: 2 };
      let b = Point { x: 5, ..a };
      print(b.x); print(b.y);
    `)).toBe("5\n2");
  });
});

describe("eval: enum variants", () => {
  it("construct + match with data", () => {
    expect(out(`
      enum Shape { Circle(int), Rect(int, int) }
      fn area(s: Shape) -> int {
        match s {
          Shape::Circle(r) => 3 * r * r,
          Shape::Rect(w, h) => w * h,
        }
      }
      print(area(Shape::Circle(2)));
      print(area(Shape::Rect(3, 4)));
    `)).toBe("12\n12");
  });
  it("unit variant", () => {
    expect(out(`
      enum Color { Red, Green, Blue }
      fn name(c: Color) -> int {
        match c { Color::Red => 1, Color::Green => 2, Color::Blue => 3 }
      }
      print(name(Color::Green));
    `)).toBe("2");
  });
});

describe("eval: arrays", () => {
  it("index access", () => { expect(out("let a = [10, 20, 30]; print(a[1]);")).toBe("20"); });
  it("len", () => { expect(out("let a = [1, 2, 3]; print(len(a));")).toBe("3"); });
  it("for-in over array", () => {
    expect(out(`
      let mut sum = 0;
      for x in [1, 2, 3, 4] { sum = sum + x; }
      print(sum);
    `)).toBe("10");
  });
  it("for-in over range", () => {
    expect(out(`
      let mut s = 0;
      for i in range(1, 5) { s = s + i; }
      print(s);
    `)).toBe("10"); // 1+2+3+4
  });
  it("array concatenation", () => {
    expect(out("let a = [1, 2] + [3, 4]; print(a[3]);")).toBe("4");
  });
});

describe("eval: maps", () => {
  it("construct + index", () => {
    expect(out(`
      let m = { "a": 1, "b": 2 };
      print(m["a"]); print(m["b"]);
    `)).toBe("1\n2");
  });
  it("len of map", () => {
    expect(out(`let m = { "x": 1, "y": 2 }; print(len(m));`)).toBe("2");
  });
});

describe("eval: string interpolation", () => {
  it("simple interpolation", () => {
    expect(out(`let name = "world"; print(f"hello, {name}!");`)).toBe("hello, world!");
  });
  it("interpolation of expression", () => {
    expect(out(`let x = 5; print(f"x = {x + 1}");`)).toBe("x = 6");
  });
  it("multiple interpolations", () => {
    expect(out(`let a = 1; let b = 2; print(f"{a} + {b} = {a + b}");`)).toBe("1 + 2 = 3");
  });
});

describe("eval: error propagation", () => {
  it("? on Ok unwraps", () => {
    expect(out(`
      enum Result<T, E> { Ok(T), Err(E) }
      fn read() -> Result<int, string> { Result::Ok(42) }
      fn caller() -> int { read()? }
      print(caller());
    `)).toBe("42");
  });
  it("? on Err propagates out of caller", () => {
    expect(out(`
      enum Result<T, E> { Ok(T), Err(E) }
      fn read() -> Result<int, string> { Result::Err("nope") }
      fn caller() -> Result<int, string> { let n = read()?; Result::Ok(n) }
      print(caller());
    `)).toContain("Err");
  });
});

describe("eval: panic", () => {
  it("panic throws runtime error", () => {
    const e = err(`panic("oh no");`);
    expect(e).toBe("oh no");
  });
  it("undefined name panics", () => {
    expect(err(`print(undefinedName);`)).toMatch(/undefined/);
  });
});

describe("eval: step limit", () => {
  it("infinite loop hits step limit", () => {
    const r = runRaw(`let mut i = 0; while true { i = i + 1; }`);
    expect(r.error?.message).toMatch(/step limit exceeded/);
  });
  it("step limit can be configured", () => {
    const { tokens } = lexWithErrors(`let mut i = 0; while true { i = i + 1; }`, "<t>");
    const { program } = parse(tokens, "<t>");
    const r = run(program, { maxSteps: 50 });
    expect(r.error?.message).toMatch(/step limit/);
    expect(r.steps).toBeLessThanOrEqual(60);
  });
});

describe("eval: builtins", () => {
  it("print works", () => { expect(out(`print("hello");`)).toBe("hello"); });
  it("len of string", () => { expect(out(`print(len("abc"));`)).toBe("3"); });
  it("str of int", () => { expect(out(`print(str(42));`)).toBe("42"); });
  it("int of string", () => { expect(out(`print(int("42") + 1);`)).toBe("43"); });
  it("map builtin with closure", () => {
    expect(out(`
      let nums = [1, 2, 3];
      let doubled = map(nums, fn(x: int) -> int { x * 2 });
      print(doubled[2]);
    `)).toBe("6");
  });
  it("filter builtin with closure", () => {
    expect(out(`
      let nums = [1, 2, 3, 4, 5];
      let evens = filter(nums, fn(x: int) -> bool { x % 2 == 0 });
      print(len(evens));
    `)).toBe("2");
  });
  it("reduce builtin with closure", () => {
    expect(out(`
      let nums = [1, 2, 3, 4];
      let sum = reduce(nums, fn(a: int, b: int) -> int { a + b }, 0);
      print(sum);
    `)).toBe("10");
  });
  it("range with one arg", () => {
    expect(out(`
      let mut s = 0;
      for i in range(4) { s = s + i; }
      print(s);
    `)).toBe("6"); // 0+1+2+3
  });
  it("range with three args (step)", () => {
    expect(out(`
      let mut s = 0;
      for i in range(1, 10, 2) { s = s + i; }
      print(s);
    `)).toBe("25"); // 1+3+5+7+9
  });
  it("type_of", () => {
    expect(out(`print(type_of(1));`)).toBe("int");
    expect(out(`print(type_of(1.5));`)).toBe("float");
    expect(out(`print(type_of("x"));`)).toBe("string");
    expect(out(`print(type_of(true));`)).toBe("bool");
  });
  it("assert passes", () => {
    expect(out(`assert(1 == 1); print("ok");`)).toBe("ok");
  });
  it("assert_eq passes", () => {
    expect(out(`assert_eq(2, 2); print("ok");`)).toBe("ok");
  });
  it("assert fails", () => {
    expect(err(`assert(false);`)).toMatch(/assertion failed/);
  });
  it("min / max / abs / sqrt", () => {
    expect(out(`print(min(3, 7));`)).toBe("3");
    expect(out(`print(max(3, 7));`)).toBe("7");
    expect(out(`print(abs(-5));`)).toBe("5");
    expect(out(`print((sqrt(4) as int));`)).toBe("2");
  });
});

describe("eval: control flow", () => {
  it("while loop", () => {
    expect(out(`
      let mut i = 0;
      let mut s = 0;
      while i < 5 { s = s + i; i = i + 1; }
      print(s);
    `)).toBe("10");
  });
  it("break out of while", () => {
    expect(out(`
      let mut i = 0;
      while true { if i >= 3 { break; }; i = i + 1; }
      print(i);
    `)).toBe("3");
  });
  it("continue in while", () => {
    expect(out(`
      let mut i = 0;
      let mut s = 0;
      while i < 5 {
        i = i + 1;
        if i == 3 { continue; };
        s = s + i;
      }
      print(s);
    `)).toBe("12"); // 1+2+4+5 = 12
  });
  it("if-else returns value", () => {
    expect(out(`let x = if true { 1 } else { 2 }; print(x);`)).toBe("1");
  });
  it("nested if-else-if", () => {
    expect(out(`
      fn g(n: int) -> int {
        if n < 0 { -1 } else { if n == 0 { 0 } else { 1 } }
      }
      print(g(-5)); print(g(0)); print(g(5));
    `)).toBe("-1\n0\n1");
  });
  it("return from function", () => {
    expect(out(`
      fn f() -> int { return 42; }
      print(f());
    `)).toBe("42");
  });
});

describe("eval: tuples", () => {
  it("tuple construct + tuple field access", () => {
    expect(out(`
      let p = (1, 2, 3);
      print(p.0); print(p.1); print(p.2);
    `)).toBe("1\n2\n3");
  });
  it("tuple pattern in let-style match", () => {
    expect(out(`
      fn fst(t: (int, int)) -> int { match t { (a, _) => a } }
      print(fst((99, 100)));
    `)).toBe("99");
  });
});

describe("eval: as cast", () => {
  it("int as float", () => { expect(out(`print((1 as float) + 0.5);`)).toBe("1.5"); });
  it("float as int truncates", () => { expect(out(`print((3.7 as int));`)).toBe("3"); });
  it("int as string", () => { expect(out(`print(42 as string);`)).toBe("42"); });
});
