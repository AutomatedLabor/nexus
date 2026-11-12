package aether_compiler

import (
	"testing"
)

// ---------------------------------------------------------------------------
// Parser tests (80+)
// ---------------------------------------------------------------------------

// parseStmts parses `src` as a program and returns the top-level
// statement slice (the body), failing the test if there are any
// parse errors.
func parseStmts(t *testing.T, src string) []Stmt {
	t.Helper()
	r := ParseSource(src, "<test>")
	if len(r.Errors) != 0 {
		t.Fatalf("parse errors: %+v", r.Errors)
	}
	return r.Program.Body
}

// parseOne parses `src` and returns the single expected top-level
// statement, failing if there are any errors or the body isn't
// exactly one statement.
func parseOne(t *testing.T, src string) Stmt {
	stmts := parseStmts(t, src)
	if len(stmts) != 1 {
		t.Fatalf("expected exactly 1 statement, got %d", len(stmts))
	}
	return stmts[0]
}

func TestParseEmpty(t *testing.T) {
	r := ParseSource("", "<test>")
	if len(r.Errors) != 0 {
		t.Fatalf("errors on empty input: %+v", r.Errors)
	}
	if len(r.Program.Body) != 0 {
		t.Fatalf("expected empty program")
	}
}

func TestParseLetInt(t *testing.T) {
	s := parseOne(t, "let x = 1;")
	let, ok := s.(*Let)
	if !ok {
		t.Fatalf("expected *Let, got %T", s)
	}
	if let.Name != "x" {
		t.Fatalf("expected name 'x', got %q", let.Name)
	}
	lit, ok := let.Init.(*IntLit)
	if !ok || lit.Value != 1 {
		t.Fatalf("expected init IntLit(1), got %+v", let.Init)
	}
}

func TestParseLetMut(t *testing.T) {
	s := parseOne(t, "let mut y = 2;")
	if _, ok := s.(*MutLet); !ok {
		t.Fatalf("expected *MutLet, got %T", s)
	}
}

func TestParseLetWithType(t *testing.T) {
	s := parseOne(t, "let x: int = 5;")
	let := s.(*Let)
	if let.Type == nil {
		t.Fatalf("expected a type annotation")
	}
	if _, ok := let.Type.(*PrimitiveType); !ok {
		t.Fatalf("expected PrimitiveType, got %T", let.Type)
	}
}

func TestParseConst(t *testing.T) {
	s := parseOne(t, "const PI = 3.14;")
	c, ok := s.(*Const)
	if !ok || c.Name != "PI" {
		t.Fatalf("expected Const(PI), got %+v", s)
	}
	if _, ok := c.Init.(*FloatLit); !ok {
		t.Fatalf("expected FloatLit init")
	}
}

func TestParsePrintStmt(t *testing.T) {
	s := parseOne(t, "print(42);")
	p, ok := s.(*Print)
	if !ok {
		t.Fatalf("expected *Print, got %T", s)
	}
	if _, ok := p.Expr.(*IntLit); !ok {
		t.Fatalf("expected IntLit arg")
	}
}

func TestParseReturn(t *testing.T) {
	s := parseOne(t, "fn f() -> int { return 7; }")
	fd := s.(*FnDecl)
	ret := fd.Body.Stmts[0].(*Return)
	if _, ok := ret.Expr.(*IntLit); !ok {
		t.Fatalf("expected IntLit return")
	}
}

func TestParseReturnVoid(t *testing.T) {
	s := parseOne(t, "fn f() { return; }")
	fd := s.(*FnDecl)
	ret := fd.Body.Stmts[0].(*Return)
	if ret.Expr != nil {
		t.Fatalf("expected nil return expr")
	}
}

func TestParseBreakContinue(t *testing.T) {
	s := parseOne(t, "fn f() { while true { break; continue; } }")
	fd := s.(*FnDecl)
	wh := fd.Body.Stmts[0].(*While)
	if _, ok := wh.Body.Stmts[0].(*Break); !ok {
		t.Fatalf("expected Break")
	}
	if _, ok := wh.Body.Stmts[1].(*Continue); !ok {
		t.Fatalf("expected Continue")
	}
}

func TestParseWhile(t *testing.T) {
	s := parseOne(t, "while x < 10 { x = x + 1; }")
	w, ok := s.(*While)
	if !ok {
		t.Fatalf("expected *While, got %T", s)
	}
	if w.Cond == nil || w.Body == nil {
		t.Fatalf("expected non-nil cond and body")
	}
}

func TestParseFor(t *testing.T) {
	s := parseOne(t, "for i in range(0, 10) { print(i); }")
	f, ok := s.(*ForIn)
	if !ok {
		t.Fatalf("expected *ForIn, got %T", s)
	}
	if f.VarName != "i" {
		t.Fatalf("expected var 'i'")
	}
}

func TestParseIf(t *testing.T) {
	s := parseOne(t, "let x = if true { 1 } else { 2 };")
	let := s.(*Let)
	i, ok := let.Init.(*If)
	if !ok {
		t.Fatalf("expected If, got %T", let.Init)
	}
	if i.Else_ == nil {
		t.Fatalf("expected else branch")
	}
}

func TestParseIfElseIf(t *testing.T) {
	s := parseOne(t, "let x = if a > 0 { 1 } else if a < 0 { -1 } else { 0 };")
	let := s.(*Let)
	if _, ok := let.Init.(*If); !ok {
		t.Fatalf("expected If")
	}
}

