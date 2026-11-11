/**
 * aether/tools/formatter/formatter.test.ts
 * ==========================================
 * Test suite for the Aether formatter.
 *
 * Coverage:
 *   - Each language construct formats correctly (~45 cases).
 *   - Comment preservation: leading, trailing, own-line, block.
 *   - Config options: indent, lineWidth, trailingComma.
 *   - Idempotency on all 15 example .ae files.
 *   - Idempotency on 50 generated random-ish inputs.
 *   - Edge cases: empty input, whitespace-only, comment-only.
 *
 * Total: 100+ test cases.
 */
import { describe, it, expect } from "vitest";
import { format, extractComments, FormatOptions } from "./formatter";
import * as fs from "fs";
import * as path from "path";

const EXAMPLES_DIR = "/home/z/my-project/examples";

// ----- helper: idempotency assertion -----
function idempotent(src: string, opts?: FormatOptions): void {
  const once = format(src, opts);
  const twice = format(once, opts);
  expect(twice).toBe(once);
}

// ----- helper: parse-and-compare -----
function formatsTo(src: string, expected: string, opts?: FormatOptions): void {
  const got = format(src, opts);
  expect(got).toBe(expected);
}

//-----------------------------------------------------------------------------
// 1. Statements / declarations
//-----------------------------------------------------------------------------
describe("formatter: statements", () => {
  it("let with int", () => {
    formatsTo("let x = 1;", "let x = 1;\n");
  });
  it("let with type annotation", () => {
    formatsTo("let x:int=1;", "let x: int = 1;\n");
  });
  it("let mut with type", () => {
    formatsTo("let  mut   y : int = 5 ;", "let mut y: int = 5;\n");
  });
  it("const with type", () => {
    formatsTo("const MAX:int=100;", "const MAX: int = 100;\n");
  });
  it("let preserves f-string", () => {
    formatsTo('let s = f"x={x}";', 'let s = f"x={x}";\n');
  });
  it("expr stmt", () => {
    formatsTo("foo();", "foo();\n");
  });
  it("assign stmt", () => {
    formatsTo("x = 5;", "x = 5;\n");
  });
  it("compound assign", () => {
    formatsTo("x += 1;", "x += 1;\n");
    formatsTo("x -= 1;", "x -= 1;\n");
    formatsTo("x *= 2;", "x *= 2;\n");
  });
  it("return with value", () => {
    formatsTo("return 42;", "return 42;\n");
  });
  it("return bare", () => {
    formatsTo("return;", "return;\n");
  });
  it("break", () => {
    formatsTo("break;", "break;\n");
  });
  it("continue", () => {
    formatsTo("continue;", "continue;\n");
  });
  it("print", () => {
    formatsTo('print("hi");', 'print("hi");\n');
  });
  it("import with names", () => {
    formatsTo('import "foo" { a, b };', 'import "foo" { a, b };\n');
  });
  it("import no names", () => {
    formatsTo('import "foo";', 'import "foo";\n');
  });
  it("type alias", () => {
    formatsTo("type IntList = [int];", "type IntList = [int];\n");
  });
  it("type alias with generics", () => {
    formatsTo("type Result<T> = result<T, string>;", "type Result<T> = result<T, string>;\n");
  });
});

//-----------------------------------------------------------------------------
// 2. Function declarations
//-----------------------------------------------------------------------------
describe("formatter: functions", () => {
  it("empty fn", () => {
    formatsTo("fn f() { }", "fn f() { }\n");
  });
  it("fn with params", () => {
    formatsTo("fn add(a:int,b:int)->int { a + b }", "fn add(a: int, b: int) -> int { a + b }\n");
  });
  it("fn with multi-line body", () => {
    const src = "fn f(n: int) -> int { let a = 1; let b = 2; a + b }";
    const expected =
      "fn f(n: int) -> int {\n" +
      "  let a = 1;\n" +
      "  let b = 2;\n" +
      "  a + b\n" +
      "}\n";
    formatsTo(src, expected);
  });
  it("pub fn", () => {
    formatsTo("pub fn g() { 1 }", "pub fn g() { 1 }\n");
  });
  it("fn with generics", () => {
    formatsTo("fn id<T>(x: T) -> T { x }", "fn id<T>(x: T) -> T { x }\n");
  });
  it("fn with generic constraint", () => {
    formatsTo("fn sort<T: Ord>(xs: [T]) -> [T] { xs }", "fn sort<T: Ord>(xs: [T]) -> [T] { xs }\n");
  });
  it("nested fn in body", () => {
    const src = "fn outer() { fn inner() { 1 } inner() }";
    const expected =
      "fn outer() {\n" +
      "  fn inner() { 1 }\n" +
      "  inner()\n" +
      "}\n";
    formatsTo(src, expected);
  });
});

