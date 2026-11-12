"""
aether_compiler/parser.py
=========================
Recursive-descent + Pratt parser for Aether (Python port).

Mirrors ``aether/core/parser/parser.ts`` construct-for-construct.
Produces a :class:`Program` AST from a list of :class:`Token` objects
using the AST node classes defined in :mod:`aether_compiler.ast_nodes`.

Pipeline
--------
    tokens -> parse(tokens) -> ParseResult(program=Program, errors=list)

Precedence (low -> high), matching the TS port exactly::

    ||               1
    &&               2
    == != < <= > >=  3
    | ^ & << >>      4   (bitwise, looser than add)
    .. ..=           4   (range)
    + -              5
    * / %            6
    as               7
    ?                8   (postfix, error-prop)
    unary ! -        9   (prefix)
    postfix call/index/field/method   10
    atoms            11

Error recovery
--------------
On a parse error, the parser records an error with the location and a
message of the form ``"expected ';', found '}' at line 42:15"`` and
skips to the next ``;`` or ``}`` (whichever comes first), then
continues parsing. All errors are collected and returned alongside
the partial AST. This mirrors the TS port's behaviour so the
playground can show all errors at once.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from .ast_nodes import (
    ArrayExpr, ArrayPat, ArrayType, As, AssignStmt, Assign, Binary, BindPat,
    Block, BlockStmt, BoolLit, Borrow, Break, Call, Cast, CharLit,
    CompoundAssign, Const, Continue, Deref, EnumDecl, EnumPat, EnumVariant,
    EnumVariantDecl, ExprStmt, Field, FnDecl, ForIn, FloatLit, GenericType,
    Ident, ImplBlock, ImplMethodDecl, If, Import, Index, IntLit, Lambda, Let,
    LitPat, MapEntry, MapExpr, MapType, Match, MatchArm, MethodCall, Move,
    MutLet, NamedType, OrPat, OptionType, Paren, Pattern, Print, Program,
    Range, RestPat, ResultType, Return, SelfExpr, SourceLocation, Spread,
    Stmt, StringLit, StringSegment, StructDecl, StructExpr, StructExprField,
    StructField, StructPat, TraitDecl, TraitMethodDecl, TupleExpr, TupleField,
    TuplePat, TupleType, TypeAlias, TypeNode, TypeParam, UnitLit, UnitType,
    Unary, While, WildcardPat, make_loc,
    Param, Position, SOURCE_LOCATION_ZERO, TraitAssocTypeDecl, ImplAssocTypeDecl,
    DynType, PrimitiveType, ErrorProp, StructPat,
)
from .lexer import Token, is_keyword, is_punct, tokenize, tokenize_with_errors


@dataclass
class ParseError:
    message: str
    loc: SourceLocation


@dataclass
class ParseResult:
    program: Program
    errors: List[ParseError] = field(default_factory=list)


# ----------------------------------------------------------------------------
# Precedence (matches parser.ts exactly)
# ----------------------------------------------------------------------------

_BIN_PREC = {
    "||": 1,
    "&&": 2,
    "==": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3,
    # range `..` / `..=` is handled specially below (precedence 4)
    # Bitwise / shift — looser than add (5), tighter than range (4):
    "|": 4, "^": 4, "&": 4, "<<": 4, ">>": 4,
    "+": 5, "-": 5,
    "*": 6, "/": 6, "%": 6,
    # `as` is precedence 7 (handled specially in the binary loop)
}
_RANGE_PREC = 4
_AS_PREC = 7

_PRIMITIVE_TYPES = {"int", "float", "bool", "string", "char"}


class _ParseAbort(Exception):
    """Raised to abort a sub-parse for error recovery."""

    def __init__(self, message: str, loc: SourceLocation):
        super().__init__(message)
        self.message = message
        self.loc = loc


# ----------------------------------------------------------------------------
# Parser
# ----------------------------------------------------------------------------


class Parser:
    """Recursive-descent + Pratt parser. See module docstring."""

    def __init__(self, tokens: List[Token], file: str = "<aether>"):
        self.tokens = tokens
        self.pos = 0
        self.errors: List[ParseError] = []
        self.file = file
        # Pending #[derive(...)] attribute names to attach to the next struct/enum.
        self.pending_derive: Optional[List[str]] = None

    # ------------------------------------------------------------------
    # Top-level entry point
    # ------------------------------------------------------------------

    def parse(self) -> ParseResult:
        body: List[Stmt] = []
        start = self.peek().loc.start
        while not self.at_end():
            stmt = self.parse_stmt()
            if stmt is not None:
                body.append(stmt)
        end = (self.tokens[-1].loc.end if self.tokens else start)
        program = Program(loc=make_loc(start, end, self.file), body=body)
        return ParseResult(program=program, errors=self.errors)

    # ------------------------------------------------------------------
    # Token helpers
    # ------------------------------------------------------------------

    def peek(self, n: int = 0) -> Token:
        if self.pos + n < len(self.tokens):
            return self.tokens[self.pos + n]
        # EOF sentinel (the lexer always emits a trailing Eof, so this only
        # triggers if someone passed in an empty token list).
        return Token(kind="Eof", value="", loc=SOURCE_LOCATION_ZERO)

    def advance(self) -> Token:
        if self.pos < len(self.tokens):
            t = self.tokens[self.pos]
            self.pos += 1
            return t
        return self.peek()

    def at_end(self) -> bool:
        return self.peek().kind == "Eof"

    def is_punct(self, value, n: int = 0) -> bool:
        """Test if the peeked token is a Punct with the given value(s).

        ``value`` may be a single string or a tuple/list of strings;
        in the tuple case, returns True if any of them matches.
        """
        t = self.peek(n)
        if t.kind != "Punct":
            return False
        if isinstance(value, (tuple, list, set)):
            return t.value in value
        return t.value == value

    def is_keyword(self, value: str, n: int = 0) -> bool:
        return is_keyword(self.peek(n), value)

    def eat_punct(self, value: str) -> bool:
        if self.is_punct(value):
            self.advance()
            return True
        return False

    def eat_keyword(self, value: str) -> bool:
        if self.is_keyword(value):
            self.advance()
            return True
        return False

    def expect_punct(self, value: str) -> Optional[Token]:
        if self.is_punct(value):
            return self.advance()
        self.err(f"expected '{value}', found '{self.peek().value or '<eof>'}' at {_loc_str(self.peek().loc)}")
        return None

    def expect_ident(self) -> Optional[str]:
        t = self.peek()
        if t.kind == "Ident":
            self.advance()
            return t.value
        self.err(f"expected identifier, found '{t.value or '<eof>'}' at {_loc_str(t.loc)}")
        return None

    def err(self, message: str, loc: Optional[SourceLocation] = None) -> None:
        self.errors.append(ParseError(message=message, loc=loc if loc is not None else self.peek().loc))

    def recover(self) -> None:
        while not self.at_end():
            t = self.advance()
            if t.kind == "Punct" and t.value in (";", "}"):
                return

    def loc_from(self, start: SourceLocation) -> SourceLocation:
        if self.pos > 0:
            end = self.tokens[self.pos - 1].loc.end
        else:
            end = start.end
        return make_loc(start.start, end, self.file)

    # ------------------------------------------------------------------
    # Statements
    # ------------------------------------------------------------------

    def parse_stmt(self) -> Optional[Stmt]:
        start = self.peek().loc
        try:
            if self.is_punct("#"):
                self.parse_derive_attribute()
                return self.parse_stmt()
            if self.is_keyword("let"):
                return self.parse_let()
            if self.is_keyword("const"):
                return self.parse_const()
            if self.is_keyword("fn"):
                return self.parse_fn_or_lambda()
            if self.is_keyword("enum"):
                return self.parse_enum()
            if self.is_keyword("struct"):
                return self.parse_struct()
            if self.is_keyword("type"):
                return self.parse_type_alias()
            if self.is_keyword("trait"):
                return self.parse_trait()
            if self.is_keyword("impl"):
                return self.parse_impl()
            if self.is_keyword("return"):
                return self.parse_return()
            if self.is_keyword("break"):
                self.advance()
                self.expect_punct(";")
                return Break(loc=self.loc_from(start))
            if self.is_keyword("continue"):
                self.advance()
                self.expect_punct(";")
                return Continue(loc=self.loc_from(start))
            if self.is_keyword("while"):
                return self.parse_while()
            if self.is_keyword("for"):
                return self.parse_for()
            if self.is_keyword("import"):
                return self.parse_import()
            if self.is_keyword("pub"):
                return self.parse_pub()
            if self.is_keyword("print"):
                return self.parse_print()
            # expression statement or assignment
            return self.parse_expr_or_assign_stmt()
        except _ParseAbort as e:
            self.err(e.message, e.loc)
            self.recover()
            return None

    def parse_derive_attribute(self) -> None:
        self.expect_punct("#")
        self.expect_punct("[")
        name_tok = self.advance()
        if name_tok.value != "derive":
            self.err(f"expected 'derive' attribute, found '{name_tok.value}'", name_tok.loc)
            while not self.is_punct("]") and not self.at_end():
                self.advance()
            self.eat_punct("]")
            return
        self.expect_punct("(")
        names: List[str] = []
        if not self.is_punct(")"):
            while True:
                if self.is_punct(")"):
                    break
                t = self.advance()
                if t.kind == "Ident":
                    names.append(t.value)
                else:
                    self.err(f"expected trait name in derive, found '{t.value}'", t.loc)
                if not self.eat_punct(","):
                    break
        self.expect_punct(")")
        self.expect_punct("]")
        self.pending_derive = names

    def consume_pending_derive(self) -> Optional[List[str]]:
        d = self.pending_derive
        self.pending_derive = None
        return d

    # -- Trait / impl --------------------------------------------------

    def parse_trait(self) -> Stmt:
        start = self.peek().loc
        self.advance()  # trait
        name = self.expect_ident() or "_"
        type_params = self.parse_type_params()
        super_traits: List[str] = []
        if self.eat_punct(":"):
            while True:
                if self.is_punct("{"):
                    break
                t = self.advance()
                if t.kind == "Ident":
                    super_traits.append(t.value)
                else:
                    self.err(f"expected super-trait name, found '{t.value}'", t.loc)
                if not self.eat_punct("+"):
                    break
        self.expect_punct("{")
        methods: List[TraitMethodDecl] = []
        assoc_types: List[TraitAssocTypeDecl] = []
        while not self.is_punct("}") and not self.at_end():
            if self.is_keyword("type"):
                t_start = self.peek().loc
                self.advance()
                t_name = self.expect_ident() or "_"
                bound: Optional[str] = None
                if self.eat_punct(":"):
                    bound = self.advance().value
                self.expect_punct(";")
                assoc_types.append(TraitAssocTypeDecl(name=t_name, bound=bound, loc=self.loc_from(t_start)))
                continue
            if self.is_keyword("fn"):
                m_start = self.peek().loc
                self.advance()
                m_name = self.expect_ident() or "_"
                params = self.parse_params()
                ret: Optional[TypeNode] = None
                if self.eat_punct("->"):
                    ret = self.parse_type()
                has_default = False
                body: Optional[Block] = None
                if self.is_punct("{"):
                    body = self.parse_block()
                    has_default = True
                else:
                    self.expect_punct(";")
                methods.append(TraitMethodDecl(loc=self.loc_from(m_start), name=m_name, params=params, ret=ret, has_default=has_default, body=body))
                continue
            self.err(f"expected 'fn' or 'type' inside trait body, found '{self.peek().value}'", self.peek().loc)
            self.recover()
        self.expect_punct("}")
        return TraitDecl(loc=self.loc_from(start), name=name, type_params=type_params,
                        super_traits=super_traits, methods=methods, assoc_types=assoc_types)

    def parse_impl(self) -> Stmt:
        start = self.peek().loc
        self.advance()  # impl
        type_params = self.parse_type_params()
        trait_name_tok = self.advance()
        trait_type_args: Optional[List[TypeNode]] = None
        if trait_name_tok.kind != "Ident":
            self.err(f"expected trait name after 'impl', found '{trait_name_tok.value}'", trait_name_tok.loc)
        if self.is_punct("<"):
            self.advance()
            args: List[TypeNode] = []
            if not self.is_punct(">"):
                while True:
                    if self.is_punct(">"):
                        break
                    args.append(self.parse_type())
                    if not self.eat_punct(","):
                        break
            self.expect_punct(">")
            trait_type_args = args
        if not self.eat_keyword("for"):
            self.err(f"expected 'for' in impl block, found '{self.peek().value}'", self.peek().loc)
        impl_type = self.parse_type()
        self.expect_punct("{")
        methods: List[ImplMethodDecl] = []
        assoc_types: List[ImplAssocTypeDecl] = []
        while not self.is_punct("}") and not self.at_end():
            if self.is_keyword("type"):
                t_start = self.peek().loc
                self.advance()
                t_name = self.expect_ident() or "_"
                self.expect_punct("=")
                t_type = self.parse_type()
                self.expect_punct(";")
                assoc_types.append(ImplAssocTypeDecl(name=t_name, type=t_type, loc=self.loc_from(t_start)))
                continue
            if self.is_keyword("fn"):
                m_start = self.peek().loc
                self.advance()
                m_name = self.expect_ident() or "_"
                params = self.parse_params()
                ret = None
                if self.eat_punct("->"):
                    ret = self.parse_type()
                body = self.parse_block()
                methods.append(ImplMethodDecl(loc=self.loc_from(m_start), name=m_name, params=params, ret=ret, body=body))
                continue
            self.err(f"expected 'fn' or 'type' inside impl body, found '{self.peek().value}'", self.peek().loc)
            self.recover()
        self.expect_punct("}")
        return ImplBlock(loc=self.loc_from(start), trait_name=trait_name_tok.value or "_",
                        trait_type_args=trait_type_args, impl_type=impl_type,
                        type_params=type_params, methods=methods, assoc_types=assoc_types)

    # -- let / const / fn / enum / struct / type ----------------------

    def parse_let(self) -> Stmt:
        start = self.peek().loc
        self.advance()  # let
        mutable = False
        if self.is_keyword("mut"):
            self.advance()
            mutable = True
        name = self.expect_ident() or "_"
        type_: Optional[TypeNode] = None
        if self.eat_punct(":"):
            type_ = self.parse_type()
        self.expect_punct("=")
        init = self.parse_expr()
        self.expect_punct(";")
        loc = self.loc_from(start)
        if mutable:
            return MutLet(loc=loc, name=name, type=type_, init=init)
        return Let(loc=loc, name=name, type=type_, init=init)

    def parse_const(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        name = self.expect_ident() or "_"
        type_: Optional[TypeNode] = None
        if self.eat_punct(":"):
            type_ = self.parse_type()
        self.expect_punct("=")
        init = self.parse_expr()
        self.expect_punct(";")
        return Const(loc=self.loc_from(start), name=name, type=type_, init=init)

    def parse_fn_or_lambda(self) -> Stmt:
        start = self.peek().loc
        self.advance()  # fn
        if self.peek().kind == "Ident":
            name = self.advance().value
            generics = self.parse_type_params()
            params = self.parse_params()
            ret: Optional[TypeNode] = None
            if self.eat_punct("->"):
                ret = self.parse_type()
            body = self.parse_block()
            return FnDecl(loc=self.loc_from(start), name=name, generics=generics, params=params, ret=ret, body=body)
        else:
            # lambda used as expression statement (rare)
            self.pos -= 1  # un-consume `fn`
            e = self.parse_expr()
            self.expect_punct(";")
            return ExprStmt(loc=self.loc_from(start), expr=e)

    def parse_enum(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        name = self.expect_ident() or "_"
        generics = self.parse_type_params()
        self.expect_punct("{")
        variants: List[EnumVariantDecl] = []
        while not self.is_punct("}") and not self.at_end():
            v_start = self.peek().loc
            v_name = self.expect_ident()
            if not v_name:
                self.recover()
                continue
            if self.eat_punct("("):
                types_: List[TypeNode] = []
                if not self.is_punct(")"):
                    while True:
                        if self.is_punct(")"):
                            break
                        types_.append(self.parse_type())
                        if not self.eat_punct(","):
                            break
                self.expect_punct(")")
                variants.append(EnumVariantDecl(name=v_name, kind="tuple", types=types_, loc=self.loc_from(v_start)))
            elif self.eat_punct("{"):
                fields_: List[StructField] = []
                if not self.is_punct("}"):
                    while True:
                        if self.is_punct("}"):
                            break
                        fname = self.expect_ident()
                        self.expect_punct(":")
                        ftype = self.parse_type()
                        if fname:
                            fields_.append(StructField(name=fname, type=ftype, loc=self.loc_from(v_start)))
                        if not self.eat_punct(","):
                            break
                self.expect_punct("}")
                variants.append(EnumVariantDecl(name=v_name, kind="struct", fields=fields_, loc=self.loc_from(v_start)))
            else:
                variants.append(EnumVariantDecl(name=v_name, kind="unit", loc=self.loc_from(v_start)))
            self.eat_punct(",")
        self.expect_punct("}")
        return EnumDecl(loc=self.loc_from(start), name=name, generics=generics,
                        variants=variants, derive=self.consume_pending_derive())

    def parse_struct(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        name = self.expect_ident() or "_"
        generics = self.parse_type_params()
        self.expect_punct("{")
        fields_: List[StructField] = []
        if not self.is_punct("}"):
            while True:
                if self.is_punct("}"):
                    break
                fname = self.expect_ident()
                self.expect_punct(":")
                ftype = self.parse_type()
                if fname:
                    fields_.append(StructField(name=fname, type=ftype, loc=self.loc_from(start)))
                if not self.eat_punct(","):
                    break
        self.expect_punct("}")
        return StructDecl(loc=self.loc_from(start), name=name, generics=generics,
                        fields=fields_, derive=self.consume_pending_derive())

    def parse_type_alias(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        name = self.expect_ident() or "_"
        generics = self.parse_type_params()
        self.expect_punct("=")
        type_ = self.parse_type()
        self.expect_punct(";")
        return TypeAlias(loc=self.loc_from(start), name=name, generics=generics, type=type_)

    def parse_return(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        expr: Optional[Expr] = None  # type: ignore # noqa
        if not (self.is_punct(";") or self.is_punct("}") or self.at_end()):
            expr = self.parse_expr()
        self.expect_punct(";")
        return Return(loc=self.loc_from(start), expr=expr)

    def parse_while(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        cond = self.parse_expr(allow_struct=False)
        body = self.parse_block()
        return While(loc=self.loc_from(start), cond=cond, body=body)

    def parse_for(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        var_name = self.expect_ident() or "_"
        if not self.eat_keyword("in"):
            self.err(f"expected 'in', found '{self.peek().value}' at {_loc_str(self.peek().loc)}")
        iterable = self.parse_expr(allow_struct=False)
        body = self.parse_block()
        return ForIn(loc=self.loc_from(start), var_name=var_name, iterable=iterable, body=body)

    def parse_import(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        path = ""
        names: List[str] = []
        if self.is_punct("{"):
            self.advance()
            while True:
                if self.is_punct("}"):
                    break
                n = self.expect_ident()
                if n:
                    names.append(n)
                if not self.eat_punct(","):
                    break
            self.expect_punct("}")
            if self.peek().kind == "Ident" and self.peek().value == "from":
                self.advance()
                if self.peek().kind == "String":
                    path = "".join(seg.value for seg in (self.peek().segments or []))
                    self.advance()
                else:
                    self.err(f"expected string after from, found '{self.peek().value}'")
            else:
                self.err(f"expected 'from' after import names, found '{self.peek().value}'")
        else:
            if self.peek().kind == "String":
                path = "".join(seg.value for seg in (self.peek().segments or []))
                self.advance()
            else:
                self.err(f"expected string after import, found '{self.peek().value}'")
            if self.eat_punct("{"):
                while True:
                    if self.is_punct("}"):
                        break
                    n = self.expect_ident()
                    if n:
                        names.append(n)
                    if not self.eat_punct(","):
                        break
                self.expect_punct("}")
        self.eat_punct(";")
        return Import(loc=self.loc_from(start), path=path, names=names)

    def parse_pub(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        if self.is_keyword("fn"):
            d = self.parse_fn_or_lambda()
            if isinstance(d, FnDecl):
                d.exported = True
            return d
        self.err(f"expected 'fn' after 'pub', found '{self.peek().value}'")
        self.recover()
        return ExprStmt(loc=self.loc_from(start), expr=UnitLit(loc=self.loc_from(start)))

    def parse_print(self) -> Stmt:
        start = self.peek().loc
        self.advance()
        self.expect_punct("(")
        expr = self.parse_expr()
        self.expect_punct(")")
        self.expect_punct(";")
        return Print(loc=self.loc_from(start), expr=expr)

    def parse_expr_or_assign_stmt(self) -> Stmt:
        start = self.peek().loc
        e = self.parse_expr()
        if self.is_punct("="):
            self.advance()
            value = self.parse_expr()
            self.expect_punct(";")
            return AssignStmt(loc=self.loc_from(start), target=e, value=value)
        if self.is_punct(("+=", "-=", "*=", "/=", "%=")):
            op = self.advance().value[0]
            value = self.parse_expr()
            self.expect_punct(";")
            return AssignStmt(loc=self.loc_from(start), target=e,
                            value=CompoundAssign(loc=self.loc_from(start), op=op, target=e, value=value))
        self.expect_punct(";")
        return ExprStmt(loc=self.loc_from(start), expr=e)

    # ------------------------------------------------------------------
    # Type parameters and parameters
    # ------------------------------------------------------------------

    def parse_type_params(self) -> List[TypeParam]:
        out: List[TypeParam] = []
        if not self.is_punct("<"):
            return out
        self.advance()
        while True:
            if self.is_punct(">"):
                break
            name_tok = self.advance()
            constraint: Optional[str] = None
            if self.eat_punct(":"):
                constraint = self.advance().value
            out.append(TypeParam(name=name_tok.value, constraint=constraint, loc=name_tok.loc))
            if not self.eat_punct(","):
                break
        self.expect_punct(">")
        return out

    def parse_params(self) -> List[Param]:
        out: List[Param] = []
        self.expect_punct("(")
        if not self.is_punct(")"):
            while True:
                if self.is_punct(")"):
                    break
                start = self.peek().loc
                if self.is_keyword("self"):
                    name_tok = self.advance()
                else:
                    name_tok = self.advance()
                if name_tok.kind != "Ident" and not is_keyword(name_tok, "self"):
                    self.err(f"expected parameter name, found '{name_tok.value}' at {_loc_str(name_tok.loc)}")
                type_: Optional[TypeNode] = None
                if self.eat_punct(":"):
                    type_ = self.parse_type()
                out.append(Param(name=name_tok.value, type=type_, loc=start))
                if not self.eat_punct(","):
                    break
        self.expect_punct(")")
        return out

    # ------------------------------------------------------------------
    # Types
    # ------------------------------------------------------------------

    def parse_type(self) -> TypeNode:
        return self.parse_func_type()

    def parse_func_type(self) -> TypeNode:
        if self.is_keyword("fn"):
            start = self.peek().loc
            self.advance()
            self.expect_punct("(")
            params: List[TypeNode] = []
            if not self.is_punct(")"):
                while True:
                    if self.is_punct(")"):
                        break
                    params.append(self.parse_type())
                    if not self.eat_punct(","):
                        break
            self.expect_punct(")")
            self.expect_punct("->")
            ret = self.parse_type()
            return FuncType(loc=self.loc_from(start), params=params, ret=ret)
        return self.parse_primary_type()

    def parse_primary_type(self) -> TypeNode:
        t = self.peek()
        start = t.loc
        if self.is_punct("("):
            self.advance()
            if self.eat_punct(")"):
                return UnitType(loc=self.loc_from(start))
            types_: List[TypeNode] = []
            while True:
                if self.is_punct(")"):
                    break
                types_.append(self.parse_type())
                if not self.eat_punct(","):
                    break
            self.expect_punct(")")
            return TupleType(loc=self.loc_from(start), types=types_)
        if self.is_punct("["):
            self.advance()
            elem = self.parse_type()
            self.expect_punct("]")
            return ArrayType(loc=self.loc_from(start), elem=elem)
        if self.is_keyword("map") or (t.kind == "Ident" and t.value == "map"):
            self.advance()
            self.expect_punct("[")
            key = self.parse_type()
            self.expect_punct("]")
            value = self.parse_type()
            return MapType(loc=self.loc_from(start), key=key, value=value)
        if self.is_keyword("option") or (t.kind == "Ident" and t.value == "option"):
            self.advance()
            self.expect_punct("<")
            inner = self.parse_type()
            self.expect_punct(">")
            return OptionType(loc=self.loc_from(start), inner=inner)
        if self.is_keyword("result") or (t.kind == "Ident" and t.value == "result"):
            self.advance()
            self.expect_punct("<")
            ok = self.parse_type()
            self.expect_punct(",")
            err = self.parse_type()
            self.expect_punct(">")
            return ResultType(loc=self.loc_from(start), ok=ok, err=err)
        if self.is_keyword("dyn"):
            self.advance()
            trait_tok = self.advance()
            if trait_tok.kind != "Ident":
                self.err(f"expected trait name after 'dyn', found '{trait_tok.value}'", trait_tok.loc)
            return DynType(loc=self.loc_from(start), trait_name=trait_tok.value or "_")
        if t.kind in ("Ident", "Keyword"):
            name = self.advance().value
            if name in _PRIMITIVE_TYPES:
                return PrimitiveType(loc=self.loc_from(start), name=name)
            if name == "unit":
                return UnitType(loc=self.loc_from(start))
            if self.is_punct("<"):
                self.advance()
                args: List[TypeNode] = []
                while True:
                    if self.is_punct(">"):
                        break
                    args.append(self.parse_type())
                    if not self.eat_punct(","):
                        break
                self.expect_punct(">")
                return GenericType(loc=self.loc_from(start), name=name, args=args)
            return NamedType(loc=self.loc_from(start), name=name)
        self.err(f"expected type, found '{t.value or '<eof>'}' at {_loc_str(t.loc)}")
        return UnitType(loc=self.loc_from(start))

    # ------------------------------------------------------------------
    # Patterns
    # ------------------------------------------------------------------

    def parse_pattern(self) -> Pattern:
        p = self.parse_pattern_atom()
        if self.is_punct("|"):
            patterns: List[Pattern] = [p]
            while self.eat_punct("|"):
                patterns.append(self.parse_pattern_atom())
            start_pos = p.loc.start
            end_pos = self.tokens[self.pos - 1].loc.end if self.pos > 0 else start_pos
            p = OrPat(loc=make_loc(start_pos, end_pos, self.file), patterns=patterns)
        return p

    def parse_pattern_atom(self) -> Pattern:
        t = self.peek()
        start = t.loc
        if self.is_punct("_") or (t.kind == "Ident" and t.value == "_"):
            self.advance()
            return WildcardPat(loc=self.loc_from(start))
        if self.is_punct(".."):
            self.advance()
            return RestPat(loc=self.loc_from(start))
        if self.is_punct("("):
            self.advance()
            elements: List[Pattern] = []
            if not self.is_punct(")"):
                while True:
                    if self.is_punct(")"):
                        break
                    elements.append(self.parse_pattern())
                    if not self.eat_punct(","):
                        break
            self.expect_punct(")")
            return TuplePat(loc=self.loc_from(start), elements=elements)
        if self.is_punct("["):
            self.advance()
            elems: List[Pattern] = []
            rest: Optional[int] = None
            if not self.is_punct("]"):
                i = 0
                while True:
                    if self.is_punct("]"):
                        break
                    if self.is_punct(".."):
                        self.advance()
                        rest = i
                    else:
                        elems.append(self.parse_pattern())
                        i += 1
                    if not self.eat_punct(","):
                        break
            self.expect_punct("]")
            return ArrayPat(loc=self.loc_from(start), elements=elems, rest=rest)
        if self.is_keyword("mut"):
            self.advance()
            name = self.expect_ident() or "_"
            type_: Optional[TypeNode] = None
            if self.eat_punct(":"):
                type_ = self.parse_type()
            return BindPat(loc=self.loc_from(start), name=name, mut=True, type=type_)
        if t.kind in ("Ident", "Keyword"):
            name = self.advance().value
            if self.is_punct("::"):
                self.advance()
                variant = self.advance().value
                subpatterns: List[Pattern] = []
                if self.eat_punct("("):
                    if not self.is_punct(")"):
                        while True:
                            if self.is_punct(")"):
                                break
                            subpatterns.append(self.parse_pattern())
                            if not self.eat_punct(","):
                                break
                    self.expect_punct(")")
                return EnumPat(loc=self.loc_from(start), enum_name=name, variant=variant, subpatterns=subpatterns)
            if self.is_punct("{"):
                self.advance()
                fields: List[Tuple[str, Pattern, SourceLocation]] = []
                has_rest = False
                if not self.is_punct("}"):
                    while True:
                        if self.is_punct("}"):
                            break
                        if self.is_punct(".."):
                            self.advance()
                            has_rest = True
                            break
                        fname = self.expect_ident()
                        if self.eat_punct(":"):
                            pat = self.parse_pattern()
                        elif fname:
                            pat = BindPat(loc=self.loc_from(start), name=fname)
                        else:
                            pat = WildcardPat(loc=self.loc_from(start))
                        if fname:
                            fields.append((fname, pat, self.loc_from(start)))
                        if not self.eat_punct(","):
                            break
                self.expect_punct("}")
                return StructPat(loc=self.loc_from(start), name=name, fields=fields, rest=has_rest)
            type_: Optional[TypeNode] = None
            if self.eat_punct(":"):
                type_ = self.parse_type()
            return BindPat(loc=self.loc_from(start), name=name, type=type_)
        if t.kind in ("Int", "Float", "Hex", "Binary", "Octal", "Char", "String"):
            e = self.parse_atom(allow_struct=True)
            return LitPat(loc=self.loc_from(start), value=e)
        if self.is_keyword("true") or self.is_keyword("false"):
            e = self.parse_atom(allow_struct=True)
            return LitPat(loc=self.loc_from(start), value=e)
        if self.is_punct("-"):
            e = self.parse_expr()
            return LitPat(loc=self.loc_from(start), value=e)
        self.err(f"expected pattern, found '{t.value or '<eof>'}' at {_loc_str(t.loc)}")
        return WildcardPat(loc=self.loc_from(start))

    # ------------------------------------------------------------------
    # Expressions
    # ------------------------------------------------------------------

    def parse_expr(self, allow_struct: bool = True) -> Expr:
        return self.parse_binary(0, allow_struct)

    def parse_binary(self, min_prec: int, allow_struct: bool) -> Expr:
        left = self.parse_unary(allow_struct)
        while True:
            t = self.peek()
            if t.kind == "Punct" and t.value in _BIN_PREC and _BIN_PREC[t.value] >= min_prec:
                op = self.advance().value
                right = self.parse_binary(_BIN_PREC[op] + 1, allow_struct)
                left = Binary(loc=self.loc_from(left.loc), op=op, left=left, right=right)
                left = self.apply_postfix(left, allow_struct)
                continue
            if t.kind == "Keyword" and t.value == "as" and _AS_PREC >= min_prec:
                self.advance()
                type_ = self.parse_type()
                left = As(loc=self.loc_from(left.loc), expr=left, type=type_)
                left = self.apply_postfix(left, allow_struct)
                continue
            if t.kind == "Keyword" and t.value == "or" and 0 >= min_prec:
                self.advance()
                right = self.parse_binary(1, allow_struct)
                left = Binary(loc=self.loc_from(left.loc), op="or", left=left, right=right)
                continue
            if t.kind == "Punct" and t.value in ("..", "..=") and _RANGE_PREC >= min_prec:
                op = self.advance().value
                right = self.parse_binary(_RANGE_PREC + 1, allow_struct)
                left = Range(loc=self.loc_from(left.loc), start=left, end=right, inclusive=(op == "..="))
                continue
            break
        return left

    def parse_unary(self, allow_struct: bool) -> Expr:
        t = self.peek()
        if t.kind == "Punct" and t.value in ("!", "-", "~"):
            op = self.advance().value
            operand = self.parse_unary(allow_struct)
            return Unary(loc=self.loc_from(t.loc), op=op, operand=operand)
        if t.kind == "Punct" and t.value == "&":
            start = t.loc
            self.advance()
            mutable = False
            if self.is_keyword("mut"):
                self.advance()
                mutable = True
            operand = self.parse_unary(allow_struct)
            return Borrow(loc=self.loc_from(start), operand=operand, mutable=mutable)
        if t.kind == "Punct" and t.value == "*":
            start = t.loc
            self.advance()
            operand = self.parse_unary(allow_struct)
            return Deref(loc=self.loc_from(start), operand=operand)
        if t.kind == "Keyword" and t.value == "move":
            start = t.loc
            self.advance()
            operand = self.parse_unary(allow_struct)
            return Move(loc=self.loc_from(start), operand=operand)
        return self.parse_postfix(None, allow_struct)

    def parse_postfix(self, initial: Optional[Expr], allow_struct: bool) -> Expr:
        e: Expr = initial if initial is not None else self.parse_atom(allow_struct)
        while True:
            t = self.peek()
            if t.kind == "Punct" and t.value == "(":
                start = e.loc.start
                self.advance()
                args: List[Expr] = []
                if not self.is_punct(")"):
                    while True:
                        if self.is_punct(")"):
                            break
                        args.append(self.parse_expr())
                        if not self.eat_punct(","):
                            break
                self.expect_punct(")")
                e = Call(loc=make_loc(start, start, self.file), callee=e, args=args)
                continue
            if t.kind == "Punct" and t.value == "[":
                start = e.loc.start
                self.advance()
                index = self.parse_expr()
                self.expect_punct("]")
                e = Index(loc=make_loc(start, start, self.file), object=e, index=index)
                continue
            if t.kind == "Punct" and t.value == ".":
                start = e.loc.start
                self.advance()
                nxt = self.peek()
                if nxt.kind == "Int":
                    self.advance()
                    e = TupleField(loc=make_loc(start, start, self.file), object=e, index=int(nxt.value, 10))
                    continue
                name = nxt.value
                if nxt.kind not in ("Ident", "Keyword"):
                    self.err(f"expected field name, found '{nxt.value}' at {_loc_str(nxt.loc)}")
                    break
                self.advance()
                if self.is_punct("("):
                    self.advance()
                    args: List[Expr] = []
                    if not self.is_punct(")"):
                        while True:
                            if self.is_punct(")"):
                                break
                            args.append(self.parse_expr())
                            if not self.eat_punct(","):
                                break
                    self.expect_punct(")")
                    e = MethodCall(loc=make_loc(start, start, self.file), object=e, name=name, args=args)
                else:
                    e = Field(loc=make_loc(start, start, self.file), object=e, name=name)
                continue
            if t.kind == "Punct" and t.value == "?":
                start = e.loc.start
                self.advance()
                e = ErrorProp(loc=make_loc(start, start, self.file), expr=e)
                continue
            if allow_struct and t.kind == "Punct" and t.value == "{":
                if isinstance(e, Ident):
                    save = self.pos
                    self.advance()
                    if self.is_punct("}"):
                        self.advance()
                        e = StructExpr(loc=self.loc_from(e.loc), name=e.name, fields=[], spread=None)
                        continue
                    if self.peek().kind == "Ident" and self.is_punct(":", 1):
                        fields: List[StructExprField] = []
                        while True:
                            if self.is_punct("}"):
                                break
                            if self.is_punct(".."):
                                break
                            fname = self.advance().value
                            self.expect_punct(":")
                            value = self.parse_expr(allow_struct=False)
                            fields.append(StructExprField(name=fname, value=value, loc=make_loc(self.peek().loc.start, self.peek().loc.start, self.file)))
                            if not self.eat_punct(","):
                                break
                        spread: Optional[Expr] = None
                        if self.is_punct(".."):
                            self.advance()
                            spread = self.parse_expr(allow_struct=False)
                            self.eat_punct(",")
                        self.expect_punct("}")
                        e = StructExpr(loc=self.loc_from(e.loc), name=e.name, fields=fields, spread=spread)
                        continue
                    self.pos = save  # not a struct literal; restore and bail
                    break
            break
        return e

    def apply_postfix(self, e: Expr, allow_struct: bool) -> Expr:
        return self.parse_postfix(e, allow_struct)

    def parse_atom(self, allow_struct: bool) -> Expr:
        t = self.peek()
        start = t.loc
        if t.kind == "Int":
            self.advance()
            return IntLit(loc=self.loc_from(start), value=int(t.value, 10))
        if t.kind == "Float":
            self.advance()
            return FloatLit(loc=self.loc_from(start), value=float(t.value))
        if t.kind == "Hex":
            self.advance()
            return IntLit(loc=self.loc_from(start), value=int(t.value[2:], 16))
        if t.kind == "Binary":
            self.advance()
            return IntLit(loc=self.loc_from(start), value=int(t.value[2:], 2))
        if t.kind == "Octal":
            self.advance()
            return IntLit(loc=self.loc_from(start), value=int(t.value[2:], 8))
        if t.kind == "Char":
            self.advance()
            return CharLit(loc=self.loc_from(start), value=t.value)
        if t.kind == "String":
            self.advance()
            segments = self.parse_string_segments(t.segments or [])
            return StringLit(loc=self.loc_from(start), segments=segments)
        if t.kind == "Keyword":
            if t.value == "true":
                self.advance()
                return BoolLit(loc=self.loc_from(start), value=True)
            if t.value == "false":
                self.advance()
                return BoolLit(loc=self.loc_from(start), value=False)
            if t.value == "self":
                self.advance()
                return SelfExpr(loc=self.loc_from(start))
            if t.value == "unit":
                self.advance()
                return UnitLit(loc=self.loc_from(start))
            if t.value == "fn":
                # lambda
                self.advance()
                params = self.parse_params()
                ret: Optional[TypeNode] = None
                if self.eat_punct("->"):
                    ret = self.parse_type()
                body = self.parse_block()
                return Lambda(loc=self.loc_from(start), params=params, ret=ret, body=body)
            if t.value == "return":
                self.advance()
                expr: Optional[Expr] = None
                if not (self.is_punct(";") or self.is_punct("}") or self.is_punct(")") or self.at_end()):
                    expr = self.parse_expr()
                return Return(loc=self.loc_from(start), expr=expr)
            if t.value == "if":
                return self.parse_if()
            if t.value == "match":
                return self.parse_match()
            if t.value == "dyn":
                self.advance()
                trait_tok = self.advance()
                if trait_tok.kind != "Ident":
                    self.err(f"expected trait name after 'dyn', found '{trait_tok.value}'", trait_tok.loc)
                trait_name = trait_tok.value or "_"
                if self.is_punct("<"):
                    self.advance()
                    while not self.is_punct(">"):
                        self.advance()
                    self.expect_punct(">")
                if self.is_punct("("):
                    self.advance()
                    args: List[Expr] = []
                    if not self.is_punct(")"):
                        while True:
                            if self.is_punct(")"):
                                break
                            args.append(self.parse_expr())
                            if not self.eat_punct(","):
                                break
                    self.expect_punct(")")
                    return Call(loc=self.loc_from(start), callee=Ident(loc=self.loc_from(start), name=f"__dyn_{trait_name}"), args=args)
                return Ident(loc=self.loc_from(start), name=f"__dyn_{trait_name}")
            if t.value == "range":
                self.advance()
                if self.is_punct("("):
                    self.advance()
                    args: List[Expr] = []
                    if not self.is_punct(")"):
                        while True:
                            if self.is_punct(")"):
                                break
                            args.append(self.parse_expr())
                            if not self.eat_punct(","):
                                break
                    self.expect_punct(")")
                    return Call(loc=self.loc_from(start), callee=Ident(loc=self.loc_from(start), name="range"), args=args)
                return Ident(loc=self.loc_from(start), name="range")
        if self.is_punct("("):
            self.advance()
            if self.eat_punct(")"):
                return UnitLit(loc=self.loc_from(start))
            e = self.parse_expr()
            if self.eat_punct(","):
                elements: List[Expr] = [e]
                while True:
                    if self.is_punct(")"):
                        break
                    elements.append(self.parse_expr())
                    if not self.eat_punct(","):
                        break
                self.expect_punct(")")
                return TupleExpr(loc=self.loc_from(start), elements=elements)
            self.expect_punct(")")
            return Paren(loc=self.loc_from(start), expr=e)
        if self.is_punct("["):
            self.advance()
            elements: List[Expr] = []
            if not self.is_punct("]"):
                while True:
                    if self.is_punct("]"):
                        break
                    if self.is_punct(".."):
                        self.advance()
                        spread = self.parse_expr(allow_struct=False)
                        _ = spread  # v1 ignores spread in arrays (would desugar in future)
                        continue
                    elements.append(self.parse_expr())
                    if not self.eat_punct(","):
                        break
            self.expect_punct("]")
            return ArrayExpr(loc=self.loc_from(start), elements=elements)
        if self.is_punct("{"):
            return self.parse_brace_expr()
        if t.kind == "Ident":
            name = self.advance().value
            if self.is_punct("::"):
                self.advance()
                variant = self.advance().value
                args: List[Expr] = []
                if self.eat_punct("("):
                    if not self.is_punct(")"):
                        while True:
                            if self.is_punct(")"):
                                break
                            args.append(self.parse_expr())
                            if not self.eat_punct(","):
                                break
                    self.expect_punct(")")
                return EnumVariant(loc=self.loc_from(start), enum_name=name, variant=variant, args=args)
            if self.is_punct("<") and _could_start_type(self.peek(1)):
                save = self.pos
                save_err_count = len(self.errors)
                self.advance()  # consume `<`
                type_args: List[TypeNode] = []
                valid = True
                try:
                    while True:
                        if self.is_punct(">"):
                            break
                        type_args.append(self.parse_type())
                        if not self.eat_punct(","):
                            break
                    if not self.eat_punct(">"):
                        valid = False
                except Exception:
                    valid = False
                errored = len(self.errors) != save_err_count
                if valid and not errored and self.is_punct("("):
                    self.advance()
                    args: List[Expr] = []
                    if not self.is_punct(")"):
                        while True:
                            if self.is_punct(")"):
                                break
                            args.append(self.parse_expr())
                            if not self.eat_punct(","):
                                break
                    self.expect_punct(")")
                    return Call(loc=self.loc_from(start), callee=Ident(loc=self.loc_from(start), name=name), args=args, type_args=type_args)
                # not a generic call — restore
                del self.errors[save_err_count:]
                self.pos = save
            return Ident(loc=self.loc_from(start), name=name)
        if t.kind in ("Eof", "Error"):
            self.err(f"unexpected end of input at {_loc_str(t.loc)}")
            return UnitLit(loc=self.loc_from(start))
        self.err(f"unexpected token '{t.value}' at {_loc_str(t.loc)}")
        self.advance()
        return UnitLit(loc=self.loc_from(start))

    def parse_string_segments(self, segments: List[StringSegment]) -> List[StringSegment]:
        out: List[StringSegment] = []
        for seg in segments:
            if seg.kind == "text":
                out.append(seg)
                continue
            try:
                inner_tokens = tokenize(seg.value, self.file)
                sub = Parser(inner_tokens, self.file)
                if len(sub.tokens) > 1:
                    e = sub.parse_expr()
                    if sub.errors:
                        for err in sub.errors:
                            self.errors.append(err)
                    out.append(StringSegment(kind="interp", value=seg.value, expr=e))
                    continue
            except Exception as e:
                self.err(f"failed to parse interpolation '{seg.value}': {e}")
            out.append(seg)
        return out

    def parse_if(self) -> Expr:
        start = self.peek().loc
        self.advance()  # if
        cond = self.parse_expr(allow_struct=False)
        then = self.parse_block()
        els: Optional[Expr] = None
        if self.eat_keyword("else"):
            if self.is_keyword("if"):
                els = self.parse_if()
            else:
                els = self.parse_block()
        return If(loc=self.loc_from(start), cond=cond, then=then, else_=els)

    def parse_match(self) -> Expr:
        start = self.peek().loc
        self.advance()
        scrutinee = self.parse_expr(allow_struct=False)
        self.expect_punct("{")
        arms: List[MatchArm] = []
        while not self.is_punct("}") and not self.at_end():
            a_start = self.peek().loc
            pattern = self.parse_pattern()
            guard: Optional[Expr] = None
            if self.eat_keyword("if"):
                guard = self.parse_expr(allow_struct=False)
            self.expect_punct("=>")
            body = self.parse_expr()
            arms.append(MatchArm(pattern=pattern, body=body, loc=self.loc_from(a_start), guard=guard))
            if not self.eat_punct(","):
                if not self.is_punct("}"):
                    self.err(f"expected ',' or '}}' after match arm at {_loc_str(self.peek().loc)}")
                    self.recover()
        self.expect_punct("}")
        return Match(loc=self.loc_from(start), scrutinee=scrutinee, arms=arms)

    def parse_block(self) -> Block:
        start = self.peek().loc
        self.expect_punct("{")
        stmts: List[Stmt] = []
        trailing: Optional[Expr] = None
        while not self.is_punct("}") and not self.at_end():
            if self.is_stmt_start():
                s = self.parse_stmt()
                if s is not None:
                    stmts.append(s)
                self.eat_punct(";")
                continue
            e = self.parse_expr()
            if self.is_punct("="):
                self.advance()
                value = self.parse_expr()
                self.expect_punct(";")
                stmts.append(AssignStmt(loc=self.loc_from(start), target=e, value=value))
                continue
            if self.is_punct(("+=", "-=", "*=", "/=", "%=")):
                op = self.advance().value[0]
                value = self.parse_expr()
                self.expect_punct(";")
                stmts.append(AssignStmt(loc=self.loc_from(start), target=e,
                                value=CompoundAssign(loc=self.loc_from(start), op=op, target=e, value=value)))
                continue
            if self.is_punct(";"):
                self.advance()
                if _is_assignment_expr(e):
                    stmts.append(AssignStmt(loc=e.loc, target=e.target, value=e.value))  # type: ignore[attr-defined]
                else:
                    stmts.append(ExprStmt(loc=self.loc_from(start), expr=e))
                continue
            if self.is_punct("}"):
                trailing = e
                break
            self.err(f"expected ';' or '}}' in block at {_loc_str(self.peek().loc)}")
            self.recover()
        self.expect_punct("}")
        return Block(loc=self.loc_from(start), stmts=stmts, expr=trailing)

    def parse_brace_expr(self) -> Expr:
        start = self.peek().loc
        self.advance()  # `{`
        if self.is_punct("}"):
            self.advance()
            return Block(loc=self.loc_from(start), stmts=[], expr=None)
        if not self.is_stmt_start():
            first_expr = self.parse_expr()
            if self.is_punct(":"):
                self.advance()
                value = self.parse_expr()
                entries: List[MapEntry] = [MapEntry(key=first_expr, value=value, loc=self.loc_from(start))]
                while self.eat_punct(","):
                    if self.is_punct("}"):
                        break
                    k = self.parse_expr()
                    self.expect_punct(":")
                    v = self.parse_expr()
                    entries.append(MapEntry(key=k, value=v, loc=self.loc_from(start)))
                self.expect_punct("}")
                return MapExpr(loc=self.loc_from(start), entries=entries)
            stmts: List[Stmt] = []
            if self.is_punct(("=", "+=", "-=", "*=", "/=", "%=")):
                op = self.advance().value
                value = self.parse_expr()
                self.expect_punct(";")
                if op == "=":
                    stmts.append(AssignStmt(loc=self.loc_from(start), target=first_expr, value=value))
                else:
                    stmts.append(AssignStmt(loc=self.loc_from(start), target=first_expr,
                                    value=CompoundAssign(loc=self.loc_from(start), op=op[0], target=first_expr, value=value)))
            elif self.is_punct(";"):
                self.advance()
                if _is_assignment_expr(first_expr):
                    stmts.append(AssignStmt(loc=first_expr.loc, target=first_expr.target, value=first_expr.value))  # type: ignore[attr-defined]
                else:
                    stmts.append(ExprStmt(loc=self.loc_from(start), expr=first_expr))
            elif self.is_punct("}"):
                self.advance()
                return Block(loc=self.loc_from(start), stmts=[], expr=first_expr)
            else:
                self.err(f"expected ';' or '}}' in block at {_loc_str(self.peek().loc)}")
                self.recover()
            trailing: Optional[Expr] = None
            while not self.is_punct("}") and not self.at_end():
                if self.is_stmt_start():
                    s = self.parse_stmt()
                    if s is not None:
                        stmts.append(s)
                    self.eat_punct(";")
                    continue
                e = self.parse_expr()
                if self.is_punct(("=", "+=", "-=", "*=", "/=", "%=")):
                    op = self.advance().value
                    value = self.parse_expr()
                    self.expect_punct(";")
                    if op == "=":
                        stmts.append(AssignStmt(loc=self.loc_from(start), target=e, value=value))
                    else:
                        stmts.append(AssignStmt(loc=self.loc_from(start), target=e,
                                        value=CompoundAssign(loc=self.loc_from(start), op=op[0], target=e, value=value)))
                elif self.is_punct(";"):
                    self.advance()
                    if _is_assignment_expr(e):
                        stmts.append(AssignStmt(loc=e.loc, target=e.target, value=e.value))  # type: ignore[attr-defined]
                    else:
                        stmts.append(ExprStmt(loc=self.loc_from(start), expr=e))
                elif self.is_punct("}"):
                    trailing = e
                    break
                else:
                    self.err(f"expected ';' or '}}' in block at {_loc_str(self.peek().loc)}")
                    self.recover()
            self.expect_punct("}")
            return Block(loc=self.loc_from(start), stmts=stmts, expr=trailing)
        # Statement-start: parse statements (mirror parse_block).
        stmts: List[Stmt] = []
        trailing: Optional[Expr] = None
        while not self.is_punct("}") and not self.at_end():
            if self.is_stmt_start():
                s = self.parse_stmt()
                if s is not None:
                    stmts.append(s)
                self.eat_punct(";")
                continue
            e = self.parse_expr()
            if self.is_punct(("=", "+=", "-=", "*=", "/=", "%=")):
                op = self.advance().value
                value = self.parse_expr()
                self.expect_punct(";")
                if op == "=":
                    stmts.append(AssignStmt(loc=self.loc_from(start), target=e, value=value))
                else:
                    stmts.append(AssignStmt(loc=self.loc_from(start), target=e,
                                    value=CompoundAssign(loc=self.loc_from(start), op=op[0], target=e, value=value)))
            elif self.is_punct(";"):
                self.advance()
                if _is_assignment_expr(e):
                    stmts.append(AssignStmt(loc=e.loc, target=e.target, value=e.value))  # type: ignore[attr-defined]
                else:
                    stmts.append(ExprStmt(loc=self.loc_from(start), expr=e))
            elif self.is_punct("}"):
                trailing = e
                break
            else:
                self.err(f"expected ';' or '}}' in block at {_loc_str(self.peek().loc)}")
                self.recover()
        self.expect_punct("}")
        return Block(loc=self.loc_from(start), stmts=stmts, expr=trailing)

    def is_stmt_start(self) -> bool:
        t = self.peek()
        if t.kind != "Keyword":
            return False
        if t.value == "fn":
            return self.peek(1).kind == "Ident"
        return t.value in {
            "let", "const", "enum", "struct", "type", "return", "break",
            "continue", "while", "for", "import", "pub", "print",
            "trait", "impl",
        }


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------


def _is_assignment_expr(e) -> bool:
    return isinstance(e, (Assign, CompoundAssign))


def _could_start_type(t: Token) -> bool:
    if t.kind == "Ident":
        return True
    if t.kind == "Keyword":
        return t.value in ("fn", "map", "option", "result", "unit")
    if t.kind == "Punct":
        return t.value in ("(", "[")
    return False


def _loc_str(loc: SourceLocation) -> str:
    return f"{loc.start.line}:{loc.start.col}"


# ----------------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------------


def parse(tokens: List[Token], file: str = "<aether>") -> ParseResult:
    """Parse a list of :class:`Token` into a :class:`ParseResult`.

    Always returns a :class:`ParseResult` (never raises) — any
    parse errors are collected in ``result.errors``.
    """
    p = Parser(tokens, file)
    return p.parse()


def parse_source(source: str, file: str = "<aether>") -> ParseResult:
    """Tokenize and parse a source string in one call."""
    tokens, _ = tokenize_with_errors(source, file)
    return parse(tokens, file)


__all__ = [
    "Parser", "ParseError", "ParseResult",
    "parse", "parse_source",
]
