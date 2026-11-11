/**
 * aether/core/parser/parser.test.ts
 * =================================
 * Comprehensive parser test suite — every grammar construct (positive +
 * negative), precedence, associativity, error messages, nested constructs,
 * generics, pattern matching, string interpolation, comments.
 */
import { describe, it, expect } from "vitest";
import { parseSource, parse } from "./parser";
import { lex } from "../lexer/lexer";
import { printAst } from "../ast/visitor";
import type { Program, Stmt, Expr, Block, FnDecl, Match, If } from "../ast/ast";

function expr(source: string): Expr {
  // wrap in `let _ = EXPR;` so we get back the EXPR
  const r = parseSource(`let _x_unused = ${source};`);
  if (r.errors.length > 0) throw new Error(`parse errors: ${r.errors.map(e => e.message).join("; ")}`);
  const stmt = r.program.body[0];
  if (!stmt || (stmt.kind !== "Let" && stmt.kind !== "MutLet" && stmt.kind !== "Const")) {
    throw new Error(`expected let, got ${stmt?.kind}`);
  }
  return (stmt as { init: Expr }).init;
}

function prog(source: string): Program {
  return parseSource(source).program;
}

function errs(source: string): { count: number; messages: string[] } {
  const r = parseSource(source);
  return { count: r.errors.length, messages: r.errors.map(e => e.message) };
}

describe("parser: literals", () => {
  it("parses int", () => {
    const e = expr("42");
    expect(e.kind).toBe("IntLit");
    expect((e as any).value).toBe(42);
  });
  it("parses float", () => {
    const e = expr("3.14");
    expect(e.kind).toBe("FloatLit");
  });
  it("parses hex", () => {
    const e = expr("0xFF");
    expect(e.kind).toBe("IntLit");
    expect((e as any).value).toBe(255);
  });
  it("parses binary", () => {
    const e = expr("0b1010");
    expect((e as any).value).toBe(10);
  });
  it("parses octal", () => {
    const e = expr("0o17");
    expect((e as any).value).toBe(15);
  });
  it("parses bool true/false", () => {
    expect(expr("true").kind).toBe("BoolLit");
    expect(expr("false").kind).toBe("BoolLit");
  });
  it("parses char", () => {
    const e = expr("'x'");
    expect(e.kind).toBe("CharLit");
    expect((e as any).value).toBe("x");
  });
  it("parses unit", () => {
    expect(expr("()").kind).toBe("UnitLit");
  });
  it("parses string", () => {
    const e = expr('"hello"');
    expect(e.kind).toBe("StringLit");
    expect((e as any).segments).toEqual([{ kind: "text", value: "hello" }]);
  });
  it("parses f-string with interpolation", () => {
    const e = expr('f"Hi {name}!"');
    expect(e.kind).toBe("StringLit");
    const segs = (e as any).segments;
    expect(segs.length).toBe(3);
    expect(segs[1].kind).toBe("interp");
    expect(segs[1].expr.kind).toBe("Ident");
  });
});

describe("parser: let/const/mut", () => {
  it("parses let", () => {
    const p = prog("let x = 1;");
    expect(p.body[0].kind).toBe("Let");
  });
  it("parses let with type", () => {
    const p = prog("let x: int = 1;");
    expect(p.body[0].kind).toBe("Let");
  });
  it("parses let mut", () => {
    const p = prog("let mut y: float = 3.14;");
    expect(p.body[0].kind).toBe("MutLet");
  });
  it("parses const", () => {
    const p = prog("const PI: float = 3.14159;");
    expect(p.body[0].kind).toBe("Const");
  });
  it("errors on missing semicolon", () => {
    expect(errs("let x = 1").count).toBeGreaterThan(0);
  });
});