//-----------------------------------------------------------------------------
// 3. Control flow
//-----------------------------------------------------------------------------
describe("formatter: control flow", () => {
  it("if-expr single-line", () => {
    formatsTo("let z = if x { 1 } else { 2 };", "let z = if x { 1 } else { 2 };\n");
  });
  it("if-expr at top-level wraps in ExprStmt", () => {
    formatsTo("if x { 1 } else { 2 };", "if x { 1 } else { 2 };\n");
  });
  it("if-expr multi-line", () => {
    const src = "if x { let y = 1; y } else { 2 }";
    const expected =
      "if x {\n" +
      "  let y = 1;\n" +
      "  y\n" +
      "} else { 2 };\n";
    formatsTo(src, expected);
  });
  it("else-if chain", () => {
    formatsTo("let z = if a { 1 } else if b { 2 } else { 3 };", "let z = if a { 1 } else if b { 2 } else { 3 };\n");
  });
  it("else-if multi-line", () => {
    const src = "if long_condition_here { let x = 1; x } else if other { 2 } else { 3 }";
    const out = format(src);
    // The then-branch has stmts so it must be multi-line. The else-if's
    // then-branch (`{ 2 }`) also goes multi-line in an else-if chain. The
    // trailing else branch (`{ 3 }`) stays single-line because it fits.
    expect(out).toContain("} else if other {");
    expect(out).toContain("  2");
    expect(out).toContain("} else { 3 }");
  });
  it("while loop", () => {
    const src = "while x < 10 { x = x + 1 }";
    formatsTo(src, "while x < 10 {\n  x = x + 1;\n}\n");
  });
  it("while single-line body", () => {
    formatsTo("while c { 1 }", "while c { 1 }\n");
  });
  it("for-in range", () => {
    formatsTo("for i in range(0, 10) { print(i) }", "for i in range(0, 10) {\n  print(i);\n}\n");
  });
  it("for-in array", () => {
    formatsTo("for x in xs { print(x) }", "for x in xs {\n  print(x);\n}\n");
  });
  it("for-in single-line body", () => {
    formatsTo("for x in xs { 1 }", "for x in xs { 1 }\n");
  });
  it("match two arms single-line bodies", () => {
    const src = "let z = match x { A => 1, B => 2 };";
    const expected =
      "let z = match x {\n" +
      "  A => 1,\n" +
      "  B => 2,\n" +
      "};\n";
    formatsTo(src, expected);
  });
  it("match with block arm", () => {
    const src = "let z = match x { A => { let y = 1; y }, B => 2 };";
    const expected =
      "let z = match x {\n" +
      "  A => {\n" +
      "    let y = 1;\n" +
      "    y\n" +
      "  },\n" +
      "  B => 2,\n" +
      "};\n";
    formatsTo(src, expected);
  });
  it("match with enum pattern", () => {
    const src = "match t { Tree::Leaf => 0, Tree::Node(_, l, r) => 1 }";
    const out = format(src);
    expect(out).toContain("Tree::Leaf => 0,");
    expect(out).toContain("Tree::Node(_, l, r) => 1,");
  });
  it("match with guard", () => {
    const src = "match x { y if y > 0 => 1, _ => 0 }";
    const out = format(src);
    expect(out).toContain("y if y > 0 => 1,");
    expect(out).toContain("_ => 0,");
  });
  it("block statement", () => {
    // `{ ... }` parses as a Block expression at top level; the formatter
    // wraps it in an ExprStmt with a trailing `;`.
    const src = "{ let x = 1; print(x); }";
    const expected = "{\n  let x = 1;\n  print(x);\n};\n";
    formatsTo(src, expected);
  });
});