func TestParseMatch(t *testing.T) {
	s := parseOne(t, "let r = match n { 0 => 1, 1 => 2, _ => 3, };")
	let := s.(*Let)
	m, ok := let.Init.(*Match)
	if !ok {
		t.Fatalf("expected Match, got %T", let.Init)
	}
	if len(m.Arms) != 3 {
		t.Fatalf("expected 3 arms, got %d", len(m.Arms))
	}
}

func TestParseMatchWithGuard(t *testing.T) {
	s := parseOne(t, "let r = match n { _ if n > 0 => 1, _ => 2, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if m.Arms[0].Guard == nil {
		t.Fatalf("expected guard on first arm")
	}
}

func TestParseFnDecl(t *testing.T) {
	s := parseOne(t, "fn add(a: int, b: int) -> int { return a + b; }")
	fd, ok := s.(*FnDecl)
	if !ok {
		t.Fatalf("expected *FnDecl, got %T", s)
	}
	if fd.Name != "add" {
		t.Fatalf("expected name 'add'")
	}
	if len(fd.Params) != 2 {
		t.Fatalf("expected 2 params, got %d", len(fd.Params))
	}
	if fd.Ret == nil {
		t.Fatalf("expected a return type")
	}
}

func TestParsePubFn(t *testing.T) {
	s := parseOne(t, "pub fn exported() -> int { return 1; }")
	fd := s.(*FnDecl)
	if !fd.Exported {
		t.Fatalf("expected Exported=true")
	}
}

func TestParseGenericFn(t *testing.T) {
	s := parseOne(t, "fn id<T>(x: T) -> T { return x; }")
	fd := s.(*FnDecl)
	if len(fd.Generics) != 1 || fd.Generics[0].Name != "T" {
		t.Fatalf("expected one generic 'T', got %+v", fd.Generics)
	}
}

func TestParseEnumUnit(t *testing.T) {
	s := parseOne(t, "enum Color { Red, Green, Blue, }")
	e, ok := s.(*EnumDecl)
	if !ok {
		t.Fatalf("expected *EnumDecl, got %T", s)
	}
	if len(e.Variants) != 3 {
		t.Fatalf("expected 3 variants, got %d", len(e.Variants))
	}
	for _, v := range e.Variants {
		if v.Kind != "unit" {
			t.Fatalf("expected unit variant, got %s", v.Kind)
		}
	}
}

func TestParseEnumTuple(t *testing.T) {
	s := parseOne(t, "enum Opt { Some(int), None, }")
	e := s.(*EnumDecl)
	if e.Variants[0].Kind != "tuple" || len(e.Variants[0].Types) != 1 {
		t.Fatalf("expected tuple variant with 1 type")
	}
}

func TestParseEnumStruct(t *testing.T) {
	s := parseOne(t, "enum Msg { Quit, Move { x: int, y: int }, }")
	e := s.(*EnumDecl)
	if e.Variants[1].Kind != "struct" || len(e.Variants[1].Fields) != 2 {
		t.Fatalf("expected struct variant with 2 fields, got %+v", e.Variants[1])
	}
}

func TestParseStructDecl(t *testing.T) {
	s := parseOne(t, "struct Point { x: int, y: int, }")
	sd, ok := s.(*StructDecl)
	if !ok {
		t.Fatalf("expected *StructDecl, got %T", s)
	}
	if len(sd.Fields) != 2 {
		t.Fatalf("expected 2 fields, got %d", len(sd.Fields))
	}
}

func TestParseStructDerive(t *testing.T) {
	s := parseOne(t, "#[derive(Debug)] struct Foo { x: int, }")
	sd := s.(*StructDecl)
	if sd.Derive == nil || len(sd.Derive) != 1 || sd.Derive[0] != "Debug" {
		t.Fatalf("expected derive(Debug), got %+v", sd.Derive)
	}
}

func TestParseTypeAlias(t *testing.T) {
	s := parseOne(t, "type MyInt = int;")
	ta, ok := s.(*TypeAlias)
	if !ok {
		t.Fatalf("expected *TypeAlias, got %T", s)
	}
	if ta.Name != "MyInt" {
		t.Fatalf("expected MyInt")
	}
}

func TestParseImport(t *testing.T) {
	s := parseOne(t, `import { foo } from "mod";`)
	i, ok := s.(*Import)
	if !ok {
		t.Fatalf("expected *Import, got %T", s)
	}
	if i.Path != "mod" || len(i.Names) != 1 || i.Names[0] != "foo" {
		t.Fatalf("import wrong: %+v", i)
	}
}

func TestParseImportPathFirst(t *testing.T) {
	s := parseOne(t, `import "mod" { foo, bar };`)
	i := s.(*Import)
	if i.Path != "mod" || len(i.Names) != 2 {
		t.Fatalf("import wrong: %+v", i)
	}
}

func TestParseBinaryAdd(t *testing.T) {
	s := parseOne(t, "let x = 1 + 2;")
	let := s.(*Let)
	b, ok := let.Init.(*Binary)
	if !ok || b.Op != "+" {
		t.Fatalf("expected Binary(+), got %+v", let.Init)
	}
}

func TestParseBinaryPrecedence(t *testing.T) {
	// 1 + 2 * 3 should parse as 1 + (2 * 3).
	s := parseOne(t, "let x = 1 + 2 * 3;")
	let := s.(*Let)
	b := let.Init.(*Binary)
	if b.Op != "+" {
		t.Fatalf("expected top-level +, got %s", b.Op)
	}
	right := b.Right.(*Binary)
	if right.Op != "*" {
		t.Fatalf("expected nested *, got %s", right.Op)
	}
}

