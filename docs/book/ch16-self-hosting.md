# Chapter 16 — Self-hosting

> Aether v3 begins the self-hosting milestone: the Aether lexer, AST, and parser are written in Aether itself, in `aether-bootstrap/lexer.ae`, `aether-bootstrap/ast.ae`, and `aether-bootstrap/parser.ae`. They produce the same tokens and AST as the TypeScript reference in `aether/core/lexer/lexer.ts`, `aether/core/ast/ast.ts`, and `aether/core/parser/parser.ts`. This chapter covers the bootstrap, the three host builtins that make it possible (`charCode`, `fromCharCode`, `strSlice`), what's next (sema, IR, codegen in Aether), and the path to a fully self-hosted Aether compiler by v3.3. Ten runnable examples show the bootstrap in action.

Self-hosting is the milestone where a language's compiler is written in the language itself. The benefits are pedagogical (the language's own source code is the largest example program), practical (the language can evolve without the host language's constraints), and aesthetic (a self-hosted compiler is the proof that the language is "real"). The classic milestones are C (`cfront`), Haskell (GHC), Rust (rustc), Go (the Go compiler), and Zig (zig self-hosted).

Aether v3 takes the first step: the **front-end** (lexer, AST, parser) is now in Aether. The **back-end** (sema, IR, codegen) is still in TypeScript, scheduled for v3.1 (sema), v3.2 (IR), and v3.3 (codegen). The full bootstrap is a v3.3 milestone. This chapter covers what's been done, why, and what's next.

---

## 16.1 The three host builtins

The bootstrap uses exactly three host builtins — the minimum substrate for any string-processing language. They are:

- **`charCode(s: string, i: int) -> int`** — the i-th UTF-16 code unit of `s`, as an integer (0..65535).
- **`fromCharCode(n: int) -> string`** — the inverse: the single-character string whose code unit is `n`.
- **`strSlice(s: string, start: int, end: int) -> string`** — the substring of `s` from `start` (inclusive) to `end` (exclusive).

These three builtins are registered as inline builtins in `aether/core/eval/eval.ts`, before the stdlib registration. They are *always available* — no `import`, no module system dependency. They're the foundation of every string-processing Aether program, including the bootstrap lexer.

### Why these three?

A lexer fundamentally does three things:

1. **Read** a character at position `i` — `charCode`.
2. **Build** a string from characters it accumulated — `fromCharCode` + `+` (concat).
3. **Slice** a substring for an escape sequence or a multi-char token — `strSlice`.

With these three, you can implement every other string operation: `len` (already a builtin), `+` (concat), `==` (compare), `>=` (compare by code), etc. Aether's stdlib `string` module builds on these (split, replace, indexOf, etc.); `aether-string` builds further (levenshtein, hamming, etc.); the bootstrap lexer builds on all of them.

See ADR-21 for the full argument for keeping the substrate to exactly three builtins (vs. exposing `regex`, `split`, `replace`, etc.).

### Example 1: the three builtins

```aether
let s = "hello";
print(charCode(s, 0));          // 104 (h)
print(charCode(s, 4));          // 111 (o)
print(fromCharCode(72));        // H
print(strSlice(s, 1, 4));       // ell
```

These three calls are enough to walk any string character by character, build any new string, and extract any substring. Everything else is composition.

---

## 16.2 The bootstrap lexer

The bootstrap lexer (`aether-bootstrap/lexer.ae`, ~660 lines) is a hand-written state machine that produces the same token stream as the TypeScript reference. It handles:

- Numbers (int, float, hex, octal, binary literals).
- Strings (with escape sequences, including `\n`, `\t`, `\u{...}`, `\"`, `\\`).
- Identifiers and keywords.
- Operators (including multi-char: `==`, `!=`, `<=`, `>=`, `=>`, `->`, `::`, `..`, `<<`, `>>`).
- Comments (line `//` and block `/* */`).
- The interpolated string `f"..."` (a sequence of `StrSeg` chunks).

### Example 2: lex a simple program

```aether
import { lex } from "aether-bootstrap/lexer.ae";

let tokens = lex("let x = 42;");
print(len(tokens));   // 5 (let, x, =, 42, ;)
print(tokens[0].kind);  // "Let"
print(tokens[3].kind);  // "Int"
print(tokens[3].text);  // "42"
```

The bootstrap lexer is invoked the same way as the TypeScript reference: `lex(source)` returns an array of `Token` structs. The struct shape:

```aether
struct Token {
  kind: string,
  text: string,
  line: int,
  col: int,
  offset: int,
  endOffset: int,
  segments: [StringSeg]
}
```

The `kind` is a string ("Let", "Ident", "Int", "Plus", etc.); `text` is the source text of the token; `line`/`col`/`offset`/`endOffset` are the source location; `segments` is for interpolated strings (a list of `StringSeg` chunks).

### Example 3: lex an interpolated string

```aether
import { lex } from "aether-bootstrap/lexer.ae";

let tokens = lex("print(f\"x = {x}\");");
print(tokens[1].kind);            // "StrF"
print(len(tokens[1].segments));   // 3 (literal "x = ", expr "x", literal "")
print(tokens[1].segments[0].kind); // "Lit"
print(tokens[1].segments[0].value); // "x = "
print(tokens[1].segments[1].kind); // "Expr"
print(tokens[1].segments[1].value); // "x"
```

The interpolated string `f"x = {x}"` is lexed into a single `StrF` token whose `segments` field is a list of `StringSeg` structs, alternating between literal text (`Lit`) and expression placeholders (`Expr`). The parser handles the interpolation; the lexer just splits the source into chunks.

---

## 16.3 The bootstrap AST

The bootstrap AST (`aether-bootstrap/ast.ae`, ~280 lines) is a set of Aether `struct` definitions that mirror the TypeScript `ast.ts` discriminated union. Every AST node kind is a struct; the parser builds these structs; the printer (future) walks them and produces source text.

### Example 4: build an AST by hand

```aether
import { LetDecl, ExprStmt, BinOp, IntLit, Ident } from "aether-bootstrap/ast.ae";

let ast = LetDecl {
  name: "x",
  ty: None,
  mut: false,
  init: BinOp { op: "Add", lhs: IntLit { value: 1 }, rhs: IntLit { value: 2 } }
};

print(ast.name);          // x
print(ast.init.op);      // Add
print(ast.init.lhs.value); // 1
```

The AST structs use Aether's `enum` for optional fields (`Option<T>`), and Aether's `[T]` for child sequences. The parser produces these structs directly; the type checker (when it's ported) will consume them.

---

## 16.4 The bootstrap parser

The bootstrap parser (`aether-bootstrap/parser.ae`, ~820 lines) is a recursive-descent parser that produces the same AST as the TypeScript reference. It handles every Aether construct: let/const/fn/struct/enum/type declarations, expressions (binary, unary, postfix, call, index, field access, match, if, blocks), statements, and the v3 constructs (trait/impl/dyn).

### Example 5: parse a small program

```aether
import { parse } from "aether-bootstrap/parser.ae";

let ast = parse("fn add(a: int, b: int) -> int { a + b }");
print(ast.body[0].kind);     // "FnDecl"
print(ast.body[0].name);     // "add"
print(ast.body[0].params[0].name);  // "a"
print(ast.body[0].params[0].ty);    // "int"
print(ast.body[0].retTy);    // "int"
print(ast.body[0].body.kind); // "Block"
```

The parser is a single function `parse(source)` that returns a `Program` struct. The `Program.body` is an array of declaration nodes (`FnDecl`, `LetDecl`, `StructDecl`, etc.).

### Example 6: parse a struct

```aether
import { parse } from "aether-bootstrap/parser.ae";

let ast = parse("struct Point { x: int, y: int }");
print(ast.body[0].kind);     // "StructDecl"
print(ast.body[0].name);    // "Point"
print(ast.body[0].fields[0].name);   // "x"
print(ast.body[0].fields[0].ty);     // "int"
print(ast.body[0].fields[1].name);   // "y"
```

### Example 7: parse a match expression

```aether
import { parse } from "aether-bootstrap/parser.ae";

let ast = parse("match n { 0 => 1, _ => n * fib(n - 1) }");
print(ast.body[0].kind);              // "ExprStmt"  (top-level match)
print(ast.body[0].expr.kind);         // "Match"
print(len(ast.body[0].expr.arms));    // 2
print(ast.body[0].expr.arms[0].pat.kind);  // "IntPat"
print(ast.body[0].expr.arms[1].pat.kind);  // "WildcardPat"
```

The parser handles every construct. The bootstrap test suite (`aether-bootstrap/parser.test.ae`, ~50 tests) parses a corpus of small programs and asserts on the AST shape.

---

## 16.5 The bootstrap milestone

What's done:

- **Lexer** — complete, produces the same tokens as the TypeScript reference.
- **AST** — complete, every node kind defined.
- **Parser** — complete, parses every construct.
- **Tests** — 50+ tests, all passing.

What's next:

- **Sema (type checker)** — v3.1. Will type-check the AST produced by the bootstrap parser. The biggest single piece of work; the sema is ~3000 lines of TypeScript that needs to be ported.
- **IR builder** — v3.2. Lowers the typed AST to the IR. The IR is the target-independent intermediate that the VM, WASM, and x86 backends consume.
- **Codegen (VM, WASM, x86)** — v3.3. Emits bytecode, WASM, or x86 from the IR. Each backend is ~1500-2000 lines.

Once the codegen is ported, the bootstrap is complete: Aether can compile Aether programs to bytecode, WASM, or x86, using a compiler that is itself an Aether program.

---

## 16.6 The path to full self-hosting

The bootstrap milestone is the *front-end*. The *back-end* (sema, IR, codegen) is the bigger piece. The plan:

1. **v3.1: Port sema to Aether.** The type checker is the next biggest piece. It walks the AST, builds a type environment, and reports type errors. The port will live in `aether-bootstrap/sema.ae`; the test suite will run the bootstrap sema on every test file in `tests/` and check that it produces the same errors as the TypeScript sema.

2. **v3.2: Port the IR builder.** The IR builder takes a typed AST and produces the IR. The IR is target-independent (the same IR lowers to bytecode, WASM, and x86). The port will live in `aether-bootstrap/ir.ae`.

3. **v3.3: Port the codegen.** Three codegens: VM (bytecode), WASM (binary), x86 (NASM text). Each is ~1500-2000 lines. The ports will live in `aether-bootstrap/codegen_vm.ae`, `aether-bootstrap/codegen_wasm.ae`, `aether-bootstrap/codegen_x86.ae`.

4. **v3.3: Bootstrap test.** A test that takes an Aether program, compiles it with the bootstrap compiler (lexer + AST + parser + sema + IR + codegen), and runs it. The bootstrap compiler must produce the same output as the TypeScript compiler.

### Example 8: the bootstrap test (planned, v3.3)

```aether
import { lex } from "aether-bootstrap/lexer.ae";
import { parse } from "aether-bootstrap/parser.ae";
import { check } from "aether-bootstrap/sema.ae";
import { lower } from "aether-bootstrap/ir.ae";
import { emitWasm } from "aether-bootstrap/codegen_wasm.ae";

let src = "fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } } print(fib(10));";
let tokens = lex(src);
let ast = parse(tokens);
let typed = check(ast);
let ir = lower(typed);
let wasm = emitWasm(ir);
// Run the WASM via the browser's WASM engine.
let result = runWasm(wasm);
print(result);   // 55
```

This is the goal: the entire compile pipeline, written in Aether, producing a WASM module that the browser runs. The TypeScript reference remains as the bootstrap seed (the compiler you use to compile the bootstrap compiler); once the bootstrap is stable, the TypeScript reference can be retired.

---

## 16.7 Why self-host?

Three reasons:

1. **Pedagogical.** The Aether-in-Aether source is the largest example program in the language. Students can read it end-to-end to see how a real compiler is structured. The TypeScript reference is harder to read (it uses TypeScript's idiosyncrasies); the Aether port is plain Aether.

2. **Practical.** The bootstrap compiler is a stress test of the language. Every Aether feature used in the bootstrap (struct, enum, match, closures, generics, traits) is exercised by the bootstrap itself. Bugs surface early; the language improves as the bootstrap matures.

3. **Aesthetic.** A self-hosted compiler is the proof that the language is "real" — that it's expressive enough to write its own implementation. This is the milestone that separates toys from real languages. (Not strictly true — many production languages are not self-hosted — but it's the cultural milestone.)

### Why now (v3) and not earlier?

v1 had no traits, no borrow checker, no WASM/x86 backends. The bootstrap needs the language to be expressive enough to write a parser (which needs `enum`, `match`, `Option<T>`, recursive types — all in v2) and a codegen (which needs the IR, which needs `struct`, generic functions, arrays — all in v2). v3's trait system and borrow checker make the codegen more maintainable (the trait `Drop` for cleanup; the borrow checker for safe memory management in the IR). v3 is the first version where the bootstrap is realistic.

---

## 16.8 The lexer in detail

The bootstrap lexer is a single function `lex(source)` that walks the source character by character (using `charCode`) and emits tokens. The state:

```aether
struct Lex {
  src: string,
  srcLen: int,
  pos: int,
  line: int,
  col: int,
  tokens: [Token],
  errors: [LexError]
}
```

The main loop:

```aether
while self.pos < self.srcLen {
  let c = charCode(self.src, self.pos);
  if isWhitespace(c) { skipWhitespace(); }
  else if c == '/' && peek(self, 1) == '/' { skipLineComment(); }
  else if c == '/' && peek(self, 1) == '*' { skipBlockComment(); }
  else if isDigit(c) { lexNumber(); }
  else if isIdentStart(c) { lexIdent(); }
  else if c == '"' { lexString(); }
  else if c == 'f' && peek(self, 1) == '"' { lexStrF(); }
  else { lexOperator(); }
}
```

Each `lexX` function consumes characters from the source and emits a token. The token's `kind`, `text`, `line`, `col`, `offset`, `endOffset` are set before the token is pushed.

### Example 9: the lexer's identifier function

```aether
fn lexIdent(self: &mut Lex) -> () {
  let start = self.pos;
  let mut end = self.pos;
  while end < self.srcLen && isIdentCont(charCode(self.src, end)) {
    end = end + 1;
  }
  let text = strSlice(self.src, start, end);
  let kind = if isKeyword(text) { keywordKind(text) } else { "Ident" };
  push(self.tokens, Token { kind, text, line: self.line, col: self.col, offset: start, endOffset: end, segments: [] });
  self.pos = end;
  self.col = self.col + (end - start);
}
```

The function reads characters while they're identifier-continue (`[A-Za-z0-9_]`), slices the substring, classifies it as a keyword or an identifier, and emits the token. The lexer's other `lexX` functions follow the same pattern.

---

## 16.9 The parser in detail

The bootstrap parser is a recursive-descent parser: each grammar rule is a function that consumes tokens and produces an AST node. The state:

```aether
struct Parse {
  tokens: [Token],
  pos: int,
  errors: [ParseError]
}
```

Each parse function takes `&mut Parse` (a mutable reference to the parser state) and returns an AST node. The `parseExpr` function dispatches by precedence (lowest first):

```aether
fn parseExpr(self: &mut Parse) -> Expr {
  parseOr(self)   // ||  (lowest precedence)
}
fn parseOr(self: &mut Parse) -> Expr {
  let mut lhs = parseAnd(self);
  while peek(self) is Op("||") {
    advance(self);
    let rhs = parseAnd(self);
    lhs = BinOp { op: "Or", lhs: lhs, rhs: rhs };
  }
  lhs
}
// ... parseAnd, parseEq, parseCmp, parseAdd, parseMul, parseUnary, parsePostfix, parsePrimary
```

This is the classic Pratt parser pattern, written in Aether. Each level handles one precedence; the levels compose to parse the full expression grammar.

### Example 10: parse an expression

```aether
import { parse } from "aether-bootstrap/parser.ae";

let ast = parse("1 + 2 * 3");
print(ast.body[0].kind);            // "ExprStmt"
print(ast.body[0].expr.kind);      // "BinOp"
print(ast.body[0].expr.op);        // "Add"
print(ast.body[0].expr.lhs.kind);  // "IntLit"
print(ast.body[0].expr.lhs.value); // 1
print(ast.body[0].expr.rhs.kind);  // "BinOp"
print(ast.body[0].expr.rhs.op);    // "Mul"
print(ast.body[0].expr.rhs.rhs.value); // 3
```

The parser correctly handles operator precedence: `1 + 2 * 3` parses as `1 + (2 * 3)` (the `*` binds tighter than `+`).

---

## 16.10 Summary

- The **bootstrap milestone** is the front-end (lexer, AST, parser) written in Aether, in `aether-bootstrap/`.
- The **three host builtins** (`charCode`, `fromCharCode`, `strSlice`) are the entire substrate. No regex, no `split`, no host string operations beyond these three. (ADR-21)
- The **lexer** is a state machine that produces tokens matching the TypeScript reference. 660 lines, 30+ tests.
- The **AST** is a set of Aether `struct`s mirroring the TypeScript discriminated union. 280 lines.
- The **parser** is a recursive-descent parser that produces the same AST as the TypeScript reference. 820 lines, 50+ tests.
- The **back-end** (sema, IR, codegen) is the next milestone. Plan: sema v3.1, IR v3.2, codegen v3.3.
- The **goal** is a fully self-hosted Aether compiler by v3.3: Aether compiles Aether to bytecode, WASM, or x86, using a compiler that is itself an Aether program.

The next chapter (Chapter 17) covers the package ecosystem — the 25 Aether packages, the `aether.toml` manifest, and the package registry vision.