//-----------------------------------------------------------------------------
// 4. Expressions
//-----------------------------------------------------------------------------
describe("formatter: expressions", () => {
  it("binary ops with spaces", () => {
    formatsTo("1+2*3;", "1 + 2 * 3;\n");
  });
  it("binary preserves right-assoc parens", () => {
    // `a - (b - c)` parses as Binary(-, a, Binary(-, b, c))
    // The formatter should add parens to preserve grouping.
    formatsTo("a - (b - c);", "a - (b - c);\n");
  });
  it("paren preserved", () => {
    formatsTo("(1 + 2) * 3;", "(1 + 2) * 3;\n");
  });
  it("unary minus no space", () => {
    formatsTo("-x;", "-x;\n");
  });
  it("unary not", () => {
    formatsTo("!flag;", "!flag;\n");
  });
  it("call", () => {
    formatsTo("foo(1, 2, 3);", "foo(1, 2, 3);\n");
  });
  it("nested call", () => {
    formatsTo("f(g(1), h(2));", "f(g(1), h(2));\n");
  });
  it("method call", () => {
    formatsTo("xs.push(1);", "xs.push(1);\n");
  });
  it("field access", () => {
    formatsTo("p.x;", "p.x;\n");
  });
  it("tuple field", () => {
    formatsTo("t.0;", "t.0;\n");
  });
  it("index", () => {
    formatsTo("arr[0];", "arr[0];\n");
  });
  it("nested index", () => {
    formatsTo("m[i][j];", "m[i][j];\n");
  });
  it("range", () => {
    formatsTo("1..10;", "1..10;\n");
  });
  it("inclusive range", () => {
    formatsTo("1..=10;", "1..=10;\n");
  });
  it("as cast", () => {
    formatsTo("x as int;", "x as int;\n");
  });
  it("error prop", () => {
    formatsTo("foo()?;", "foo()?;\n");
  });
  it("self expr", () => {
    formatsTo("self.x;", "self.x;\n");
  });
  it("spread", () => {
    // Spread is only meaningful inside struct / array literals; in call
    // args the parser doesn't accept `...x`.  We test spread via struct expr.
    formatsTo("let p = Point { x: 1, ..base };", "let p = Point { x: 1, ..base };\n");
  });
  it("return in expr position", () => {
    formatsTo("let x = return 5;", "let x = return 5;\n");
  });
  it("bool literal", () => {
    formatsTo("let b = true;", "let b = true;\n");
    formatsTo("let b = false;", "let b = false;\n");
  });
  it("unit literal", () => {
    formatsTo("let u = ();", "let u = ();\n");
  });
  it("char literal", () => {
    formatsTo("let c = 'a';", "let c = 'a';\n");
  });
  it("char literal escaped", () => {
    formatsTo("let c = '\\n';", "let c = '\\n';\n");
  });
  it("string literal", () => {
    formatsTo('let s = "hello";', 'let s = "hello";\n');
  });
  it("string literal escapes", () => {
    formatsTo('let s = "a\\nb";', 'let s = "a\\nb";\n');
  });
  it("f-string interpolation", () => {
    formatsTo('let s = f"{x}";', 'let s = f"{x}";\n');
  });
  it("f-string with text and interp", () => {
    formatsTo('let s = f"v={x}!";', 'let s = f"v={x}!";\n');
  });
  it("lambda short", () => {
    formatsTo("let f = fn(x: int) -> int { x + 1 };", "let f = fn(x: int) -> int { x + 1 };\n");
  });
  it("lambda multi-line body", () => {
    const src = "let f = fn(x: int) -> int { let y = x + 1; y };";
    const expected =
      "let f = fn(x: int) -> int {\n" +
      "  let y = x + 1;\n" +
      "  y\n" +
      "};\n";
    formatsTo(src, expected);
  });
  it("enum variant", () => {
    formatsTo("let v = Color::Red;", "let v = Color::Red;\n");
  });
  it("enum variant with args", () => {
    formatsTo("let v = Some(5);", "let v = Some(5);\n");
  });
  it("tuple expr", () => {
    formatsTo("let t = (1, 2);", "let t = (1, 2);\n");
  });
  it("single-element tuple", () => {
    formatsTo("let t = (1,);", "let t = (1,);\n");
  });
  it("array expr", () => {
    formatsTo("let a = [1, 2, 3];", "let a = [1, 2, 3];\n");
  });
  it("empty array", () => {
    formatsTo("let a = [];", "let a = [];\n");
  });
  it("map expr", () => {
    formatsTo('let m = { "a": 1, "b": 2 };', 'let m = {"a": 1, "b": 2};\n');
  });
  it("empty map", () => {
    // Empty `{}` is parsed as a Block (parser ambiguity), so the formatter
    // emits it as `{ }` (empty block).
    formatsTo("let m = {};", "let m = { };\n");
  });
  it("struct expr", () => {
    formatsTo("let p = Point { x: 1, y: 2 };", "let p = Point { x: 1, y: 2 };\n");
  });
  it("struct expr empty", () => {
    formatsTo("let p = Empty { };", "let p = Empty { };\n");
  });
  it("struct expr with spread", () => {
    formatsTo("let p = Point { x: 1, ..base };", "let p = Point { x: 1, ..base };\n");
  });
});