func TestParseBinaryLeftAssoc(t *testing.T) {
	// 1 - 2 - 3 should parse as (1 - 2) - 3.
	s := parseOne(t, "let x = 1 - 2 - 3;")
	let := s.(*Let)
	b := let.Init.(*Binary)
	if b.Op != "-" {
		t.Fatalf("expected top-level -, got %s", b.Op)
	}
	left := b.Left.(*Binary)
	if left.Op != "-" {
		t.Fatalf("expected nested -, got %s", left.Op)
	}
}

func TestParseUnary(t *testing.T) {
	s := parseOne(t, "let x = -5;")
	let := s.(*Let)
	u, ok := let.Init.(*Unary)
	if !ok || u.Op != "-" {
		t.Fatalf("expected Unary(-), got %+v", let.Init)
	}
}

func TestParseUnaryNot(t *testing.T) {
	s := parseOne(t, "let x = !b;")
	let := s.(*Let)
	u := let.Init.(*Unary)
	if u.Op != "!" {
		t.Fatalf("expected !, got %s", u.Op)
	}
}

func TestParseParen(t *testing.T) {
	s := parseOne(t, "let x = (1 + 2) * 3;")
	let := s.(*Let)
	b := let.Init.(*Binary)
	if _, ok := b.Left.(*Paren); !ok {
		t.Fatalf("expected Paren on left of *")
	}
}

func TestParseCall(t *testing.T) {
	s := parseOne(t, "let x = f(1, 2);")
	let := s.(*Let)
	c, ok := let.Init.(*Call)
	if !ok {
		t.Fatalf("expected Call, got %T", let.Init)
	}
	if len(c.Args) != 2 {
		t.Fatalf("expected 2 args, got %d", len(c.Args))
	}
}

func TestParseCallNoArgs(t *testing.T) {
	s := parseOne(t, "let x = f();")
	let := s.(*Let)
	c := let.Init.(*Call)
	if len(c.Args) != 0 {
		t.Fatalf("expected 0 args, got %d", len(c.Args))
	}
}

func TestParseIndex(t *testing.T) {
	s := parseOne(t, "let x = a[0];")
	let := s.(*Let)
	if _, ok := let.Init.(*Index); !ok {
		t.Fatalf("expected Index, got %T", let.Init)
	}
}

func TestParseField(t *testing.T) {
	s := parseOne(t, "let x = a.b;")
	let := s.(*Let)
	if _, ok := let.Init.(*Field); !ok {
		t.Fatalf("expected Field, got %T", let.Init)
	}
}

func TestParseMethodCall(t *testing.T) {
	s := parseOne(t, "let x = a.foo(1);")
	let := s.(*Let)
	mc, ok := let.Init.(*MethodCall)
	if !ok || mc.Name != "foo" || len(mc.Args) != 1 {
		t.Fatalf("expected MethodCall(foo, [1]), got %+v", let.Init)
	}
}

func TestParseTupleExpr(t *testing.T) {
	s := parseOne(t, "let x = (1, 2, 3);")
	let := s.(*Let)
	if _, ok := let.Init.(*TupleExpr); !ok {
		t.Fatalf("expected TupleExpr, got %T", let.Init)
	}
}

func TestParseArrayExpr(t *testing.T) {
	s := parseOne(t, "let x = [1, 2, 3];")
	let := s.(*Let)
	a, ok := let.Init.(*ArrayExpr)
	if !ok || len(a.Elements) != 3 {
		t.Fatalf("expected ArrayExpr with 3 elements, got %+v", let.Init)
	}
}

func TestParseEmptyArray(t *testing.T) {
	s := parseOne(t, "let x = [];")
	let := s.(*Let)
	a := let.Init.(*ArrayExpr)
	if len(a.Elements) != 0 {
		t.Fatalf("expected empty array")
	}
}

func TestParseMapExpr(t *testing.T) {
	s := parseOne(t, "let x = { 1: 2, 3: 4 };")
	let := s.(*Let)
	m, ok := let.Init.(*MapExpr)
	if !ok || len(m.Entries) != 2 {
		t.Fatalf("expected MapExpr with 2 entries, got %+v", let.Init)
	}
}

func TestParseStructExpr(t *testing.T) {
	s := parseOne(t, "let p = Point { x: 1, y: 2 };")
	let := s.(*Let)
	se, ok := let.Init.(*StructExpr)
	if !ok || se.Name != "Point" || len(se.Fields) != 2 {
		t.Fatalf("expected StructExpr(Point, 2 fields), got %+v", let.Init)
	}
}

func TestParseEnumVariant(t *testing.T) {
	s := parseOne(t, "let x = Color::Red;")
	let := s.(*Let)
	ev, ok := let.Init.(*EnumVariant)
	if !ok || ev.EnumName != "Color" || ev.Variant != "Red" {
		t.Fatalf("expected EnumVariant(Color::Red), got %+v", let.Init)
	}
}

func TestParseEnumVariantArgs(t *testing.T) {
	s := parseOne(t, "let x = Some(5);")
	let := s.(*Let)
	if _, ok := let.Init.(*Call); !ok {
		t.Fatalf("expected Call for Some(5)")
	}
}

func TestParseLambda(t *testing.T) {
	s := parseOne(t, "let f = fn (x: int) -> int { return x + 1; };")
	let := s.(*Let)
	l, ok := let.Init.(*Lambda)
	if !ok || len(l.Params) != 1 {
		t.Fatalf("expected Lambda with 1 param, got %+v", let.Init)
	}
}