describe("parser: function declarations", () => {
  it("parses simple fn", () => {
    const p = prog("fn add(a: int, b: int) -> int { a + b }");
    expect(p.body[0].kind).toBe("FnDecl");
  });
  it("captures params and return type", () => {
    const p = prog("fn f(a: int, b: float) -> bool { true }");
    const f = p.body[0] as FnDecl;
    expect(f.params.length).toBe(2);
    expect(f.ret?.kind).toBe("PrimitiveType");
  });
  it("parses generic fn", () => {
    const p = prog("fn id<T>(x: T) -> T { x }");
    const f = p.body[0] as FnDecl;
    expect(f.generics.length).toBe(1);
    expect(f.generics[0].name).toBe("T");
  });
  it("parses fn with generic constraint", () => {
    const p = prog("fn sort<T: Ord>(xs: [T]) -> [T] { xs }");
    const f = p.body[0] as FnDecl;
    expect(f.generics[0].constraint).toBe("Ord");
  });
  it("parses recursive fn (fib)", () => {
    const p = prog("fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }");
    expect(p.body[0].kind).toBe("FnDecl");
  });
  it("parses pub fn", () => {
    const p = prog("pub fn hi() -> int { 1 }");
    const f = p.body[0] as FnDecl;
    expect(f.exported).toBe(true);
  });
  it("parses void (unit) return type", () => {
    const p = prog("fn nope() { 1 }");
    const f = p.body[0] as FnDecl;
    expect(f.ret).toBeUndefined();
  });
});

describe("parser: enum declarations", () => {
  it("parses simple enum", () => {
    const p = prog("enum Color { Red, Green, Blue, }");
    expect(p.body[0].kind).toBe("EnumDecl");
    const e = p.body[0] as any;
    expect(e.variants.length).toBe(3);
    expect(e.variants[0].kind).toBe("unit");
  });
  it("parses enum with tuple variants", () => {
    const p = prog("enum Option<T> { Some(T), None, }");
    const e = p.body[0] as any;
    expect(e.generics.length).toBe(1);
    expect(e.variants[0].kind).toBe("tuple");
    expect(e.variants[0].types.length).toBe(1);
  });
  it("parses Result<T, E>", () => {
    const p = prog("enum Result<T, E> { Ok(T), Err(E), }");
    const e = p.body[0] as any;
    expect(e.generics.length).toBe(2);
    expect(e.variants.length).toBe(2);
  });
  it("parses enum with struct variant", () => {
    const p = prog("enum Msg { Quit, Move { x: int, y: int }, }");
    const e = p.body[0] as any;
    expect(e.variants[1].kind).toBe("struct");
    expect(e.variants[1].fields.length).toBe(2);
  });
});

describe("parser: struct declarations", () => {
  it("parses struct", () => {
    const p = prog("struct Point { x: int, y: int }");
    expect(p.body[0].kind).toBe("StructDecl");
    const s = p.body[0] as any;
    expect(s.fields.length).toBe(2);
  });
  it("parses generic struct", () => {
    const p = prog("struct Box<T> { value: T }");
    const s = p.body[0] as any;
    expect(s.generics[0].name).toBe("T");
  });
});

describe("parser: type alias", () => {
  it("parses type alias", () => {
    const p = prog("type Ints = [int];");
    expect(p.body[0].kind).toBe("TypeAlias");
  });
});

describe("parser: control flow", () => {
  it("parses if", () => {
    const e = expr("if x > 0 { 1 } else { 2 }");
    expect(e.kind).toBe("If");
  });
  it("parses if without else", () => {
    const e = expr("if x > 0 { 1 }");
    expect((e as If).else).toBeNull();
  });
  it("parses else if chain", () => {
    const e = expr("if x > 0 { 1 } else if x < 0 { 2 } else { 3 }");
    expect(e.kind).toBe("If");
    expect(((e as If).else as If).kind).toBe("If");
  });
  it("parses while", () => {
    const p = prog("while x > 0 { x = x - 1; }");
    expect(p.body[0].kind).toBe("While");
  });
  it("parses for-in with range", () => {
    const p = prog("for i in range(0, 10) { print(i); }");
    expect(p.body[0].kind).toBe("ForIn");
  });
  it("parses for-in with range expr", () => {
    const p = prog("for i in 0..10 { print(i); }");
    expect(p.body[0].kind).toBe("ForIn");
  });
  it("parses return", () => {
    const p = prog("fn f() -> int { return 42; }");
    const f = p.body[0] as FnDecl;
    expect((f.body as Block).stmts[0].kind).toBe("Return");
  });
  it("parses break/continue", () => {
    const p = prog("while true { break; continue; }");
    const w = p.body[0] as any;
    expect(w.body.stmts[0].kind).toBe("Break");
    expect(w.body.stmts[1].kind).toBe("Continue");
  });
});