//-----------------------------------------------------------------------------
// 5. Types
//-----------------------------------------------------------------------------
describe("formatter: types", () => {
  it("named type", () => {
    formatsTo("let x: Foo = bar;", "let x: Foo = bar;\n");
  });
  it("primitive types", () => {
    formatsTo("let x: int = 1;", "let x: int = 1;\n");
    formatsTo("let x: string = \"a\";", "let x: string = \"a\";\n");
  });
  it("array type", () => {
    formatsTo("let x: [int] = [];", "let x: [int] = [];\n");
  });
  it("nested array type", () => {
    formatsTo("let x: [[int]] = [];", "let x: [[int]] = [];\n");
  });
  it("map type", () => {
    // Empty `{}` parses as Block; the formatter outputs `{ }`.
    formatsTo("let x: map[string]int = {};", "let x: map[string] int = { };\n");
  });
  it("option type", () => {
    formatsTo("let x: option<int> = none;", "let x: option<int> = none;\n");
  });
  it("result type", () => {
    formatsTo("let x: result<int, string> = foo();", "let x: result<int, string> = foo();\n");
  });
  it("tuple type", () => {
    formatsTo("let x: (int, string) = (1, \"a\");", "let x: (int, string) = (1, \"a\");\n");
  });
  it("func type", () => {
    formatsTo("let f: fn(int) -> int = g;", "let f: fn(int) -> int = g;\n");
  });
  it("unit type", () => {
    formatsTo("fn f() -> () { }", "fn f() -> () { }\n");
  });
  it("generic type", () => {
    formatsTo("let x: List<int> = xs;", "let x: List<int> = xs;\n");
  });
});