func TestParseRange(t *testing.T) {
	s := parseOne(t, "let r = 0..10;")
	let := s.(*Let)
	r, ok := let.Init.(*Range)
	if !ok || r.Inclusive {
		t.Fatalf("expected Range(0..10) exclusive, got %+v", let.Init)
	}
}

func TestParseRangeInclusive(t *testing.T) {
	s := parseOne(t, "let r = 0..=10;")
	let := s.(*Let)
	r := let.Init.(*Range)
	if !r.Inclusive {
		t.Fatalf("expected inclusive range")
	}
}

func TestParseAs(t *testing.T) {
	s := parseOne(t, "let x = a as int;")
	let := s.(*Let)
	if _, ok := let.Init.(*As); !ok {
		t.Fatalf("expected As, got %T", let.Init)
	}
}

func TestParseErrorProp(t *testing.T) {
	s := parseOne(t, "let x = foo()?;")
	let := s.(*Let)
	if _, ok := let.Init.(*ErrorProp); !ok {
		t.Fatalf("expected ErrorProp, got %T", let.Init)
	}
}

func TestParseTupleField(t *testing.T) {
	s := parseOne(t, "let x = t.0;")
	let := s.(*Let)
	if _, ok := let.Init.(*TupleField); !ok {
		t.Fatalf("expected TupleField, got %T", let.Init)
	}
}

func TestParseSelfExpr(t *testing.T) {
	s := parseOne(t, "let x = self;")
	let := s.(*Let)
	if _, ok := let.Init.(*SelfExpr); !ok {
		t.Fatalf("expected SelfExpr, got %T", let.Init)
	}
}

func TestParseUnitLit(t *testing.T) {
	s := parseOne(t, "let x = unit;")
	let := s.(*Let)
	if _, ok := let.Init.(*UnitLit); !ok {
		t.Fatalf("expected UnitLit, got %T", let.Init)
	}
}

func TestParseUnitLitFromParen(t *testing.T) {
	s := parseOne(t, "let x = ();")
	let := s.(*Let)
	if _, ok := let.Init.(*UnitLit); !ok {
		t.Fatalf("expected UnitLit from (), got %T", let.Init)
	}
}

func TestParseBoolLit(t *testing.T) {
	stmts := parseStmts(t, "let t = true; let f = false;")
	if len(stmts) != 2 {
		t.Fatalf("expected 2 stmts, got %d", len(stmts))
	}
	t1 := stmts[0].(*Let).Init.(*BoolLit)
	if !t1.Value {
		t.Fatalf("expected true")
	}
	f1 := stmts[1].(*Let).Init.(*BoolLit)
	if f1.Value {
		t.Fatalf("expected false")
	}
}

func TestParseStringLit(t *testing.T) {
	s := parseOne(t, `let x = "hello";`)
	let := s.(*Let)
	str, ok := let.Init.(*StringLit)
	if !ok || len(str.Segments) != 1 || str.Segments[0].Value != "hello" {
		t.Fatalf("expected StringLit(hello), got %+v", let.Init)
	}
}

func TestParseFStringInterp(t *testing.T) {
	s := parseOne(t, `let x = f"hi {name}";`)
	let := s.(*Let)
	str := let.Init.(*StringLit)
	if len(str.Segments) != 2 {
		t.Fatalf("expected 2 segments, got %d", len(str.Segments))
	}
	if str.Segments[1].Expr == nil {
		t.Fatalf("expected parsed interp expr")
	}
}

func TestParseCharLit(t *testing.T) {
	s := parseOne(t, "let c = 'a';")
	let := s.(*Let)
	c, ok := let.Init.(*CharLit)
	if !ok || c.Value != "a" {
		t.Fatalf("expected CharLit(a), got %+v", let.Init)
	}
}

func TestParseIntLits(t *testing.T) {
	tests := []struct {
		src string
		val int64
	}{
		{"let x = 0;", 0},
		{"let x = 42;", 42},
		{"let x = 0xff;", 0xff},
		{"let x = 0b1010;", 10},
		{"let x = 0o17;", 15},
	}
	for _, tt := range tests {
		s := parseOne(t, tt.src)
		let := s.(*Let)
		lit := let.Init.(*IntLit)
		if lit.Value != tt.val {
			t.Errorf("%s -> %d (want %d)", tt.src, lit.Value, tt.val)
		}
	}
}

func TestParseFloatLit(t *testing.T) {
	s := parseOne(t, "let x = 3.14;")
	let := s.(*Let)
	f := let.Init.(*FloatLit)
	if f.Value != 3.14 {
		t.Fatalf("expected 3.14, got %v", f.Value)
	}
}

func TestParseAssign(t *testing.T) {
	s := parseOne(t, "x = 5;")
	a, ok := s.(*AssignStmt)
	if !ok {
		t.Fatalf("expected *AssignStmt, got %T", s)
	}
	if _, ok := a.Target.(*Ident); !ok {
		t.Fatalf("expected Ident target")
	}
}

func TestParseCompoundAssign(t *testing.T) {
	s := parseOne(t, "x += 5;")
	a := s.(*AssignStmt)
	if _, ok := a.Value.(*CompoundAssign); !ok {
		t.Fatalf("expected CompoundAssign value, got %T", a.Value)
	}
}

func TestParseExprStmt(t *testing.T) {
	s := parseOne(t, "foo();")
	if _, ok := s.(*ExprStmt); !ok {
		t.Fatalf("expected *ExprStmt, got %T", s)
	}
}

