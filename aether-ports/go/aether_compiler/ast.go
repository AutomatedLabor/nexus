// Package aether_compiler is a Go port of the Aether compiler
// front-end (lexer + parser). It mirrors the TypeScript reference
// implementation in aether/core/lexer/lexer.ts and
// aether/core/parser/parser.ts, and the Python port in
// aether-ports/python/aether_compiler/.
//
// The Go port produces the same AST shape as the other ports so
// that any host tool can diff the JSON output across all three
// implementations.
package aether_compiler

// ----------------------------------------------------------------------------
// Source locations
// ----------------------------------------------------------------------------

// Position is a 1-based line/col plus 0-based absolute byte offset.
type Position struct {
	Line   int
	Col    int
	Offset int
}

// SourceLocation is a half-open [Start, End) source slice.
type SourceLocation struct {
	File  string
	Start Position
	End   Position
}

// MakeLoc builds a SourceLocation from a start and end Position.
func MakeLoc(start, end Position, file string) SourceLocation {
	return SourceLocation{File: file, Start: start, End: end}
}

// SourceLocationZero is the zero-valued location used for synthetic nodes.
var SourceLocationZero = SourceLocation{
	File:  "<synthetic>",
	Start: Position{Line: 1, Col: 1, Offset: 0},
	End:   Position{Line: 1, Col: 1, Offset: 0},
}

// ----------------------------------------------------------------------------
// Common sub-shapes
// ----------------------------------------------------------------------------

// Param is a function/lambda parameter.
type Param struct {
	Name string
	Type TypeNode // may be nil
	Loc  SourceLocation
}

// TypeParam is a generic type parameter (e.g. <T: Ord>).
type TypeParam struct {
	Name       string
	Constraint string // "" if none
	Loc        SourceLocation
}

// StructField is a struct field declaration.
type StructField struct {
	Name string
	Type TypeNode
	Loc  SourceLocation
}

// EnumVariantDecl is one variant of an enum.
type EnumVariantDecl struct {
	Name   string
	Kind   string // "unit" | "tuple" | "struct"
	Types  []TypeNode
	Fields []StructField
	Loc    SourceLocation
}

// StringSegment is one piece of a string literal — either raw text
// or an interpolation expression.
type StringSegment struct {
	Kind  string // "text" | "interp"
	Value string // raw source slice
	Expr  Expr   // only for "interp" segments; nil otherwise
}

// MatchArm is one arm of a match expression.
type MatchArm struct {
	Pattern Pattern
	Guard   Expr // may be nil
	Body    Expr
	Loc     SourceLocation
}

// MapEntry is one key/value pair in a map literal.
type MapEntry struct {
	Key   Expr
	Value Expr
	Loc   SourceLocation
}

// StructExprField is one field in a struct literal expression.
type StructExprField struct {
	Name  string
	Value Expr
	Loc   SourceLocation
}

// TraitMethodDecl is a method signature inside a trait declaration.
type TraitMethodDecl struct {
	Loc        SourceLocation
	Name       string
	Params     []Param
	Ret        TypeNode
	HasDefault bool
	Body       *Block // nil unless HasDefault
}

// TraitAssocTypeDecl is an associated type declaration inside a trait.
type TraitAssocTypeDecl struct {
	Name  string
	Bound string // "" if none
	Loc   SourceLocation
}

// ImplMethodDecl is a method definition inside an impl block.
type ImplMethodDecl struct {
	Loc    SourceLocation
	Name   string
	Params []Param
	Ret    TypeNode
	Body   Block
}

// ImplAssocTypeDecl is an associated type definition inside an impl block.
type ImplAssocTypeDecl struct {
	Name string
	Type TypeNode
	Loc  SourceLocation
}

// ----------------------------------------------------------------------------
// Expressions
// ----------------------------------------------------------------------------

// Expr is the marker interface implemented by every expression node.
// We use a closed interface with a sentinel method so that the type
// switch in the parser can't accidentally match a non-expression.
type Expr interface {
	exprNode()
	Loc() SourceLocation
}

// IntLit — integer literal.
type IntLit struct {
	Loc_  SourceLocation
	Value int64
}

func (n *IntLit) exprNode()           {}
func (n *IntLit) Loc() SourceLocation { return n.Loc_ }

// FloatLit — floating-point literal.
type FloatLit struct {
	Loc_  SourceLocation
	Value float64
}