//-----------------------------------------------------------------------------
// 6. Patterns
//-----------------------------------------------------------------------------
describe("formatter: patterns", () => {
  it("wildcard pat", () => {
    const src = "let z = match x { _ => 0 };";
    formatsTo(src, "let z = match x {\n  _ => 0,\n};\n");
  });
  it("bind pat", () => {
    const src = "let z = match x { y => 0 };";
    formatsTo(src, "let z = match x {\n  y => 0,\n};\n");
  });
  it("mut bind pat", () => {
    const src = "let z = match x { mut y => 0 };";
    formatsTo(src, "let z = match x {\n  mut y => 0,\n};\n");
  });
  it("bind pat with type", () => {
    const src = "let z = match x { y: int => 0 };";
    formatsTo(src, "let z = match x {\n  y: int => 0,\n};\n");
  });
  it("tuple pat", () => {
    const src = "let z = match x { (a, b) => 0 };";
    formatsTo(src, "let z = match x {\n  (a, b) => 0,\n};\n");
  });
  it("array pat", () => {
    const src = "let z = match x { [a, b] => 0 };";
    formatsTo(src, "let z = match x {\n  [a, b] => 0,\n};\n");
  });
  it("struct pat", () => {
    const src = "match x { P { a: 1, b: 2 } => 0 }";
    const out = format(src);
    expect(out).toContain("P { a: 1, b: 2 } => 0,");
  });
  it("enum pat", () => {
    const src = "let z = match x { E::A(a) => 0 };";
    formatsTo(src, "let z = match x {\n  E::A(a) => 0,\n};\n");
  });
  it("or pat", () => {
    const src = "let z = match x { 1 | 2 => 0 };";
    formatsTo(src, "let z = match x {\n  1 | 2 => 0,\n};\n");
  });
  it("rest pat", () => {
    const src = "match x { P { a: 1, .. } => 0 }";
    const out = format(src);
    expect(out).toContain("P { a: 1, .. } => 0,");
  });
  it("literal pat int", () => {
    const src = "let z = match x { 42 => 0 };";
    formatsTo(src, "let z = match x {\n  42 => 0,\n};\n");
  });
  it("literal pat string", () => {
    const src = 'let z = match x { "a" => 0 };';
    formatsTo(src, "let z = match x {\n  \"a\" => 0,\n};\n");
  });
});

//-----------------------------------------------------------------------------
// 7. Enums and structs
//-----------------------------------------------------------------------------
describe("formatter: enums and structs", () => {
  it("enum with unit variants", () => {
    const src = "enum Color { Red, Green, Blue }";
    const expected =
      "enum Color {\n" +
      "  Red,\n" +
      "  Green,\n" +
      "  Blue,\n" +
      "}\n";
    formatsTo(src, expected);
  });
  it("enum with tuple variants", () => {
    const src = "enum Tree { Node(int, Tree, Tree), Leaf }";
    const expected =
      "enum Tree {\n" +
      "  Node(int, Tree, Tree),\n" +
      "  Leaf,\n" +
      "}\n";
    formatsTo(src, expected);
  });
  it("enum with struct variant", () => {
    const src = "enum E { A { x: int, y: int }, B }";
    const expected =
      "enum E {\n" +
      "  A { x: int, y: int },\n" +
      "  B,\n" +
      "}\n";
    formatsTo(src, expected);
  });
  it("enum with generics", () => {
    const src = "enum Result<T, E> { Ok(T), Err(E) }";
    const expected =
      "enum Result<T, E> {\n" +
      "  Ok(T),\n" +
      "  Err(E),\n" +
      "}\n";
    formatsTo(src, expected);
  });
  it("struct decl", () => {
    const src = "struct P { x: int, y: int }";
    const expected =
      "struct P {\n" +
      "  x: int,\n" +
      "  y: int,\n" +
      "}\n";
    formatsTo(src, expected);
  });
  it("empty struct decl", () => {
    formatsTo("struct Empty { }", "struct Empty { }\n");
  });
  it("struct with generics", () => {
    const src = "struct Pair<T> { a: T, b: T }";
    const out = format(src);
    expect(out).toContain("struct Pair<T> {");
    expect(out).toContain("  a: T,");
    expect(out).toContain("  b: T,");
  });
});