func TestParseBlockTrailing(t *testing.T) {
	s := parseOne(t, "fn f() -> int { 1 + 2 }")
	fd := s.(*FnDecl)
	if fd.Body.Expr == nil {
		t.Fatalf("expected trailing expr in block")
	}
}

func TestParseTraitDecl(t *testing.T) {
	s := parseOne(t, "trait Show { fn show(self) -> string; }")
	td, ok := s.(*TraitDecl)
	if !ok || td.Name != "Show" {
		t.Fatalf("expected TraitDecl(Show), got %T", s)
	}
	if len(td.Methods) != 1 {
		t.Fatalf("expected 1 method, got %d", len(td.Methods))
	}
}

func TestParseTraitWithDefault(t *testing.T) {
	s := parseOne(t, "trait Foo { fn bar(self) -> int { return 1; } }")
	td := s.(*TraitDecl)
	if !td.Methods[0].HasDefault {
		t.Fatalf("expected HasDefault=true")
	}
}

func TestParseTraitAssocType(t *testing.T) {
	s := parseOne(t, "trait Container { type Item; fn get(self) -> Item; }")
	td := s.(*TraitDecl)
	if len(td.AssocTypes) != 1 || td.AssocTypes[0].Name != "Item" {
		t.Fatalf("expected assoc type Item, got %+v", td.AssocTypes)
	}
}

func TestParseImplBlock(t *testing.T) {
	s := parseOne(t, "impl Show for int { fn show(self) -> string { return \"x\"; } }")
	ib, ok := s.(*ImplBlock)
	if !ok || ib.TraitName != "Show" {
		t.Fatalf("expected ImplBlock(Show for int), got %T", s)
	}
	if len(ib.Methods) != 1 {
		t.Fatalf("expected 1 method, got %d", len(ib.Methods))
	}
}

func TestParseImplAssocType(t *testing.T) {
	s := parseOne(t, "impl Container for int { type Item = int; fn get(self) -> int { return self; } }")
	ib := s.(*ImplBlock)
	if len(ib.AssocTypes) != 1 || ib.AssocTypes[0].Name != "Item" {
		t.Fatalf("expected 1 assoc type Item, got %+v", ib.AssocTypes)
	}
}

func TestParseTypePrimitive(t *testing.T) {
	s := parseOne(t, "let x: int = 0;")
	let := s.(*Let)
	if _, ok := let.Type.(*PrimitiveType); !ok {
		t.Fatalf("expected PrimitiveType")
	}
}

func TestParseTypeTuple(t *testing.T) {
	s := parseOne(t, "let x: (int, string) = (1, \"a\");")
	let := s.(*Let)
	if _, ok := let.Type.(*TupleType); !ok {
		t.Fatalf("expected TupleType, got %T", let.Type)
	}
}

func TestParseTypeArray(t *testing.T) {
	s := parseOne(t, "let x: [int] = [1];")
	let := s.(*Let)
	if _, ok := let.Type.(*ArrayType); !ok {
		t.Fatalf("expected ArrayType, got %T", let.Type)
	}
}

func TestParseTypeMap(t *testing.T) {
	s := parseOne(t, "let x: map[string]int = {};")
	let := s.(*Let)
	if _, ok := let.Type.(*MapType); !ok {
		t.Fatalf("expected MapType, got %T", let.Type)
	}
}

func TestParseTypeOption(t *testing.T) {
	s := parseOne(t, "let x: option<int> = unit;")
	let := s.(*Let)
	if _, ok := let.Type.(*OptionType); !ok {
		t.Fatalf("expected OptionType, got %T", let.Type)
	}
}

func TestParseTypeResult(t *testing.T) {
	s := parseOne(t, "let x: result<int, string> = unit;")
	let := s.(*Let)
	if _, ok := let.Type.(*ResultType); !ok {
		t.Fatalf("expected ResultType, got %T", let.Type)
	}
}

func TestParseTypeFunc(t *testing.T) {
	s := parseOne(t, "let x: fn (int) -> int = unit;")
	let := s.(*Let)
	if _, ok := let.Type.(*FuncType); !ok {
		t.Fatalf("expected FuncType, got %T", let.Type)
	}
}

func TestParseTypeGeneric(t *testing.T) {
	s := parseOne(t, "let x: Vec<int> = unit;")
	let := s.(*Let)
	if _, ok := let.Type.(*GenericType); !ok {
		t.Fatalf("expected GenericType, got %T", let.Type)
	}
}

func TestParseTypeNamed(t *testing.T) {
	s := parseOne(t, "let x: Foo = unit;")
	let := s.(*Let)
	if _, ok := let.Type.(*NamedType); !ok {
		t.Fatalf("expected NamedType, got %T", let.Type)
	}
}

func TestParseTypeDyn(t *testing.T) {
	s := parseOne(t, "let x: dyn Foo = unit;")
	let := s.(*Let)
	if _, ok := let.Type.(*DynType); !ok {
		t.Fatalf("expected DynType, got %T", let.Type)
	}
}

func TestParsePatternWildcard(t *testing.T) {
	s := parseOne(t, "let r = match n { _ => 1, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if _, ok := m.Arms[0].Pattern.(*WildcardPat); !ok {
		t.Fatalf("expected WildcardPat")
	}
}

func TestParsePatternBind(t *testing.T) {
	s := parseOne(t, "let r = match n { x => 1, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if _, ok := m.Arms[0].Pattern.(*BindPat); !ok {
		t.Fatalf("expected BindPat")
	}
}