describe("parser: match", () => {
  it("parses basic match", () => {
    const e = expr("match x { Option::Some(v) => v, Option::None => 0, }");
    expect(e.kind).toBe("Match");
    const m = e as Match;
    expect(m.arms.length).toBe(2);
    expect(m.arms[0].pattern.kind).toBe("EnumPat");
  });
  it("parses match with guard", () => {
    const e = expr("match x { n if n > 0 => 1, _ => 0, }");
    const m = e as Match;
    expect(m.arms[0].guard).not.toBeNull();
  });
  it("parses match with or-pattern", () => {
    const e = expr("match x { 1 | 2 | 3 => 0, _ => 1, }");
    const m = e as Match;
    expect(m.arms[0].pattern.kind).toBe("OrPat");
  });
  it("parses match with wildcard", () => {
    const e = expr("match x { _ => 0, }");
    const m = e as Match;
    expect(m.arms[0].pattern.kind).toBe("WildcardPat");
  });
  it("parses match with struct pattern", () => {
    const e = expr("match p { Point { x: a, y: b } => a, }");
    const m = e as Match;
    expect(m.arms[0].pattern.kind).toBe("StructPat");
  });
});

describe("parser: expressions and precedence", () => {
  it("parses binary with correct precedence (+/*)", () => {
    const e = expr("1 + 2 * 3");
    // should be 1 + (2*3)
    expect(e.kind).toBe("Binary");
    expect((e as any).op).toBe("+");
    expect((e as any).right.kind).toBe("Binary");
    expect((e as any).right.op).toBe("*");
  });
  it("parses left-assoc +", () => {
    const e = expr("1 + 2 + 3");
    expect(e.kind).toBe("Binary");
    expect((e as any).left.kind).toBe("Binary");
    expect((e as any).left.op).toBe("+");
  });
  it("parses || lower than &&", () => {
    const e = expr("a && b || c");
    expect((e as any).op).toBe("||");
    expect((e as any).left.kind).toBe("Binary");
  });
  it("parses comparison precedence", () => {
    const e = expr("a < b == c");
    expect((e as any).op).toBe("==");
    expect((e as any).left.op).toBe("<");
  });
  it("parses unary minus", () => {
    const e = expr("-x");
    expect(e.kind).toBe("Unary");
    expect((e as any).op).toBe("-");
  });
  it("parses unary not", () => {
    const e = expr("!flag");
    expect(e.kind).toBe("Unary");
    expect((e as any).op).toBe("!");
  });
  it("parses postfix call", () => {
    const e = expr("f(1, 2)");
    expect(e.kind).toBe("Call");
  });
  it("parses method call", () => {
    const e = expr("x.foo(1, 2)");
    expect(e.kind).toBe("MethodCall");
  });
  it("parses field access", () => {
    const e = expr("x.foo");
    expect(e.kind).toBe("Field");
  });
  it("parses index", () => {
    const e = expr("x[0]");
    expect(e.kind).toBe("Index");
  });
  it("parses nested postfix", () => {
    const e = expr("a.b.c[0].d()");
    expect(e.kind).toBe("MethodCall");
  });
  it("parses tuple", () => {
    const e = expr("(1, 2, 3)");
    expect(e.kind).toBe("TupleExpr");
  });
  it("parses paren expr", () => {
    const e = expr("(1 + 2)");
    expect(e.kind).toBe("Paren");
  });
  it("parses array", () => {
    const e = expr("[1, 2, 3]");
    expect(e.kind).toBe("ArrayExpr");
  });
  it("parses map literal", () => {
    const e = expr('{ "a": 1, "b": 2 }');
    expect(e.kind).toBe("MapExpr");
  });
  it("parses block expr with trailing", () => {
    const e = expr("{ let x = 1; x }");
    expect(e.kind).toBe("Block");
    expect((e as Block).stmts.length).toBe(1);
    expect((e as Block).expr).not.toBeNull();
  });
  it("parses block expr without trailing", () => {
    const e = expr("{ let x = 1; }");
    expect(e.kind).toBe("Block");
    expect((e as Block).expr).toBeNull();
  });
  it("parses range", () => {
    const e = expr("0..10");
    expect(e.kind).toBe("Range");
    expect((e as any).inclusive).toBe(false);
  });
  it("parses inclusive range", () => {
    const e = expr("0..=10");
    expect((e as any).inclusive).toBe(true);
  });
  it("parses cast (as)", () => {
    const e = expr("x as float");
    expect(e.kind).toBe("As");
  });
  it("parses error propagation ?", () => {
    const e = expr("foo?");
    expect(e.kind).toBe("ErrorProp");
  });
  it("parses lambda", () => {
    const e = expr("fn(x: int) -> int { x * 2 }");
    expect(e.kind).toBe("Lambda");
  });
  it("parses enum variant construction", () => {
    const e = expr("Option::Some(42)");
    expect(e.kind).toBe("EnumVariant");
  });
  it("parses unit variant", () => {
    const e = expr("Option::None");
    expect(e.kind).toBe("EnumVariant");
    expect((e as any).args.length).toBe(0);
  });
  it("parses struct literal", () => {
    const e = expr("Point { x: 1, y: 2 }");
    expect(e.kind).toBe("StructExpr");
  });
  it("parses tuple field access", () => {
    const e = expr("pair.0");
    expect(e.kind).toBe("TupleField");
    expect((e as any).index).toBe(0);
  });
  it("parses or operator", () => {
    const e = expr("a or b");
    expect(e.kind).toBe("Binary");
    // `or` is parsed as its own op (Python-style short-circuit that returns
    // the LHS value if truthy, else the RHS), distinct from the boolean `||`.
    expect((e as any).op).toBe("or");
  });
  it("parses return as expression", () => {
    const e = expr("return 42");
    expect(e.kind).toBe("Return");
  });
  it("parses or return short-circuit", () => {
    const e = expr('read_file("x") or return Result::Err("missing")');
    expect(e.kind).toBe("Binary");
    expect((e as any).op).toBe("or");
    expect((e as any).right.kind).toBe("Return");
  });
});