//-----------------------------------------------------------------------------
// 8. Comments
//-----------------------------------------------------------------------------
describe("formatter: comments", () => {
  it("leading line comment", () => {
    formatsTo("// hello\nlet x = 1;", "// hello\nlet x = 1;\n");
  });
  it("trailing line comment", () => {
    formatsTo("let x = 1; // hello", "let x = 1; // hello\n");
  });
  it("block comment own-line", () => {
    formatsTo("/* hello */\nlet x = 1;", "/* hello */\nlet x = 1;\n");
  });
  it("block comment trailing", () => {
    formatsTo("let x = 1; /* hi */", "let x = 1; /* hi */\n");
  });
  it("multiple leading comments", () => {
    formatsTo(
      "// a\n// b\nlet x = 1;",
      "// a\n// b\nlet x = 1;\n",
    );
  });
  it("comment inside block", () => {
    const src = "fn f() {\n  // hello\n  let x = 1;\n}";
    const expected =
      "fn f() {\n" +
      "  // hello\n" +
      "  let x = 1;\n" +
      "}\n";
    formatsTo(src, expected);
  });
  it("trailing comment inside block", () => {
    const src = "fn f() {\n  let x = 1; // hi\n}";
    const expected =
      "fn f() {\n" +
      "  let x = 1; // hi\n" +
      "}\n";
    formatsTo(src, expected);
  });
  it("comment before closing brace", () => {
    const src = "fn f() {\n  let x = 1;\n  // bye\n}";
    const expected =
      "fn f() {\n" +
      "  let x = 1;\n" +
      "  // bye\n" +
      "}\n";
    formatsTo(src, expected);
  });
  it("comment only file", () => {
    formatsTo("// just a comment", "// just a comment\n");
  });
  it("separator-style comments preserved", () => {
    const src = "// --- 1. Naive ---\nfn f() { 1 }";
    formatsTo(src, "// --- 1. Naive ---\nfn f() { 1 }\n");
  });
  it("extractComments classifies ownLine", () => {
    const cs = extractComments("let x = 1; // trailing\n// own\n");
    expect(cs.length).toBe(2);
    expect(cs[0].ownLine).toBe(false);
    expect(cs[1].ownLine).toBe(true);
  });
});

//-----------------------------------------------------------------------------
// 9. Config options
//-----------------------------------------------------------------------------
describe("formatter: config options", () => {
  it("indent: 4", () => {
    const src = "fn f() { let x = 1; }";
    const expected =
      "fn f() {\n" +
      "    let x = 1;\n" +
      "}\n";
    formatsTo(src, expected, { indent: 4 });
  });
  it("indent: 8", () => {
    const src = "fn f() { let x = 1; }";
    const expected =
      "fn f() {\n" +
      "        let x = 1;\n" +
      "}\n";
    formatsTo(src, expected, { indent: 8 });
  });
  it("trailingComma: false in array", () => {
    const long = "let a = [" + Array.from({ length: 20 }, (_, i) => i).join(", ") + "];";
    const out = format(long, { trailingComma: false, lineWidth: 30 });
    // Last element should not have a trailing comma.
    expect(out).not.toMatch(/19,\n\]/);
    // And the array must end with `]` (followed by the trailing `;`).
    expect(out).toMatch(/\];\n$/);
  });
  it("trailingComma: true (default) in array", () => {
    const long = "let a = [" + Array.from({ length: 20 }, (_, i) => i).join(", ") + "];";
    const out = format(long, { lineWidth: 30 });
    // Trailing comma after the last element.
    expect(out).toMatch(/19,\n\];\n$/);
  });
  it("trailingComma: false in struct decl", () => {
    const src = "struct P { x: int, y: int }";
    const out = format(src, { trailingComma: false });
    expect(out).toContain("  y: int\n");
    expect(out).not.toContain("  y: int,\n");
  });
  it("lineWidth small forces multi-line", () => {
    const src = "let a = [1, 2, 3, 4, 5, 6, 7, 8];";
    const out = format(src, { lineWidth: 20 });
    expect(out).toContain("[\n");
    expect(out).toContain("  1,\n");
  });
  it("lineWidth large keeps single-line", () => {
    const src = "let a = [1, 2, 3];";
    formatsTo(src, "let a = [1, 2, 3];\n", { lineWidth: 1000 });
  });
});

//-----------------------------------------------------------------------------
// 10. Idempotency on every example file (15 cases)
//-----------------------------------------------------------------------------
const exampleFiles = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith(".ae")).sort();

describe("formatter: idempotency on all 15 example files", () => {
  for (const f of exampleFiles) {
    it(`idempotent: ${f}`, () => {
      const src = fs.readFileSync(path.join(EXAMPLES_DIR, f), "utf8");
      idempotent(src);
    });
  }
});

//-----------------------------------------------------------------------------
// 11. Idempotency on 50 generated random-ish inputs
//-----------------------------------------------------------------------------
// A deterministic PRNG so the test suite is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["x", "y", "z", "foo", "bar", "baz", "n", "i", "j", "k", "arr", "xs", "acc"];
const INTS = [0, 1, 2, 3, 5, 10, 42, 99, -1, -7];