func TestParsePatternLit(t *testing.T) {
	s := parseOne(t, "let r = match n { 0 => 1, _ => 2, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if _, ok := m.Arms[0].Pattern.(*LitPat); !ok {
		t.Fatalf("expected LitPat")
	}
}

func TestParsePatternTuple(t *testing.T) {
	s := parseOne(t, "let r = match p { (a, b) => a, _ => 0, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if _, ok := m.Arms[0].Pattern.(*TuplePat); !ok {
		t.Fatalf("expected TuplePat")
	}
}

func TestParsePatternArray(t *testing.T) {
	s := parseOne(t, "let r = match arr { [a, b] => a, _ => 0, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if _, ok := m.Arms[0].Pattern.(*ArrayPat); !ok {
		t.Fatalf("expected ArrayPat")
	}
}

func TestParsePatternOr(t *testing.T) {
	s := parseOne(t, "let r = match n { 0 | 1 => 1, _ => 2, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if _, ok := m.Arms[0].Pattern.(*OrPat); !ok {
		t.Fatalf("expected OrPat")
	}
}

func TestParsePatternStruct(t *testing.T) {
	s := parseOne(t, "let r = match p { Point { x, y } => x, _ => 0, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if _, ok := m.Arms[0].Pattern.(*StructPat); !ok {
		t.Fatalf("expected StructPat")
	}
}

func TestParsePatternEnum(t *testing.T) {
	s := parseOne(t, "let r = match e { Color::Red => 1, _ => 2, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if _, ok := m.Arms[0].Pattern.(*EnumPat); !ok {
		t.Fatalf("expected EnumPat")
	}
}

func TestParseBorrow(t *testing.T) {
	s := parseOne(t, "let x = &y;")
	let := s.(*Let)
	b, ok := let.Init.(*Borrow)
	if !ok || b.Mutable {
		t.Fatalf("expected immutable Borrow, got %+v", let.Init)
	}
}

func TestParseBorrowMut(t *testing.T) {
	s := parseOne(t, "let x = &mut y;")
	let := s.(*Let)
	b := let.Init.(*Borrow)
	if !b.Mutable {
		t.Fatalf("expected mutable Borrow")
	}
}

func TestParseDeref(t *testing.T) {
	s := parseOne(t, "let x = *p;")
	let := s.(*Let)
	if _, ok := let.Init.(*Deref); !ok {
		t.Fatalf("expected Deref, got %T", let.Init)
	}
}

func TestParseMove(t *testing.T) {
	s := parseOne(t, "let x = move y;")
	let := s.(*Let)
	if _, ok := let.Init.(*Move); !ok {
		t.Fatalf("expected Move, got %T", let.Init)
	}
}

func TestParseLogicalOr(t *testing.T) {
	s := parseOne(t, "let x = a || b;")
	let := s.(*Let)
	b := let.Init.(*Binary)
	if b.Op != "||" {
		t.Fatalf("expected ||, got %s", b.Op)
	}
}

func TestParseLogicalAnd(t *testing.T) {
	s := parseOne(t, "let x = a && b;")
	let := s.(*Let)
	b := let.Init.(*Binary)
	if b.Op != "&&" {
		t.Fatalf("expected &&, got %s", b.Op)
	}
}

func TestParseComparisons(t *testing.T) {
	for _, op := range []string{"==", "!=", "<", "<=", ">", ">="} {
		s := parseOne(t, "let x = a "+op+" b;")
		let := s.(*Let)
		b := let.Init.(*Binary)
		if b.Op != op {
			t.Errorf("expected %s, got %s", op, b.Op)
		}
	}
}

func TestParseBitwise(t *testing.T) {
	for _, op := range []string{"|", "^", "&", "<<", ">>"} {
		s := parseOne(t, "let x = a "+op+" b;")
		let := s.(*Let)
		b := let.Init.(*Binary)
		if b.Op != op {
			t.Errorf("expected %s, got %s", op, b.Op)
		}
	}
}

func TestParseArithmetic(t *testing.T) {
	for _, op := range []string{"+", "-", "*", "/", "%"} {
		s := parseOne(t, "let x = a "+op+" b;")
		let := s.(*Let)
		b := let.Init.(*Binary)
		if b.Op != op {
			t.Errorf("expected %s, got %s", op, b.Op)
		}
	}
}

func TestParseOrKeyword(t *testing.T) {
	s := parseOne(t, "let x = a or b;")
	let := s.(*Let)
	b := let.Init.(*Binary)
	if b.Op != "or" {
		t.Fatalf("expected or, got %s", b.Op)
	}
}

func TestParseNestedCall(t *testing.T) {
	s := parseOne(t, "let x = f(g(1));")
	let := s.(*Let)
	c := let.Init.(*Call)
	if len(c.Args) != 1 {
		t.Fatalf("expected 1 arg, got %d", len(c.Args))
	}
	if _, ok := c.Args[0].(*Call); !ok {
		t.Fatalf("expected nested Call")
	}
}

func TestParseChained(t *testing.T) {
	s := parseOne(t, "let x = a.b.c;")
	let := s.(*Let)
	f1 := let.Init.(*Field)
	if _, ok := f1.Object.(*Field); !ok {
		t.Fatalf("expected nested Field")
	}
}

func TestParseChainedCall(t *testing.T) {
	s := parseOne(t, "let x = a.foo().bar;")
	let := s.(*Let)
	f := let.Init.(*Field)
	if _, ok := f.Object.(*MethodCall); !ok {
		t.Fatalf("expected MethodCall object")
	}
}

