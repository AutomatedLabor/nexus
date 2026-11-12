/**
 * aether/core/ast/ast.ts
 * ======================
 * The Aether Abstract Syntax Tree (AST).
 *
 * Aether is a statically-typed, expression-oriented language with
 * ML/Rust/TypeScript influences. This module defines the full AST as a
 * discriminated union of ~80 node kinds covering expressions, statements,
 * patterns, type annotations, and the top-level Program.
 *
 * Design notes
 * ------------
 * - Every node carries a `loc: SourceLocation` referencing the slice of
 *   source code it came from. `SOURCE_LOCATION_ZERO` is provided for nodes
 *   synthesized at runtime (e.g. desugaring).
 * - The `kind` string discriminates node variants and is also stable across
 *   serialization, so AST JSON can be diffed and reloaded.
 * - Helpers: `n(kind, props, loc)` constructs a typed node, `isExpr`,
 *   `isStmt`, `isPattern`, `isTypeNode`, plus per-kind type guards.
 *
 * Simplified in v1 (documented limitations)
 * -----------------------------------------
 * - `Import` is parsed but never resolved. Single-file programs only.
 * - `Spread` is parsed into AST nodes but the evaluator desugars it only for
 *   array/struct construction. Deep spread (`...x.y.z`) is supported syntactically.
 * - Trait / impl / dyn are modelled as first-class Stmt and TypeNode kinds
 *   (added in v3 by `aether/core/traits/traits.ts`). `#[derive(...)]`
 *   attributes attach to struct/enum decls via the optional `derive` field.
 */
//----------------------------------------------------------------------------
// Source locations
//----------------------------------------------------------------------------
export interface Position {
  line: number; // 1-based
  col: number; // 1-based
  offset: number; // 0-based absolute char index
}

export interface SourceLocation {
  file: string;
  start: Position;
  end: Position;
}

export const SOURCE_LOCATION_ZERO: SourceLocation = {
  file: "<synthetic>",
  start: { line: 1, col: 1, offset: 0 },
  end: { line: 1, col: 1, offset: 0 },
};

export function loc(start: Position, end: Position, file = "<unknown>"): SourceLocation {
  return { file, start, end };
}

export function mergeLoc(a: SourceLocation, b: SourceLocation): SourceLocation {
  const startOff = Math.min(a.start.offset, b.start.offset);
  const endOff = Math.max(a.end.offset, b.end.offset);
  // Use whichever is the earlier start
  const s = a.start.offset <= b.start.offset ? a.start : b.start;
  const e = a.end.offset >= b.end.offset ? a.end : b.end;
  void startOff;
  void endOff;
  return { file: a.file, start: s, end: e };
}

//----------------------------------------------------------------------------
// Common sub-shapes
//----------------------------------------------------------------------------
export interface Param {
  name: string;
  type?: TypeNode;
  loc: SourceLocation;
}

export interface TypeParam {
  name: string;
  constraint?: string; // trait name like "Ord"
  loc: SourceLocation;
}

export interface StructField {
  name: string;
  type: TypeNode;
  loc: SourceLocation;
}

/**
 * A method signature inside a `trait` declaration.
 *  - `hasDefault: false` → required method (no body).
 *  - `hasDefault: true`  → default method (body is in `body`).
 */
export interface TraitMethodDecl {
  kind: "TraitMethodDecl";
  loc: SourceLocation;
  name: string;
  params: Param[];
  ret?: TypeNode;
  hasDefault: boolean;
  body?: Block;
}

/** An associated type declared inside a trait (`type Item;`). */
export interface TraitAssocTypeDecl {
  name: string;
  bound?: string;
  loc: SourceLocation;
}

/** A method definition inside an `impl` block. */
export interface ImplMethodDecl {
  kind: "ImplMethodDecl";
  loc: SourceLocation;
  name: string;
  params: Param[];
  ret?: TypeNode;
  body: Block;
}