function genExpr(rng: () => number, depth: number): string {
  if (depth <= 0 || rng() < 0.3) {
    const r = rng();
    if (r < 0.3) return String(INTS[Math.floor(rng() * INTS.length)]);
    if (r < 0.5) return NAMES[Math.floor(rng() * NAMES.length)];
    if (r < 0.6) return "true";
    if (r < 0.7) return "false";
    if (r < 0.8) return "[]";
    if (r < 0.9) return '"hi"';
    return "()";
  }
  const choice = Math.floor(rng() * 8);
  const a = genExpr(rng, depth - 1);
  switch (choice) {
    case 0: return `(${a} + ${genExpr(rng, depth - 1)})`;
    case 1: return `(${a} - ${genExpr(rng, depth - 1)})`;
    case 2: return `(${a} * ${genExpr(rng, depth - 1)})`;
    case 3: return `(${a} == ${genExpr(rng, depth - 1)})`;
    case 4: return `(${a} < ${genExpr(rng, depth - 1)})`;
    case 5: return `!${a}`;
    case 6: return `f"{${a}}"`;
    default: return `[${a}, ${genExpr(rng, depth - 1)}]`;
  }
}

function genStmt(rng: () => number, depth: number): string {
  const choice = Math.floor(rng() * 6);
  const name = NAMES[Math.floor(rng() * NAMES.length)];
  switch (choice) {
    case 0: return `let ${name} = ${genExpr(rng, depth)};`;
    case 1: return `let mut ${name} = ${genExpr(rng, depth)};`;
    case 2: return `const ${name.toUpperCase()} = ${genExpr(rng, depth)};`;
    case 3: return `print(${genExpr(rng, depth)});`;
    case 4: return `if ${genExpr(rng, depth - 1)} { ${genStmt(rng, depth - 1)} } else { ${genStmt(rng, depth - 1)} };`;
    default: return `${name} = ${genExpr(rng, depth)};`;
  }
}

function genProgram(rng: () => number, n: number): string {
  const out: string[] = [];
  // Maybe an enum and a fn at the top.
  if (rng() < 0.5) {
    out.push("enum E { A, B(int), C }");
  }
  if (rng() < 0.7) {
    out.push(`fn ${NAMES[Math.floor(rng() * NAMES.length)]}(${NAMES[Math.floor(rng() * NAMES.length)]}: int) -> int { ${NAMES[0]} }`);
  }
  for (let i = 0; i < n; i++) {
    out.push(genStmt(rng, 3));
  }
  return out.join("\n");
}

describe("formatter: idempotency on 50 generated inputs", () => {
  const rng = mulberry32(0xAE7AEBF4);
  for (let i = 0; i < 50; i++) {
    const seed = Math.floor(rng() * 1e9);
    it(`idempotent: random input #${i + 1} (seed=${seed})`, () => {
      const r = mulberry32(seed);
      const src = genProgram(r, 5 + Math.floor(r() * 10));
      idempotent(src);
    });
  }
});

//-----------------------------------------------------------------------------
// 12. Edge cases
//-----------------------------------------------------------------------------
describe("formatter: edge cases", () => {
  it("empty input", () => {
    expect(format("")).toBe("\n");
  });
  it("whitespace only", () => {
    expect(format("   \n\n  \n")).toBe("\n");
  });
  it("single newline preserved (collapsed)", () => {
    expect(format("let x = 1;\n")).toBe("let x = 1;\n");
  });
  it("trailing newlines collapsed", () => {
    expect(format("let x = 1;\n\n\n")).toBe("let x = 1;\n");
  });
  it("no trailing newline added", () => {
    // We always add exactly one trailing newline.
    expect(format("let x = 1")).toBe("let x = 1;\n");
  });
  it("nested fns idempotent", () => {
    idempotent("fn outer() { fn inner() { fn deep() { 1 } deep() } inner() }");
  });
  it("deeply nested match idempotent", () => {
    idempotent("match x { A => match y { B => 1, C => 2 }, _ => 0 }");
  });
  it("comment-only idempotent", () => {
    idempotent("// just a comment\n// and another");
  });
});