func (n *FloatLit) exprNode()           {}
func (n *FloatLit) Loc() SourceLocation { return n.Loc_ }

// BoolLit — `true` or `false`.
type BoolLit struct {
	Loc_  SourceLocation
	Value bool
}

func (n *BoolLit) exprNode()           {}
func (n *BoolLit) Loc() SourceLocation { return n.Loc_ }

// StringLit — a string literal, possibly with interpolation segments.
type StringLit struct {
	Loc_     SourceLocation
	Segments []StringSegment
}

func (n *StringLit) exprNode()           {}
func (n *StringLit) Loc() SourceLocation { return n.Loc_ }

// CharLit — a single-character literal.
type CharLit struct {
	Loc_  SourceLocation
	Value string
}

func (n *CharLit) exprNode()           {}
func (n *CharLit) Loc() SourceLocation { return n.Loc_ }

// UnitLit — the `unit` keyword.
type UnitLit struct {
	Loc_ SourceLocation
}

func (n *UnitLit) exprNode()           {}
func (n *UnitLit) Loc() SourceLocation { return n.Loc_ }

// Ident — an identifier reference.
type Ident struct {
	Loc_ SourceLocation
	Name string
}

func (n *Ident) exprNode()           {}
func (n *Ident) Loc() SourceLocation { return n.Loc_ }

// Binary — a binary operator expression.
type Binary struct {
	Loc_  SourceLocation
	Op    string
	Left  Expr
	Right Expr
}

func (n *Binary) exprNode()           {}
func (n *Binary) Loc() SourceLocation { return n.Loc_ }

// Unary — a prefix unary expression.
type Unary struct {
	Loc_    SourceLocation
	Op      string
	Operand Expr
}

func (n *Unary) exprNode()           {}
func (n *Unary) Loc() SourceLocation { return n.Loc_ }

// Assign — `target = value` as an expression.
type Assign struct {
	Loc_   SourceLocation
	Target Expr
	Value  Expr
}

func (n *Assign) exprNode()           {}
func (n *Assign) Loc() SourceLocation { return n.Loc_ }

// CompoundAssign — `target += value` etc. as an expression.
type CompoundAssign struct {
	Loc_   SourceLocation
	Op     string
	Target Expr
	Value  Expr
}

func (n *CompoundAssign) exprNode()           {}
func (n *CompoundAssign) Loc() SourceLocation { return n.Loc_ }

// Call — a function call expression.
type Call struct {
	Loc_     SourceLocation
	Callee   Expr
	Args     []Expr
	TypeArgs []TypeNode // may be nil
}

func (n *Call) exprNode()           {}
func (n *Call) Loc() SourceLocation { return n.Loc_ }

// Index — an indexing expression `obj[idx]`.
type Index struct {
	Loc_   SourceLocation
	Object Expr
	Index  Expr
}

func (n *Index) exprNode()           {}
func (n *Index) Loc() SourceLocation { return n.Loc_ }

// Field — a field-access expression `obj.name`.
type Field struct {
	Loc_   SourceLocation
	Object Expr
	Name   string
}

func (n *Field) exprNode()           {}
func (n *Field) Loc() SourceLocation { return n.Loc_ }

// MethodCall — a method-call expression `obj.name(args...)`.
type MethodCall struct {
	Loc_   SourceLocation
	Object Expr
	Name   string
	Args   []Expr
}

func (n *MethodCall) exprNode()           {}
func (n *MethodCall) Loc() SourceLocation { return n.Loc_ }

// TupleExpr — a tuple literal.
type TupleExpr struct {
	Loc_     SourceLocation
	Elements []Expr
}

func (n *TupleExpr) exprNode()           {}
func (n *TupleExpr) Loc() SourceLocation { return n.Loc_ }

// ArrayExpr — an array literal.
type ArrayExpr struct {
	Loc_     SourceLocation
	Elements []Expr
}

func (n *ArrayExpr) exprNode()           {}
func (n *ArrayExpr) Loc() SourceLocation { return n.Loc_ }

// MapExpr — a map literal.
type MapExpr struct {
	Loc_    SourceLocation
	Entries []MapEntry
}

func (n *MapExpr) exprNode()           {}
func (n *MapExpr) Loc() SourceLocation { return n.Loc_ }