/** An associated-type binding inside an `impl` block (`type Item = int;`). */
export interface ImplAssocTypeDecl {
  name: string;
  type: TypeNode;
  loc: SourceLocation;
}

export interface EnumVariantDecl {
  name: string;
  // A unit variant: kind = "unit"
  // A tuple variant: kind = "tuple", types = [...]
  // A struct variant: kind = "struct", fields = [...]
  kind: "unit" | "tuple" | "struct";
  types?: TypeNode[];
  fields?: StructField[];
  loc: SourceLocation;
}

export interface StringSegment {
  // Literal text or an interpolated expression source. The lexer records the
  // raw inner text; the parser re-lexes/parses `interp` segments into an Expr.
  kind: "text" | "interp";
  value: string;
  // Only present after parsing for `interp` segments.
  expr?: Expr;
}

export interface MatchArm {
  pattern: Pattern;
  guard?: Expr | null;
  body: Expr; // arms are expression bodies; can be a Block
  loc: SourceLocation;
}

export interface MapEntry {
  key: Expr;
  value: Expr;
  loc: SourceLocation;
}

export interface StructExprField {
  name: string;
  value: Expr;
  loc: SourceLocation;
}

//-----------------------------------------------------------------------------
// EXPRESSIONS
//-----------------------------------------------------------------------------
export type Expr =
  | IntLit
  | FloatLit
  | BoolLit
  | StringLit
  | CharLit
  | UnitLit
  | Ident
  | Binary
  | Unary
  | Assign
  | CompoundAssign
  | Call
  | Index
  | Field
  | MethodCall
  | TupleExpr
  | ArrayExpr
  | MapExpr
  | StructExpr
  | EnumVariant
  | Lambda
  | If
  | Match
  | Block
  | Paren
  | Cast
  | Range
  | As
  | ErrorProp
  | TupleField
  | SelfExpr
  | Spread
  | Return;

export interface IntLit { kind: "IntLit"; loc: SourceLocation; value: number; }
export interface FloatLit { kind: "FloatLit"; loc: SourceLocation; value: number; }
export interface BoolLit { kind: "BoolLit"; loc: SourceLocation; value: boolean; }
export interface StringLit { kind: "StringLit"; loc: SourceLocation; segments: StringSegment[]; }
export interface CharLit { kind: "CharLit"; loc: SourceLocation; value: string; }
export interface UnitLit { kind: "UnitLit"; loc: SourceLocation; }
export interface Ident { kind: "Ident"; loc: SourceLocation; name: string; }
export interface Binary { kind: "Binary"; loc: SourceLocation; op: string; left: Expr; right: Expr; }
export interface Unary { kind: "Unary"; loc: SourceLocation; op: string; operand: Expr; }
export interface Assign { kind: "Assign"; loc: SourceLocation; target: Expr; value: Expr; }
export interface CompoundAssign { kind: "CompoundAssign"; loc: SourceLocation; op: string; target: Expr; value: Expr; }
export interface Call { kind: "Call"; loc: SourceLocation; callee: Expr; args: Expr[]; typeArgs?: TypeNode[]; }
export interface Index { kind: "Index"; loc: SourceLocation; object: Expr; index: Expr; }
export interface Field { kind: "Field"; loc: SourceLocation; object: Expr; name: string; }
export interface MethodCall { kind: "MethodCall"; loc: SourceLocation; object: Expr; name: string; args: Expr[];
  /**
   * Filled in by the type-checker when the receiver's type has a trait
   * method named `name`. Carries the resolved (traitName, implTypeName,
   * methodName) triple the evaluator uses to dispatch the call. When unset,
   * the evaluator falls back to the legacy free-function dispatch path.
   */
  __traitImpl?: { traitName: string; implTypeName: string; methodName: string };
  /** True iff the receiver is a `dyn Trait` value (vtable dispatch). */
  __dynDispatch?: boolean;
}
export interface TupleExpr { kind: "TupleExpr"; loc: SourceLocation; elements: Expr[]; }
export interface ArrayExpr { kind: "ArrayExpr"; loc: SourceLocation; elements: Expr[]; }
export interface MapExpr { kind: "MapExpr"; loc: SourceLocation; entries: MapEntry[]; }
export interface StructExpr { kind: "StructExpr"; loc: SourceLocation; name: string; fields: StructExprField[]; spread?: Expr | null; }
export interface EnumVariant { kind: "EnumVariant"; loc: SourceLocation; enumName: string; variant: string; args: Expr[]; }
export interface Lambda { kind: "Lambda"; loc: SourceLocation; params: Param[]; ret?: TypeNode; body: Expr; }
export interface If { kind: "If"; loc: SourceLocation; cond: Expr; then: Expr; else?: Expr | null; }
export interface Match { kind: "Match"; loc: SourceLocation; scrutinee: Expr; arms: MatchArm[]; }
export interface Block { kind: "Block"; loc: SourceLocation; stmts: Stmt[]; expr?: Expr | null; }
export interface Paren { kind: "Paren"; loc: SourceLocation; expr: Expr; }
export interface Cast { kind: "Cast"; loc: SourceLocation; expr: Expr; type: TypeNode; } // legacy alias of As
export interface Range { kind: "Range"; loc: SourceLocation; start: Expr; end: Expr; inclusive: boolean; }
export interface As { kind: "As"; loc: SourceLocation; expr: Expr; type: TypeNode; }
export interface ErrorProp { kind: "ErrorProp"; loc: SourceLocation; expr: Expr; }
export interface TupleField { kind: "TupleField"; loc: SourceLocation; object: Expr; index: number; }
export interface SelfExpr { kind: "SelfExpr"; loc: SourceLocation; }
export interface Spread { kind: "Spread"; loc: SourceLocation; expr: Expr; }