func TestParseCommentBetweenStmts(t *testing.T) {
	stmts := parseStmts(t, "let a = 1; // comment\n let b = 2;")
	if len(stmts) != 2 {
		t.Fatalf("expected 2 stmts, got %d", len(stmts))
	}
}

func TestParseErrorRecovery(t *testing.T) {
	r := ParseSource("let x = ; let y = 1;", "<test>")
	// Should have at least one error and still parse the second stmt.
	if len(r.Errors) == 0 {
		t.Fatalf("expected at least one parse error")
	}
	if len(r.Program.Body) < 1 {
		t.Fatalf("expected at least one stmt after recovery, got %d", len(r.Program.Body))
	}
}

func TestParseErrorMissingSemi(t *testing.T) {
	r := ParseSource("let x = 1 let y = 2;", "<test>")
	if len(r.Errors) == 0 {
		t.Fatalf("expected error for missing semicolon")
	}
}

func TestParseExprStmtWithSemi(t *testing.T) {
	s := parseOne(t, "1 + 2;")
	if _, ok := s.(*ExprStmt); !ok {
		t.Fatalf("expected ExprStmt")
	}
}

func TestParseBlock(t *testing.T) {
	s := parseOne(t, "fn f() { let x = 1; x + 1 }")
	fd := s.(*FnDecl)
	if fd.Body.Expr == nil {
		t.Fatalf("expected trailing expr")
	}
	if len(fd.Body.Stmts) != 1 {
		t.Fatalf("expected 1 stmt, got %d", len(fd.Body.Stmts))
	}
}

func TestParseNestedFn(t *testing.T) {
	s := parseOne(t, "fn outer() { fn inner() -> int { return 1; } inner(); }")
	fd := s.(*FnDecl)
	if len(fd.Body.Stmts) != 2 {
		t.Fatalf("expected 2 stmts, got %d", len(fd.Body.Stmts))
	}
}

func TestParseGenericCall(t *testing.T) {
	s := parseOne(t, "let x = id<int>(5);")
	let := s.(*Let)
	c, ok := let.Init.(*Call)
	if !ok || c.TypeArgs == nil || len(c.TypeArgs) != 1 {
		t.Fatalf("expected Call with 1 type arg, got %+v", let.Init)
	}
}

func TestParseNonGenericLt(t *testing.T) {
	// `a < b` should parse as a comparison, not a generic call.
	s := parseOne(t, "let x = a < b;")
	let := s.(*Let)
	if _, ok := let.Init.(*Binary); !ok {
		t.Fatalf("expected Binary (lt), got %T", let.Init)
	}
}

func TestParseMapEmpty(t *testing.T) {
	s := parseOne(t, "let m = {};")
	let := s.(*Let)
	if _, ok := let.Init.(*Block); !ok {
		t.Fatalf("expected Block (empty), got %T", let.Init)
	}
}

func TestParseArrayTrailingComma(t *testing.T) {
	s := parseOne(t, "let x = [1, 2, 3,];")
	let := s.(*Let)
	a := let.Init.(*ArrayExpr)
	if len(a.Elements) != 3 {
		t.Fatalf("expected 3 elements, got %d", len(a.Elements))
	}
}

func TestParseStructExprTrailingComma(t *testing.T) {
	s := parseOne(t, "let p = Point { x: 1, y: 2, };")
	let := s.(*Let)
	se := let.Init.(*StructExpr)
	if len(se.Fields) != 2 {
		t.Fatalf("expected 2 fields, got %d", len(se.Fields))
	}
}

func TestParseEnumTrailingComma(t *testing.T) {
	s := parseOne(t, "enum E { A, B, C, }")
	e := s.(*EnumDecl)
	if len(e.Variants) != 3 {
		t.Fatalf("expected 3 variants, got %d", len(e.Variants))
	}
}

func TestParseStructDeclTrailingComma(t *testing.T) {
	s := parseOne(t, "struct S { a: int, b: int, }")
	sd := s.(*StructDecl)
	if len(sd.Fields) != 2 {
		t.Fatalf("expected 2 fields, got %d", len(sd.Fields))
	}
}

func TestParseSuperTrait(t *testing.T) {
	s := parseOne(t, "trait B: A { fn f(self); }")
	td := s.(*TraitDecl)
	if len(td.SuperTraits) != 1 || td.SuperTraits[0] != "A" {
		t.Fatalf("expected super trait A, got %+v", td.SuperTraits)
	}
}

func TestParseMultipleSuperTraits(t *testing.T) {
	s := parseOne(t, "trait C: A + B { fn f(self); }")
	td := s.(*TraitDecl)
	if len(td.SuperTraits) != 2 {
		t.Fatalf("expected 2 super traits, got %d", len(td.SuperTraits))
	}
}

func TestParseTypeParamConstraint(t *testing.T) {
	s := parseOne(t, "fn f<T: Ord>(x: T) -> T { return x; }")
	fd := s.(*FnDecl)
	if fd.Generics[0].Constraint != "Ord" {
		t.Fatalf("expected Ord constraint, got %q", fd.Generics[0].Constraint)
	}
}

func TestParseNestedStruct(t *testing.T) {
	s := parseOne(t, "struct Outer { inner: Inner, }")
	sd := s.(*StructDecl)
	if sd.Fields[0].Name != "inner" {
		t.Fatalf("expected field 'inner'")
	}
}

func TestParseTraitMethodDefault(t *testing.T) {
	s := parseOne(t, "trait T { fn f(self) -> int { return 1; } }")
	td := s.(*TraitDecl)
	if !td.Methods[0].HasDefault || td.Methods[0].Body == nil {
		t.Fatalf("expected default body")
	}
}