// StructExpr — a struct literal `Name { fields }`.
type StructExpr struct {
	Loc_   SourceLocation
	Name   string
	Fields []StructExprField
	Spread Expr // may be nil
}

func (n *StructExpr) exprNode()           {}
func (n *StructExpr) Loc() SourceLocation { return n.Loc_ }

// EnumVariant — an enum-variant constructor expression `Foo::Bar(args...)`.
type EnumVariant struct {
	Loc_     SourceLocation
	EnumName string
	Variant  string
	Args     []Expr
}

func (n *EnumVariant) exprNode()           {}
func (n *EnumVariant) Loc() SourceLocation { return n.Loc_ }

// Lambda — a lambda expression `fn (params) -> type { body }`.
type Lambda struct {
	Loc_   SourceLocation
	Params []Param
	Ret    TypeNode // may be nil
	Body   *Block
}

func (n *Lambda) exprNode()           {}
func (n *Lambda) Loc() SourceLocation { return n.Loc_ }

// If — an `if cond then else?` expression.
type If struct {
	Loc_  SourceLocation
	Cond  Expr
	Then  *Block
	Else_ Expr // may be nil
}

func (n *If) exprNode()           {}
func (n *If) Loc() SourceLocation { return n.Loc_ }

// Match — a `match scrutinee { arms }` expression.
type Match struct {
	Loc_      SourceLocation
	Scrutinee Expr
	Arms      []MatchArm
}

func (n *Match) exprNode()           {}
func (n *Match) Loc() SourceLocation { return n.Loc_ }

// Block — a `{ stmts...; expr? }` block expression.
type Block struct {
	Loc_  SourceLocation
	Stmts []Stmt
	Expr  Expr // trailing expression; may be nil
}

func (n *Block) exprNode()           {}
func (n *Block) Loc() SourceLocation { return n.Loc_ }

// Paren — a parenthesised expression.
type Paren struct {
	Loc_ SourceLocation
	Expr Expr
}

func (n *Paren) exprNode()           {}
func (n *Paren) Loc() SourceLocation { return n.Loc_ }

// Cast — a `expr as type` expression (deprecated, kept for compatibility).
type Cast struct {
	Loc_ SourceLocation
	Expr Expr
	Type TypeNode
}

func (n *Cast) exprNode()           {}
func (n *Cast) Loc() SourceLocation { return n.Loc_ }

// Range — a `start..end` or `start..=end` expression.
type Range struct {
	Loc_      SourceLocation
	Start     Expr // may be nil for open ranges
	End       Expr
	Inclusive bool
}

func (n *Range) exprNode()           {}
func (n *Range) Loc() SourceLocation { return n.Loc_ }

// As — a `expr as type` expression (the v3 form).
type As struct {
	Loc_ SourceLocation
	Expr Expr
	Type TypeNode
}

func (n *As) exprNode()           {}
func (n *As) Loc() SourceLocation { return n.Loc_ }

// ErrorProp — `expr?` error-propagation.
type ErrorProp struct {
	Loc_ SourceLocation
	Expr Expr
}

func (n *ErrorProp) exprNode()           {}
func (n *ErrorProp) Loc() SourceLocation { return n.Loc_ }

// TupleField — `obj.0` tuple-field access.
type TupleField struct {
	Loc_   SourceLocation
	Object Expr
	Index  int
}

func (n *TupleField) exprNode()           {}
func (n *TupleField) Loc() SourceLocation { return n.Loc_ }

// SelfExpr — the `self` keyword.
type SelfExpr struct {
	Loc_ SourceLocation
}

func (n *SelfExpr) exprNode()           {}
func (n *SelfExpr) Loc() SourceLocation { return n.Loc_ }

// Spread — `..expr` spread.
type Spread struct {
	Loc_ SourceLocation
	Expr Expr
}

func (n *Spread) exprNode()           {}
func (n *Spread) Loc() SourceLocation { return n.Loc_ }

// Borrow — `&expr` or `&mut expr`.
type Borrow struct {
	Loc_    SourceLocation
	Operand Expr
	Mutable bool
}

func (n *Borrow) exprNode()           {}
func (n *Borrow) Loc() SourceLocation { return n.Loc_ }

// Deref — `*expr` dereference.
type Deref struct {
	Loc_    SourceLocation
	Operand Expr
}