describe("parser: types", () => {
  it("parses primitive types", () => {
    expect(prog("let x: int = 1;").body[0].kind).toBe("Let");
    expect(prog("let x: float = 1.0;").body[0].kind).toBe("Let");
    expect(prog("let x: bool = true;").body[0].kind).toBe("Let");
    expect(prog("let x: string = \"a\";").body[0].kind).toBe("Let");
  });
  it("parses unit type", () => {
    const p = prog("let x: () = ();");
    expect((p.body[0] as any).type.kind).toBe("UnitType");
  });
  it("parses array type", () => {
    const p = prog("let x: [int] = [1];");
    expect((p.body[0] as any).type.kind).toBe("ArrayType");
  });
  it("parses tuple type", () => {
    const p = prog("let x: (int, float) = (1, 1.0);");
    expect((p.body[0] as any).type.kind).toBe("TupleType");
  });
  it("parses map type", () => {
    const p = prog("let x: map[string]int = {};") ;
    expect((p.body[0] as any).type.kind).toBe("MapType");
  });
  it("parses option type", () => {
    const p = prog("let x: option<int> = Option::None;");
    expect((p.body[0] as any).type.kind).toBe("OptionType");
  });
  it("parses result type", () => {
    const p = prog("let x: result<int, string> = Result::Ok(1);");
    expect((p.body[0] as any).type.kind).toBe("ResultType");
  });
  it("parses func type", () => {
    const p = prog("let x: fn(int) -> int = fn(x: int) -> int { x };");
    expect((p.body[0] as any).type.kind).toBe("FuncType");
  });
  it("parses named type", () => {
    const p = prog("let x: Foo = bar;");
    expect((p.body[0] as any).type.kind).toBe("NamedType");
  });
  it("parses generic type", () => {
    const p = prog("let x: Vec<int> = bar;");
    expect((p.body[0] as any).type.kind).toBe("GenericType");
  });
});

describe("parser: comments", () => {
  it("ignores line comments", () => {
    const p = prog("// hi\nlet x = 1;");
    expect(p.body[0].kind).toBe("Let");
  });
  it("ignores block comments", () => {
    const p = prog("/* hi */ let x = 1; /* tail */");
    expect(p.body[0].kind).toBe("Let");
  });
  it("handles comments between statements", () => {
    const p = prog("let x = 1;\n// comment\nlet y = 2;");
    expect(p.body.length).toBe(2);
  });
});