//-----------------------------------------------------------------------------
// STATEMENTS
//-----------------------------------------------------------------------------
export type Stmt =
  | Let
  | MutLet
  | Const
  | ExprStmt
  | FnDecl
  | EnumDecl
  | StructDecl
  | TypeAlias
  | Return
  | Break
  | Continue
  | While
  | ForIn
  | Import
  | Print
  | AssignStmt
  | BlockStmt
  | TraitDecl
  | ImplBlock;

export interface Let { kind: "Let"; loc: SourceLocation; name: string; type?: TypeNode; init: Expr; }
export interface MutLet { kind: "MutLet"; loc: SourceLocation; name: string; type?: TypeNode; init: Expr; }
export interface Const { kind: "Const"; loc: SourceLocation; name: string; type?: TypeNode; init: Expr; }
export interface ExprStmt { kind: "ExprStmt"; loc: SourceLocation; expr: Expr; }
export interface FnDecl {
  kind: "FnDecl";
  loc: SourceLocation;
  name: string;
  generics: TypeParam[];
  params: Param[];
  ret?: TypeNode;
  body: Block;
  exported?: boolean;
}
export interface EnumDecl {
  kind: "EnumDecl";
  loc: SourceLocation;
  name: string;
  generics: TypeParam[];
  variants: EnumVariantDecl[];
  /** Optional `#[derive(Show, Eq, ...)]` attribute. */
  derive?: string[];
}
export interface StructDecl {
  kind: "StructDecl";
  loc: SourceLocation;
  name: string;
  generics: TypeParam[];
  fields: StructField[];
  /** Optional `#[derive(Show, Eq, ...)]` attribute. */
  derive?: string[];
}
export interface TypeAlias {
  kind: "TypeAlias";
  loc: SourceLocation;
  name: string;
  generics: TypeParam[];
  type: TypeNode;
}
export interface Return { kind: "Return"; loc: SourceLocation; expr?: Expr | null; }
export interface Break { kind: "Break"; loc: SourceLocation; }
export interface Continue { kind: "Continue"; loc: SourceLocation; }
export interface While { kind: "While"; loc: SourceLocation; cond: Expr; body: Block; }
export interface ForIn { kind: "ForIn"; loc: SourceLocation; varName: string; iterable: Expr; body: Block; }
export interface Import { kind: "Import"; loc: SourceLocation; path: string; names: string[]; }
export interface Print { kind: "Print"; loc: SourceLocation; expr: Expr; }
export interface AssignStmt { kind: "AssignStmt"; loc: SourceLocation; target: Expr; value: Expr; }
export interface BlockStmt { kind: "BlockStmt"; loc: SourceLocation; body: Stmt[]; }