func (n *Deref) exprNode()           {}
func (n *Deref) Loc() SourceLocation { return n.Loc_ }

// Move — `move expr` move expression.
type Move struct {
	Loc_    SourceLocation
	Operand Expr
}

func (n *Move) exprNode()           {}
func (n *Move) Loc() SourceLocation { return n.Loc_ }

// ----------------------------------------------------------------------------
// Statements
// ----------------------------------------------------------------------------

// Stmt is the marker interface implemented by every statement node.
type Stmt interface {
	stmtNode()
	Loc() SourceLocation
}

// Let — `let name = init;` or `let name: type = init;`.
type Let struct {
	Loc_ SourceLocation
	Name string
	Type TypeNode // may be nil
	Init Expr
}

func (n *Let) stmtNode()           {}
func (n *Let) Loc() SourceLocation { return n.Loc_ }

// MutLet — `let mut name = init;`.
type MutLet struct {
	Loc_ SourceLocation
	Name string
	Type TypeNode
	Init Expr
}

func (n *MutLet) stmtNode()           {}
func (n *MutLet) Loc() SourceLocation { return n.Loc_ }

// Const — `const name = init;`.
type Const struct {
	Loc_ SourceLocation
	Name string
	Type TypeNode
	Init Expr
}

func (n *Const) stmtNode()           {}
func (n *Const) Loc() SourceLocation { return n.Loc_ }

// ExprStmt — an expression used as a statement.
type ExprStmt struct {
	Loc_ SourceLocation
	Expr Expr
}

func (n *ExprStmt) stmtNode()           {}
func (n *ExprStmt) Loc() SourceLocation { return n.Loc_ }

// FnDecl — `fn name(params) -> type { body }`.
type FnDecl struct {
	Loc_     SourceLocation
	Name     string
	Generics []TypeParam
	Params   []Param
	Ret      TypeNode
	Body     *Block
	Exported bool
}

func (n *FnDecl) stmtNode()           {}
func (n *FnDecl) Loc() SourceLocation { return n.Loc_ }

// EnumDecl — `enum Name { variants }`.
type EnumDecl struct {
	Loc_     SourceLocation
	Name     string
	Generics []TypeParam
	Variants []EnumVariantDecl
	Derive   []string // may be nil
}

func (n *EnumDecl) stmtNode()           {}
func (n *EnumDecl) Loc() SourceLocation { return n.Loc_ }

// StructDecl — `struct Name { fields }`.
type StructDecl struct {
	Loc_     SourceLocation
	Name     string
	Generics []TypeParam
	Fields   []StructField
	Derive   []string
}

func (n *StructDecl) stmtNode()           {}
func (n *StructDecl) Loc() SourceLocation { return n.Loc_ }

// TypeAlias — `type Name = Other;`.
type TypeAlias struct {
	Loc_     SourceLocation
	Name     string
	Generics []TypeParam
	Type     TypeNode
}

func (n *TypeAlias) stmtNode()           {}
func (n *TypeAlias) Loc() SourceLocation { return n.Loc_ }

// Return — `return expr?;` (as a statement) or `return expr` used
// in expression position (the parser allows this to mirror the
// Python port's permissive handling of `return` inside a tuple/call).
type Return struct {
	Loc_ SourceLocation
	Expr Expr // may be nil
}

func (n *Return) stmtNode()           {}
func (n *Return) exprNode()           {}
func (n *Return) Loc() SourceLocation { return n.Loc_ }

// Break — `break;`.
type Break struct {
	Loc_ SourceLocation
}

func (n *Break) stmtNode()           {}
func (n *Break) Loc() SourceLocation { return n.Loc_ }

// Continue — `continue;`.
type Continue struct {
	Loc_ SourceLocation
}

func (n *Continue) stmtNode()           {}
func (n *Continue) Loc() SourceLocation { return n.Loc_ }

// While — `while cond { body }`.
type While struct {
	Loc_ SourceLocation
	Cond Expr
	Body *Block
}

func (n *While) stmtNode()           {}
func (n *While) Loc() SourceLocation { return n.Loc_ }

// ForIn — `for var in iterable { body }`.
type ForIn struct {
	Loc_     SourceLocation
	VarName  string
	Iterable Expr
	Body     *Block
}

func (n *ForIn) stmtNode()           {}
func (n *ForIn) Loc() SourceLocation { return n.Loc_ }