func TestParseIfWithoutElse(t *testing.T) {
	s := parseOne(t, "let x = if true { 1 };")
	let := s.(*Let)
	i := let.Init.(*If)
	if i.Else_ != nil {
		t.Fatalf("expected no else")
	}
}

func TestParseParenExpr(t *testing.T) {
	s := parseOne(t, "let x = (1);")
	let := s.(*Let)
	if _, ok := let.Init.(*Paren); !ok {
		t.Fatalf("expected Paren, got %T", let.Init)
	}
}

func TestParseChainedPostfix(t *testing.T) {
	// `a[0].b(1).c` — Index, then MethodCall, then Field.
	s := parseOne(t, "let x = a[0].b(1).c;")
	let := s.(*Let)
	f := let.Init.(*Field)
	if _, ok := f.Object.(*MethodCall); !ok {
		t.Fatalf("expected MethodCall object on Field, got %T", f.Object)
	}
}

func TestParseCommentsInBlock(t *testing.T) {
	stmts := parseStmts(t, "fn f() { /* c */ let x = 1; }")
	fd := stmts[0].(*FnDecl)
	if len(fd.Body.Stmts) != 1 {
		t.Fatalf("expected 1 stmt, got %d", len(fd.Body.Stmts))
	}
}

func TestParseStringEscapesInFString(t *testing.T) {
	s := parseOne(t, `let x = f"a\n{b}";`)
	let := s.(*Let)
	str := let.Init.(*StringLit)
	if len(str.Segments) != 2 || str.Segments[0].Value != "a\n" {
		t.Fatalf("expected first text segment 'a\\n', got %+v", str.Segments)
	}
}

func TestParseNegInPattern(t *testing.T) {
	s := parseOne(t, "let r = match n { -1 => 0, _ => 1, };")
	let := s.(*Let)
	m := let.Init.(*Match)
	if _, ok := m.Arms[0].Pattern.(*LitPat); !ok {
		t.Fatalf("expected LitPat with Unary inside")
	}
}

func TestParseStructExprEmpty(t *testing.T) {
	s := parseOne(t, "let p = Point {};")
	let := s.(*Let)
	se := let.Init.(*StructExpr)
	if len(se.Fields) != 0 {
		t.Fatalf("expected empty struct expr, got %d fields", len(se.Fields))
	}
}

func TestParseSelfParam(t *testing.T) {
	s := parseOne(t, "fn f(self) -> int { return 1; }")
	fd := s.(*FnDecl)
	if fd.Params[0].Name != "self" {
		t.Fatalf("expected param 'self', got %q", fd.Params[0].Name)
	}
}

func TestParseMultipleStmts(t *testing.T) {
	stmts := parseStmts(t, "let a = 1; let b = 2; let c = 3;")
	if len(stmts) != 3 {
		t.Fatalf("expected 3 stmts, got %d", len(stmts))
	}
}

func TestParseImportBare(t *testing.T) {
	s := parseOne(t, `import "mod";`)
	i := s.(*Import)
	if i.Path != "mod" || len(i.Names) != 0 {
		t.Fatalf("import wrong: %+v", i)
	}
}

func TestParseProgramLocSpansInput(t *testing.T) {
	r := ParseSource("let x = 1;", "<test>")
	if r.Program.Loc().Start.Offset != 0 {
		t.Fatalf("expected start offset 0, got %d", r.Program.Loc().Start.Offset)
	}
}

func TestParseTraitMethodNoDefault(t *testing.T) {
	s := parseOne(t, "trait T { fn f(self) -> int; }")
	td := s.(*TraitDecl)
	if td.Methods[0].HasDefault {
		t.Fatalf("expected HasDefault=false")
	}
}

func TestParseIfWithBlockCond(t *testing.T) {
	s := parseOne(t, "let x = if (a) { 1 } else { 2 };")
	let := s.(*Let)
	if _, ok := let.Init.(*If); !ok {
		t.Fatalf("expected If")
	}
}

func TestParseNestedTuples(t *testing.T) {
	s := parseOne(t, "let x = (1, (2, 3), 4);")
	let := s.(*Let)
	tup := let.Init.(*TupleExpr)
	if len(tup.Elements) != 3 {
		t.Fatalf("expected 3 elements, got %d", len(tup.Elements))
	}
	if _, ok := tup.Elements[1].(*TupleExpr); !ok {
		t.Fatalf("expected nested TupleExpr")
	}
}

func TestParseSelfMethod(t *testing.T) {
	s := parseOne(t, "let x = self.foo();")
	let := s.(*Let)
	mc := let.Init.(*MethodCall)
	if _, ok := mc.Object.(*SelfExpr); !ok {
		t.Fatalf("expected SelfExpr object, got %T", mc.Object)
	}
}

func TestParseGenericEnum(t *testing.T) {
	s := parseOne(t, "enum E<T> { Some(T), None, }")
	e := s.(*EnumDecl)
	if len(e.Generics) != 1 || e.Generics[0].Name != "T" {
		t.Fatalf("expected generic T, got %+v", e.Generics)
	}
}

func TestParseGenericStruct(t *testing.T) {
	s := parseOne(t, "struct V<T> { items: [T], }")
	sd := s.(*StructDecl)
	if len(sd.Generics) != 1 || sd.Generics[0].Name != "T" {
		t.Fatalf("expected generic T, got %+v", sd.Generics)
	}
}