describe("parser: error recovery", () => {
  it("records missing semicolon", () => {
    expect(errs("let x = 1 let y = 2;").count).toBeGreaterThan(0);
  });
  it("continues parsing after error", () => {
    const r = parseSource("let x = 1 let y = 2;");
    expect(r.program.body.length).toBeGreaterThanOrEqual(1);
  });
  it("errors on missing closing brace", () => {
    expect(errs("fn f() -> int { 1").count).toBeGreaterThan(0);
  });
  it("errors on unclosed paren in call", () => {
    expect(errs("f(1,").count).toBeGreaterThan(0);
  });
});

describe("parser: nested constructs", () => {
  it("parses nested match in if", () => {
    const e = expr("if x > 0 { match y { _ => 1, } } else { 2 }");
    expect((e as If).then.kind).toBe("Block");
  });
  it("parses nested lambdas", () => {
    const e = expr("fn(x: int) -> fn() -> int { fn() -> int { x } }");
    expect(e.kind).toBe("Lambda");
  });
  it("parses deep binary nesting", () => {
    const e = expr("1 + 2 + 3 + 4 + 5");
    expect(e.kind).toBe("Binary");
  });
  it("parses block with multiple statements and trailing expr", () => {
    const e = expr("{ let a = 1; let b = 2; a + b }");
    expect(e.kind).toBe("Block");
    const b = e as Block;
    expect(b.stmts.length).toBe(2);
    expect(b.expr).not.toBeNull();
  });
});

describe("parser: print and import", () => {
  it("parses print statement", () => {
    const p = prog('print("hello");');
    expect(p.body[0].kind).toBe("Print");
  });
  it("parses import statement (parsed only)", () => {
    const p = prog('import "foo.ae" { bar };');
    expect(p.body[0].kind).toBe("Import");
    const i = p.body[0] as any;
    expect(i.path).toBe("foo.ae");
    expect(i.names).toEqual(["bar"]);
  });
});

describe("parser: AST round-trip via printAst", () => {
  it("fib round-trips cleanly", () => {
    const src = "fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }";
    const r = parseSource(src);
    expect(r.errors.length).toBe(0);
    const printed = printAst(r.program);
    expect(printed).toContain("fn fib");
    expect(printed).toContain("if n < 2");
  });
  it("enum round-trips", () => {
    const src = "enum Option<T> { Some(T), None, }";
    const r = parseSource(src);
    expect(r.errors.length).toBe(0);
    expect(printAst(r.program)).toContain("enum Option<T>");
  });
  it("match round-trips", () => {
    const src = "fn u(o: Option<int>) -> int { match o { Option::Some(v) => v, Option::None => 0, } }";
    const r = parseSource(src);
    expect(r.errors.length).toBe(0);
    expect(printAst(r.program)).toContain("match");
  });
});

describe("parser: associativity regression", () => {
  it("subtraction is left-associative", () => {
    const e = expr("10 - 2 - 1");
    // (10 - 2) - 1
    expect((e as any).left.kind).toBe("Binary");
    expect((e as any).left.left.value).toBe(10);
    expect((e as any).left.right.value).toBe(2);
    expect((e as any).right.value).toBe(1);
  });
  it("division is left-associative", () => {
    const e = expr("100 / 5 / 2");
    expect((e as any).left.kind).toBe("Binary");
  });
  it("as binds tighter than +", () => {
    const e = expr("1 + x as int");
    // 1 + (x as int)
    expect((e as any).op).toBe("+");
    expect((e as any).right.kind).toBe("As");
  });
  it("? binds tighter than +", () => {
    const e = expr("x? + 1");
    expect((e as any).op).toBe("+");
    expect((e as any).left.kind).toBe("ErrorProp");
  });
});

describe("parser: parse(tokens) entry point", () => {
  it("accepts pre-lexed tokens", () => {
    const tokens = lex("let x = 1;");
    const r = parse(tokens);
    expect(r.errors.length).toBe(0);
    expect(r.program.body[0].kind).toBe("Let");
  });
});