// Import — `import { names } from "path";` (parsed but not resolved).
type Import struct {
	Loc_  SourceLocation
	Path  string
	Names []string
}

func (n *Import) stmtNode()           {}
func (n *Import) Loc() SourceLocation { return n.Loc_ }

// Print — `print(expr);`.
type Print struct {
	Loc_ SourceLocation
	Expr Expr
}

func (n *Print) stmtNode()           {}
func (n *Print) Loc() SourceLocation { return n.Loc_ }

// AssignStmt — `target = value;` (or compound variants).
type AssignStmt struct {
	Loc_   SourceLocation
	Target Expr
	Value  Expr
}

func (n *AssignStmt) stmtNode()           {}
func (n *AssignStmt) Loc() SourceLocation { return n.Loc_ }

// BlockStmt — a bare `{ ... }` used as a statement.
type BlockStmt struct {
	Loc_ SourceLocation
	Body []Stmt
}

func (n *BlockStmt) stmtNode()           {}
func (n *BlockStmt) Loc() SourceLocation { return n.Loc_ }

// TraitDecl — `trait Name { ... }`.
type TraitDecl struct {
	Loc_        SourceLocation
	Name        string
	TypeParams  []TypeParam
	SuperTraits []string
	Methods     []TraitMethodDecl
	AssocTypes  []TraitAssocTypeDecl
}

func (n *TraitDecl) stmtNode()           {}
func (n *TraitDecl) Loc() SourceLocation { return n.Loc_ }

// ImplBlock — `impl Trait for Type { ... }`.
type ImplBlock struct {
	Loc_          SourceLocation
	TraitName     string
	TraitTypeArgs []TypeNode
	ImplType      TypeNode
	TypeParams    []TypeParam
	Methods       []ImplMethodDecl
	AssocTypes    []ImplAssocTypeDecl
}

func (n *ImplBlock) stmtNode()           {}
func (n *ImplBlock) Loc() SourceLocation { return n.Loc_ }

// ----------------------------------------------------------------------------
// Patterns
// ----------------------------------------------------------------------------

// Pattern is the marker interface implemented by every pattern node.
type Pattern interface {
	patNode()
	Loc() SourceLocation
}

// WildcardPat — the `_` pattern.
type WildcardPat struct {
	Loc_ SourceLocation
}

func (n *WildcardPat) patNode()            {}
func (n *WildcardPat) Loc() SourceLocation { return n.Loc_ }

// BindPat — a binding pattern `name` or `mut name: type`.
type BindPat struct {
	Loc_ SourceLocation
	Name string
	Mut  bool
	Type TypeNode
}

func (n *BindPat) patNode()            {}
func (n *BindPat) Loc() SourceLocation { return n.Loc_ }

// LitPat — a literal pattern (e.g. `1`, `true`, `'a'`).
type LitPat struct {
	Loc_  SourceLocation
	Value Expr
}

func (n *LitPat) patNode()            {}
func (n *LitPat) Loc() SourceLocation { return n.Loc_ }

// TuplePat — `(p1, p2, ...)`.
type TuplePat struct {
	Loc_     SourceLocation
	Elements []Pattern
}

func (n *TuplePat) patNode()            {}
func (n *TuplePat) Loc() SourceLocation { return n.Loc_ }

// ArrayPat — `[p1, p2, .., pN]`.
type ArrayPat struct {
	Loc_     SourceLocation
	Elements []Pattern
	Rest     int // -1 if no `..`; otherwise the position of the rest slot
}

func (n *ArrayPat) patNode()            {}
func (n *ArrayPat) Loc() SourceLocation { return n.Loc_ }

// StructPatField is one field binding in a struct pattern.
type StructPatField struct {
	Name    string
	Pattern Pattern
	Loc     SourceLocation
}

// StructPat — `Name { f1: p1, f2, .. }`.
type StructPat struct {
	Loc_   SourceLocation
	Name   string
	Fields []StructPatField
	Rest   bool
}

func (n *StructPat) patNode()            {}
func (n *StructPat) Loc() SourceLocation { return n.Loc_ }

// EnumPat — `Foo::Bar(p1, p2)`.
type EnumPat struct {
	Loc_        SourceLocation
	EnumName    string
	Variant     string
	Subpatterns []Pattern
}