/**
 * `trait Name<T>: Sup1 + Sup2 { fn method(...); type Item; fn default_method(...) {...} }`
 */
export interface TraitDecl {
  kind: "TraitDecl";
  loc: SourceLocation;
  name: string;
  typeParams: TypeParam[];
  superTraits: string[];
  methods: TraitMethodDecl[];
  assocTypes: TraitAssocTypeDecl[];
}

/**
 * `impl<...> TraitName for Type { fn method(...) {...} type Item = T; }`
 *
 * Also supports `impl<...> TraitName<TArgs> for Type { ... }` — but for v1
 * we infer the trait's type args from the impl's `for Type` when omitted
 * (most common case).
 */
export interface ImplBlock {
  kind: "ImplBlock";
  loc: SourceLocation;
  traitName: string;
  /** Optional trait generic args (rarely used in v1 — usually inferred). */
  traitTypeArgs?: TypeNode[];
  implType: TypeNode;
  typeParams: TypeParam[];
  methods: ImplMethodDecl[];
  assocTypes: ImplAssocTypeDecl[];
  /** True iff this impl was synthesized by `#[derive(...)]` (sema fills in). */
  synthesized?: boolean;
}

//-----------------------------------------------------------------------------
// PATTERNS
//-----------------------------------------------------------------------------
export type Pattern =
  | WildcardPat
  | BindPat
  | LitPat
  | TuplePat
  | ArrayPat
  | StructPat
  | EnumPat
  | OrPat
  | RestPat;

export interface WildcardPat { kind: "WildcardPat"; loc: SourceLocation; }
export interface BindPat { kind: "BindPat"; loc: SourceLocation; name: string; mut?: boolean; type?: TypeNode; }
export interface LitPat { kind: "LitPat"; loc: SourceLocation; value: Expr; }
export interface TuplePat { kind: "TuplePat"; loc: SourceLocation; elements: Pattern[]; }
export interface ArrayPat { kind: "ArrayPat"; loc: SourceLocation; elements: Pattern[]; rest?: number | null; }
export interface StructPat {
  kind: "StructPat";
  loc: SourceLocation;
  name: string;
  fields: { name: string; pattern: Pattern; loc: SourceLocation }[];
  rest?: boolean;
}
export interface EnumPat {
  kind: "EnumPat";
  loc: SourceLocation;
  enumName: string;
  variant: string;
  subpatterns: Pattern[];
}
export interface OrPat { kind: "OrPat"; loc: SourceLocation; patterns: Pattern[]; }
export interface RestPat { kind: "RestPat"; loc: SourceLocation; }

//-----------------------------------------------------------------------------
// AST-LEVEL TYPES (syntactic)
//-----------------------------------------------------------------------------
export type TypeNode =
  | NamedType
  | GenericType
  | FuncType
  | TupleType
  | ArrayType
  | MapType
  | OptionType
  | ResultType
  | PrimitiveType
  | UnitType
  | DynType;

export interface NamedType { kind: "NamedType"; loc: SourceLocation; name: string; }
export interface GenericType { kind: "GenericType"; loc: SourceLocation; name: string; args: TypeNode[]; }
export interface FuncType { kind: "FuncType"; loc: SourceLocation; params: TypeNode[]; ret: TypeNode; }
export interface TupleType { kind: "TupleType"; loc: SourceLocation; types: TypeNode[]; }
export interface ArrayType { kind: "ArrayType"; loc: SourceLocation; elem: TypeNode; }
export interface MapType { kind: "MapType"; loc: SourceLocation; key: TypeNode; value: TypeNode; }
export interface OptionType { kind: "OptionType"; loc: SourceLocation; inner: TypeNode; }
export interface ResultType { kind: "ResultType"; loc: SourceLocation; ok: TypeNode; err: TypeNode; }
export interface PrimitiveType { kind: "PrimitiveType"; loc: SourceLocation; name: string; }
export interface UnitType { kind: "UnitType"; loc: SourceLocation; }
/** `dyn TraitName` — a trait-object type. Object-safety is checked by sema. */
export interface DynType { kind: "DynType"; loc: SourceLocation; traitName: string; }

