"""
aether_compiler/ast_nodes.py
============================
AST node definitions for the Aether language.

This module defines the full AST as Python dataclasses, mirroring
the discriminated-union shape used by the TypeScript reference
implementation in ``aether/core/ast/ast.ts``. Every node carries
a ``loc: SourceLocation`` and a ``kind`` discriminator string so
that consumers (a future type-checker, evaluator, code generator)
can pattern-match exactly like the TS code does.

The shape is intentionally close to the TS AST so that AST JSON
produced by the Python port can be diffed against the TS port's
output without translation.

Design notes
------------
- We use :mod:`dataclasses` (no external deps). Every node has
  ``__slots__`` for memory efficiency.
- ``SourceLocation`` is a 3-tuple (file, start_pos, end_pos); a
  ``Position`` is (line, col, offset), 1-based line/col like the
  TS port.
- The discriminating ``kind`` field is set on every node and is
  the same string the TS port uses (e.g. ``"IntLit"``,
  ``"Let"``, ``"Program"``).
- ``Node`` is a union alias of every node type, matching the
  ``Node`` union in ``ast.ts``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional, Union


# ----------------------------------------------------------------------------
# Source locations
# ----------------------------------------------------------------------------


@dataclass(slots=True)
class Position:
    """1-based line/col plus 0-based absolute char offset."""

    line: int
    col: int
    offset: int


@dataclass(slots=True)
class SourceLocation:
    """Half-open source slice: [start, end)."""

    file: str
    start: Position
    end: Position


SOURCE_LOCATION_ZERO = SourceLocation(
    file="<synthetic>",
    start=Position(line=1, col=1, offset=0),
    end=Position(line=1, col=1, offset=0),
)


def make_loc(start: Position, end: Position, file: str = "<unknown>") -> SourceLocation:
    return SourceLocation(file=file, start=start, end=end)


# ----------------------------------------------------------------------------
# Common sub-shapes (mirror Param, TypeParam, StructField, etc.)
# ----------------------------------------------------------------------------


@dataclass(slots=True)
class Param:
    name: str
    type: Optional["TypeNode"] = None
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class TypeParam:
    name: str
    constraint: Optional[str] = None
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class StructField:
    name: str
    type: "TypeNode"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class TraitMethodDecl:
    kind: str = "TraitMethodDecl"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    params: List[Param] = field(default_factory=list)
    ret: Optional["TypeNode"] = None
    has_default: bool = False
    body: Optional["Block"] = None


@dataclass(slots=True)
class TraitAssocTypeDecl:
    name: str
    bound: Optional[str] = None
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class ImplMethodDecl:
    kind: str = "ImplMethodDecl"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    params: List[Param] = field(default_factory=list)
    ret: Optional["TypeNode"] = None
    body: "Block" = None  # type: ignore[assignment]


@dataclass(slots=True)
class ImplAssocTypeDecl:
    name: str
    type: "TypeNode"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class EnumVariantDecl:
    name: str
    kind: str  # "unit" | "tuple" | "struct"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    types: Optional[List["TypeNode"]] = None  # for tuple variants
    fields: Optional[List[StructField]] = None  # for struct variants


@dataclass(slots=True)
class StringSegment:
    """A segment of a string literal: raw text or an interpolation expr."""

    kind: str  # "text" | "interp"
    value: str  # raw source slice
    expr: Optional["Expr"] = None  # only for interp segments


@dataclass(slots=True)
class MatchArm:
    pattern: "Pattern"
    body: "Expr"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    guard: Optional["Expr"] = None


@dataclass(slots=True)
class MapEntry:
    key: "Expr"
    value: "Expr"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class StructExprField:
    name: str
    value: "Expr"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


# ----------------------------------------------------------------------------
# Expressions
# ----------------------------------------------------------------------------


@dataclass(slots=True)
class IntLit:
    kind: str = "IntLit"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    value: int = 0


@dataclass(slots=True)
class FloatLit:
    kind: str = "FloatLit"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    value: float = 0.0


@dataclass(slots=True)
class BoolLit:
    kind: str = "BoolLit"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    value: bool = False


@dataclass(slots=True)
class StringLit:
    kind: str = "StringLit"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    segments: List[StringSegment] = field(default_factory=list)


@dataclass(slots=True)
class CharLit:
    kind: str = "CharLit"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    value: str = ""


@dataclass(slots=True)
class UnitLit:
    kind: str = "UnitLit"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class Ident:
    kind: str = "Ident"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"


@dataclass(slots=True)
class Binary:
    kind: str = "Binary"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    op: str = "+"
    left: Optional["Expr"] = None
    right: Optional["Expr"] = None


@dataclass(slots=True)
class Unary:
    kind: str = "Unary"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    op: str = "-"
    operand: Optional["Expr"] = None


@dataclass(slots=True)
class Assign:
    kind: str = "Assign"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    target: Optional["Expr"] = None
    value: Optional["Expr"] = None


@dataclass(slots=True)
class CompoundAssign:
    kind: str = "CompoundAssign"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    op: str = "+"
    target: Optional["Expr"] = None
    value: Optional["Expr"] = None


@dataclass(slots=True)
class Call:
    kind: str = "Call"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    callee: Optional["Expr"] = None
    args: List["Expr"] = field(default_factory=list)
    type_args: Optional[List["TypeNode"]] = None


@dataclass(slots=True)
class Index:
    kind: str = "Index"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    object: Optional["Expr"] = None
    index: Optional["Expr"] = None


@dataclass(slots=True)
class Field:
    kind: str = "Field"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    object: Optional["Expr"] = None
    name: str = "_"


@dataclass(slots=True)
class MethodCall:
    kind: str = "MethodCall"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    object: Optional["Expr"] = None
    name: str = "_"
    args: List["Expr"] = field(default_factory=list)


@dataclass(slots=True)
class TupleExpr:
    kind: str = "TupleExpr"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    elements: List["Expr"] = field(default_factory=list)


@dataclass(slots=True)
class ArrayExpr:
    kind: str = "ArrayExpr"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    elements: List["Expr"] = field(default_factory=list)


@dataclass(slots=True)
class MapExpr:
    kind: str = "MapExpr"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    entries: List[MapEntry] = field(default_factory=list)


@dataclass(slots=True)
class StructExpr:
    kind: str = "StructExpr"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    fields: List[StructExprField] = field(default_factory=list)
    spread: Optional["Expr"] = None


@dataclass(slots=True)
class EnumVariant:
    kind: str = "EnumVariant"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    enum_name: str = "_"
    variant: str = "_"
    args: List["Expr"] = field(default_factory=list)


@dataclass(slots=True)
class Lambda:
    kind: str = "Lambda"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    params: List[Param] = field(default_factory=list)
    ret: Optional["TypeNode"] = None
    body: Optional["Expr"] = None  # always a Block


@dataclass(slots=True)
class If:
    kind: str = "If"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    cond: Optional["Expr"] = None
    then: Optional["Expr"] = None  # always a Block
    else_: Optional["Expr"] = None


@dataclass(slots=True)
class Match:
    kind: str = "Match"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    scrutinee: Optional["Expr"] = None
    arms: List[MatchArm] = field(default_factory=list)


@dataclass(slots=True)
class Block:
    kind: str = "Block"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    stmts: List["Stmt"] = field(default_factory=list)
    expr: Optional["Expr"] = None


@dataclass(slots=True)
class Paren:
    kind: str = "Paren"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    expr: Optional["Expr"] = None


@dataclass(slots=True)
class Cast:
    kind: str = "Cast"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    expr: Optional["Expr"] = None
    type: Optional["TypeNode"] = None


@dataclass(slots=True)
class Range:
    kind: str = "Range"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    start: Optional["Expr"] = None
    end: Optional["Expr"] = None
    inclusive: bool = False


@dataclass(slots=True)
class As:
    kind: str = "As"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    expr: Optional["Expr"] = None
    type: Optional["TypeNode"] = None


@dataclass(slots=True)
class ErrorProp:
    kind: str = "ErrorProp"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    expr: Optional["Expr"] = None


@dataclass(slots=True)
class TupleField:
    kind: str = "TupleField"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    object: Optional["Expr"] = None
    index: int = 0


@dataclass(slots=True)
class SelfExpr:
    kind: str = "SelfExpr"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class Spread:
    kind: str = "Spread"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    expr: Optional["Expr"] = None


@dataclass(slots=True)
class Borrow:
    kind: str = "Borrow"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    operand: Optional["Expr"] = None
    mutable: bool = False


@dataclass(slots=True)
class Deref:
    kind: str = "Deref"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    operand: Optional["Expr"] = None


@dataclass(slots=True)
class Move:
    kind: str = "Move"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    operand: Optional["Expr"] = None


Expr = Union[
    IntLit, FloatLit, BoolLit, StringLit, CharLit, UnitLit, Ident,
    Binary, Unary, Assign, CompoundAssign, Call, Index, Field,
    MethodCall, TupleExpr, ArrayExpr, MapExpr, StructExpr, EnumVariant,
    Lambda, If, Match, Block, Paren, Cast, Range, As, ErrorProp,
    TupleField, SelfExpr, Spread, Borrow, Deref, Move,
]


# ----------------------------------------------------------------------------
# Statements
# ----------------------------------------------------------------------------


@dataclass(slots=True)
class Let:
    kind: str = "Let"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    type: Optional["TypeNode"] = None
    init: Optional["Expr"] = None


@dataclass(slots=True)
class MutLet:
    kind: str = "MutLet"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    type: Optional["TypeNode"] = None
    init: Optional["Expr"] = None


@dataclass(slots=True)
class Const:
    kind: str = "Const"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    type: Optional["TypeNode"] = None
    init: Optional["Expr"] = None


@dataclass(slots=True)
class ExprStmt:
    kind: str = "ExprStmt"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    expr: Optional["Expr"] = None


@dataclass(slots=True)
class FnDecl:
    kind: str = "FnDecl"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    generics: List[TypeParam] = field(default_factory=list)
    params: List[Param] = field(default_factory=list)
    ret: Optional["TypeNode"] = None
    body: Optional[Block] = None
    exported: bool = False


@dataclass(slots=True)
class EnumDecl:
    kind: str = "EnumDecl"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    generics: List[TypeParam] = field(default_factory=list)
    variants: List[EnumVariantDecl] = field(default_factory=list)
    derive: Optional[List[str]] = None


@dataclass(slots=True)
class StructDecl:
    kind: str = "StructDecl"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    generics: List[TypeParam] = field(default_factory=list)
    fields: List[StructField] = field(default_factory=list)
    derive: Optional[List[str]] = None


@dataclass(slots=True)
class TypeAlias:
    kind: str = "TypeAlias"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    generics: List[TypeParam] = field(default_factory=list)
    type: Optional["TypeNode"] = None


@dataclass(slots=True)
class Return:
    kind: str = "Return"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    expr: Optional["Expr"] = None


@dataclass(slots=True)
class Break:
    kind: str = "Break"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class Continue:
    kind: str = "Continue"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class While:
    kind: str = "While"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    cond: Optional["Expr"] = None
    body: Optional[Block] = None


@dataclass(slots=True)
class ForIn:
    kind: str = "ForIn"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    var_name: str = "_"
    iterable: Optional["Expr"] = None
    body: Optional[Block] = None


@dataclass(slots=True)
class Import:
    kind: str = "Import"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    path: str = ""
    names: List[str] = field(default_factory=list)


@dataclass(slots=True)
class Print:
    kind: str = "Print"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    expr: Optional["Expr"] = None


@dataclass(slots=True)
class AssignStmt:
    kind: str = "AssignStmt"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    target: Optional["Expr"] = None
    value: Optional["Expr"] = None


@dataclass(slots=True)
class BlockStmt:
    kind: str = "BlockStmt"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    body: List["Stmt"] = field(default_factory=list)


@dataclass(slots=True)
class TraitDecl:
    kind: str = "TraitDecl"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    type_params: List[TypeParam] = field(default_factory=list)
    super_traits: List[str] = field(default_factory=list)
    methods: List[TraitMethodDecl] = field(default_factory=list)
    assoc_types: List[TraitAssocTypeDecl] = field(default_factory=list)


@dataclass(slots=True)
class ImplBlock:
    kind: str = "ImplBlock"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    trait_name: str = "_"
    trait_type_args: Optional[List["TypeNode"]] = None
    impl_type: Optional["TypeNode"] = None
    type_params: List[TypeParam] = field(default_factory=list)
    methods: List[ImplMethodDecl] = field(default_factory=list)
    assoc_types: List[ImplAssocTypeDecl] = field(default_factory=list)


Stmt = Union[
    Let, MutLet, Const, ExprStmt, FnDecl, EnumDecl, StructDecl,
    TypeAlias, Return, Break, Continue, While, ForIn, Import, Print,
    AssignStmt, BlockStmt, TraitDecl, ImplBlock,
]


# ----------------------------------------------------------------------------
# Patterns
# ----------------------------------------------------------------------------


@dataclass(slots=True)
class WildcardPat:
    kind: str = "WildcardPat"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class BindPat:
    kind: str = "BindPat"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    mut: bool = False
    type: Optional["TypeNode"] = None


@dataclass(slots=True)
class LitPat:
    kind: str = "LitPat"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    value: Optional["Expr"] = None


@dataclass(slots=True)
class TuplePat:
    kind: str = "TuplePat"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    elements: List["Pattern"] = field(default_factory=list)


@dataclass(slots=True)
class ArrayPat:
    kind: str = "ArrayPat"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    elements: List["Pattern"] = field(default_factory=list)
    rest: Optional[int] = None


@dataclass(slots=True)
class StructPat:
    kind: str = "StructPat"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    fields: List[Any] = field(default_factory=list)  # list of {name, pattern, loc}
    rest: bool = False


@dataclass(slots=True)
class EnumPat:
    kind: str = "EnumPat"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    enum_name: str = "_"
    variant: str = "_"
    subpatterns: List["Pattern"] = field(default_factory=list)


@dataclass(slots=True)
class OrPat:
    kind: str = "OrPat"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    patterns: List["Pattern"] = field(default_factory=list)


@dataclass(slots=True)
class RestPat:
    kind: str = "RestPat"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


Pattern = Union[
    WildcardPat, BindPat, LitPat, TuplePat, ArrayPat, StructPat,
    EnumPat, OrPat, RestPat,
]


# ----------------------------------------------------------------------------
# Type nodes
# ----------------------------------------------------------------------------


@dataclass(slots=True)
class NamedType:
    kind: str = "NamedType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"


@dataclass(slots=True)
class GenericType:
    kind: str = "GenericType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "_"
    args: List["TypeNode"] = field(default_factory=list)


@dataclass(slots=True)
class FuncType:
    kind: str = "FuncType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    params: List["TypeNode"] = field(default_factory=list)
    ret: Optional["TypeNode"] = None


@dataclass(slots=True)
class TupleType:
    kind: str = "TupleType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    types: List["TypeNode"] = field(default_factory=list)


@dataclass(slots=True)
class ArrayType:
    kind: str = "ArrayType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    elem: Optional["TypeNode"] = None


@dataclass(slots=True)
class MapType:
    kind: str = "MapType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    key: Optional["TypeNode"] = None
    value: Optional["TypeNode"] = None


@dataclass(slots=True)
class OptionType:
    kind: str = "OptionType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    inner: Optional["TypeNode"] = None


@dataclass(slots=True)
class ResultType:
    kind: str = "ResultType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    ok: Optional["TypeNode"] = None
    err: Optional["TypeNode"] = None


@dataclass(slots=True)
class PrimitiveType:
    kind: str = "PrimitiveType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    name: str = "int"


@dataclass(slots=True)
class UnitType:
    kind: str = "UnitType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)


@dataclass(slots=True)
class DynType:
    kind: str = "DynType"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    trait_name: str = "_"


TypeNode = Union[
    NamedType, GenericType, FuncType, TupleType, ArrayType, MapType,
    OptionType, ResultType, PrimitiveType, UnitType, DynType,
]


# ----------------------------------------------------------------------------
# Program
# ----------------------------------------------------------------------------


@dataclass(slots=True)
class Program:
    kind: str = "Program"
    loc: SourceLocation = field(default_factory=lambda: SOURCE_LOCATION_ZERO)
    body: List[Stmt] = field(default_factory=list)


# Top-level Node union (matches the TS ``Node`` type).
Node = Union[
    Program, Expr, Stmt, Pattern, TypeNode, MatchArm, MapEntry,
    StructExprField, Param, TypeParam, StructField, EnumVariantDecl,
    StringSegment, TraitMethodDecl, ImplMethodDecl,
    TraitAssocTypeDecl, ImplAssocTypeDecl,
]


# ----------------------------------------------------------------------------
# Convenience: type-guard helpers (mirror the TS ``isExpr``, ``isStmt``, ...)
# ----------------------------------------------------------------------------


_EXPR_KINDS = {
    "IntLit", "FloatLit", "BoolLit", "StringLit", "CharLit", "UnitLit",
    "Ident", "Binary", "Unary", "Assign", "CompoundAssign", "Call",
    "Index", "Field", "MethodCall", "TupleExpr", "ArrayExpr", "MapExpr",
    "StructExpr", "EnumVariant", "Lambda", "If", "Match", "Block",
    "Paren", "Cast", "Range", "As", "ErrorProp", "TupleField", "SelfExpr",
    "Spread", "Borrow", "Deref", "Move",
}

_STMT_KINDS = {
    "Let", "MutLet", "Const", "ExprStmt", "FnDecl", "EnumDecl",
    "StructDecl", "TypeAlias", "Return", "Break", "Continue", "While",
    "ForIn", "Import", "Print", "AssignStmt", "BlockStmt", "TraitDecl",
    "ImplBlock",
}


def is_expr(node: Node) -> bool:
    return getattr(node, "kind", None) in _EXPR_KINDS


def is_stmt(node: Node) -> bool:
    return getattr(node, "kind", None) in _STMT_KINDS


__all__ = [
    # locations
    "Position", "SourceLocation", "SOURCE_LOCATION_ZERO", "make_loc",
    # common sub-shapes
    "Param", "TypeParam", "StructField", "TraitMethodDecl",
    "TraitAssocTypeDecl", "ImplMethodDecl", "ImplAssocTypeDecl",
    "EnumVariantDecl", "StringSegment", "MatchArm", "MapEntry",
    "StructExprField",
    # expressions
    "IntLit", "FloatLit", "BoolLit", "StringLit", "CharLit", "UnitLit",
    "Ident", "Binary", "Unary", "Assign", "CompoundAssign", "Call",
    "Index", "Field", "MethodCall", "TupleExpr", "ArrayExpr", "MapExpr",
    "StructExpr", "EnumVariant", "Lambda", "If", "Match", "Block",
    "Paren", "Cast", "Range", "As", "ErrorProp", "TupleField",
    "SelfExpr", "Spread", "Borrow", "Deref", "Move",
    "Expr",
    # statements
    "Let", "MutLet", "Const", "ExprStmt", "FnDecl", "EnumDecl",
    "StructDecl", "TypeAlias", "Return", "Break", "Continue", "While",
    "ForIn", "Import", "Print", "AssignStmt", "BlockStmt", "TraitDecl",
    "ImplBlock", "Stmt",
    # patterns
    "WildcardPat", "BindPat", "LitPat", "TuplePat", "ArrayPat",
    "StructPat", "EnumPat", "OrPat", "RestPat", "Pattern",
    # types
    "NamedType", "GenericType", "FuncType", "TupleType", "ArrayType",
    "MapType", "OptionType", "ResultType", "PrimitiveType", "UnitType",
    "DynType", "TypeNode",
    # program
    "Program", "Node",
    # helpers
    "is_expr", "is_stmt",
]