func (n *EnumPat) patNode()            {}
func (n *EnumPat) Loc() SourceLocation { return n.Loc_ }

// OrPat — `p1 | p2 | p3`.
type OrPat struct {
	Loc_     SourceLocation
	Patterns []Pattern
}

func (n *OrPat) patNode()            {}
func (n *OrPat) Loc() SourceLocation { return n.Loc_ }

// RestPat — the `..` pattern (inside array/struct patterns).
type RestPat struct {
	Loc_ SourceLocation
}

func (n *RestPat) patNode()            {}
func (n *RestPat) Loc() SourceLocation { return n.Loc_ }

// ----------------------------------------------------------------------------
// Type nodes
// ----------------------------------------------------------------------------

// TypeNode is the marker interface implemented by every type node.
type TypeNode interface {
	typeNode()
	Loc() SourceLocation
}

// NamedType — `Foo` (no generic args).
type NamedType struct {
	Loc_ SourceLocation
	Name string
}

func (n *NamedType) typeNode()           {}
func (n *NamedType) Loc() SourceLocation { return n.Loc_ }

// GenericType — `Foo<args...>`.
type GenericType struct {
	Loc_ SourceLocation
	Name string
	Args []TypeNode
}

func (n *GenericType) typeNode()           {}
func (n *GenericType) Loc() SourceLocation { return n.Loc_ }

// FuncType — `fn (T1, T2) -> R`.
type FuncType struct {
	Loc_   SourceLocation
	Params []TypeNode
	Ret    TypeNode
}

func (n *FuncType) typeNode()           {}
func (n *FuncType) Loc() SourceLocation { return n.Loc_ }

// TupleType — `(T1, T2, ...)`.
type TupleType struct {
	Loc_  SourceLocation
	Types []TypeNode
}

func (n *TupleType) typeNode()           {}
func (n *TupleType) Loc() SourceLocation { return n.Loc_ }

// ArrayType — `[T]`.
type ArrayType struct {
	Loc_ SourceLocation
	Elem TypeNode
}

func (n *ArrayType) typeNode()           {}
func (n *ArrayType) Loc() SourceLocation { return n.Loc_ }

// MapType — `map[K]V`.
type MapType struct {
	Loc_  SourceLocation
	Key   TypeNode
	Value TypeNode
}

func (n *MapType) typeNode()           {}
func (n *MapType) Loc() SourceLocation { return n.Loc_ }

// OptionType — `option<T>`.
type OptionType struct {
	Loc_  SourceLocation
	Inner TypeNode
}

func (n *OptionType) typeNode()           {}
func (n *OptionType) Loc() SourceLocation { return n.Loc_ }

// ResultType — `result<T, E>`.
type ResultType struct {
	Loc_ SourceLocation
	Ok   TypeNode
	Err  TypeNode
}

func (n *ResultType) typeNode()           {}
func (n *ResultType) Loc() SourceLocation { return n.Loc_ }

// PrimitiveType — `int`, `float`, `bool`, `string`, `char`.
type PrimitiveType struct {
	Loc_ SourceLocation
	Name string
}

func (n *PrimitiveType) typeNode()           {}
func (n *PrimitiveType) Loc() SourceLocation { return n.Loc_ }

// UnitType — the `unit` type.
type UnitType struct {
	Loc_ SourceLocation
}

func (n *UnitType) typeNode()           {}
func (n *UnitType) Loc() SourceLocation { return n.Loc_ }

// DynType — `dyn Trait`.
type DynType struct {
	Loc_      SourceLocation
	TraitName string
}

func (n *DynType) typeNode()           {}
func (n *DynType) Loc() SourceLocation { return n.Loc_ }

// ----------------------------------------------------------------------------
// Program
// ----------------------------------------------------------------------------

// Program is the root AST node — a list of top-level statements.
type Program struct {
	Loc_ SourceLocation
	Body []Stmt
}

// Loc returns the source location of the program (spans the whole input).
func (n *Program) Loc() SourceLocation { return n.Loc_ }

// ----------------------------------------------------------------------------
// Helper predicates
// ----------------------------------------------------------------------------

// IsExpr reports whether n is an expression node.
func IsExpr(n interface{}) bool {
	_, ok := n.(Expr)
	return ok
}

// IsStmt reports whether n is a statement node.
func IsStmt(n interface{}) bool {
	_, ok := n.(Stmt)
	return ok
}