//-----------------------------------------------------------------------------
// Program root
//-----------------------------------------------------------------------------
export interface Program {
  kind: "Program";
  loc: SourceLocation;
  body: Stmt[];
}

//-----------------------------------------------------------------------------
// Master union
//-----------------------------------------------------------------------------
export type Node = Program | Expr | Stmt | Pattern | TypeNode | MatchArm | MapEntry | StructExprField | Param | TypeParam | StructField | EnumVariantDecl | StringSegment | TraitMethodDecl | ImplMethodDecl | TraitAssocTypeDecl | ImplAssocTypeDecl;

//-----------------------------------------------------------------------------
// Helper constructor and type guards
//----------------------------------------------------------------------------

/** Any node that has a `loc` field. */
export interface Locatable { loc: SourceLocation; }

/** Construct an AST node with the given kind and properties. */
export function n<K extends Node["kind"]>(
  kind: K,
  props: Omit<NodeByKind<K>, "kind">,
  locParam?: SourceLocation,
): NodeByKind<K> {
  const node: Record<string, unknown> = { kind };
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    node[k] = v;
  }
  node.loc = locParam ?? SOURCE_LOCATION_ZERO;
  return node as unknown as NodeByKind<K>;
}

/** Maps a `kind` literal to its concrete node type. */
export type NodeByKind<K extends Node["kind"]> = Extract<Node, { kind: K }>;

const EXPR_KINDS = new Set<string>([
  "IntLit", "FloatLit", "BoolLit", "StringLit", "CharLit", "UnitLit", "Ident",
  "Binary", "Unary", "Assign", "CompoundAssign", "Call", "Index", "Field",
  "MethodCall", "TupleExpr", "ArrayExpr", "MapExpr", "StructExpr", "EnumVariant",
  "Lambda", "If", "Match", "Block", "Paren", "Cast", "Range", "As", "ErrorProp",
  "TupleField", "SelfExpr", "Spread", "Return",
]);

const STMT_KINDS = new Set<string>([
  "Let", "MutLet", "Const", "ExprStmt", "FnDecl", "EnumDecl", "StructDecl",
  "TypeAlias", "Return", "Break", "Continue", "While", "ForIn", "Import",
  "Print", "AssignStmt", "BlockStmt", "TraitDecl", "ImplBlock",
]);

const PATTERN_KINDS = new Set<string>([
  "WildcardPat", "BindPat", "LitPat", "TuplePat", "ArrayPat", "StructPat",
  "EnumPat", "OrPat", "RestPat",
]);

const TYPE_KINDS = new Set<string>([
  "NamedType", "GenericType", "FuncType", "TupleType", "ArrayType", "MapType",
  "OptionType", "ResultType", "PrimitiveType", "UnitType", "DynType",
]);

export function isExpr(node: Node): node is Expr {
  return EXPR_KINDS.has(node.kind);
}
export function isStmt(node: Node): node is Stmt {
  return STMT_KINDS.has(node.kind);
}
export function isPattern(node: Node): node is Pattern {
  return PATTERN_KINDS.has(node.kind);
}
export function isTypeNode(node: Node): node is TypeNode {
  return TYPE_KINDS.has(node.kind);
}

/** Generic type guard: `guard(node, "Binary")`. */
export function guard<K extends Node["kind"]>(node: Node, kind: K): node is NodeByKind<K> {
  return node.kind === kind;
}
