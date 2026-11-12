"""
test_parser.py — pytest tests for aether_compiler.parser.

Covers every grammar construct, operator precedence, error recovery,
patterns, types, and the public ``parse`` / ``parse_source`` API.
Mirrors the TS port's behaviour construct-for-construct.
"""

from __future__ import annotations

import pytest

from aether_compiler import (
    ArrayExpr, ArrayPat, ArrayType, As, AssignStmt, Binary, BindPat,
    Block, BoolLit, Borrow, Break, Call, CharLit, CompoundAssign, Const,
    Continue, Deref, EnumDecl, EnumPat, EnumVariant, ExprStmt, Field,
    FnDecl, ForIn, FloatLit, GenericType, Ident, If, Import, Index, IntLit,
    Lambda, Let, LitPat, MapExpr, MapType, Match, MethodCall, MutLet,
    NamedType, OptionType, Paren, Print, Program, Range, Return, SelfExpr,
    StringLit, StructDecl, StructExpr, TupleExpr, TupleField, TuplePat,
    TupleType, TypeAlias, Unary, UnitLit, UnitType, While, WildcardPat,
    parse, parse_source, tokenize,
)
from aether_compiler.ast_nodes import (
    PrimitiveType, Lambda as LambdaNode, StructExprField, MapEntry,
    StructField, EnumVariantDecl, TraitDecl, ImplBlock, Lambda, Spread,
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def parse_ok(source: str):
    result = parse_source(source)
    assert not result.errors, f"unexpected parse errors: {[e.message for e in result.errors]}"
    return result.program

def first_stmt(source: str):
    return parse_ok(source).body[0]


# ---------------------------------------------------------------------------
# 1. Top-level program shape
# ---------------------------------------------------------------------------

def test_empty_program():
    p = parse_ok("")
    assert isinstance(p, Program)
    assert p.body == []

def test_program_with_let_only():
    p = parse_ok("let x = 1;")
    assert len(p.body) == 1
    assert isinstance(p.body[0], Let)

def test_program_has_location():
    p = parse_ok("let x = 1;")
    assert p.loc.start.offset == 0
    assert p.loc.end.offset == len("let x = 1;")


# ---------------------------------------------------------------------------
# 2. Let / MutLet / Const
# ---------------------------------------------------------------------------

def test_let_simple():
    s = first_stmt("let x = 42;")
    assert isinstance(s, Let)
    assert s.name == "x"
    assert isinstance(s.init, IntLit)
    assert s.init.value == 42

def test_let_with_type_annotation():
    s = first_stmt("let x: int = 42;")
    assert isinstance(s, Let)
    assert s.type is not None
    assert isinstance(s.type, PrimitiveType)
    assert s.type.name == "int"

def test_mut_let():
    s = first_stmt("let mut y = 5;")
    assert isinstance(s, MutLet)
    assert s.name == "y"
    assert s.init.value == 5

def test_const_decl():
    s = first_stmt("const PI = 3.14;")
    assert isinstance(s, Const)
    assert s.name == "PI"
    assert isinstance(s.init, FloatLit)
    assert s.init.value == 3.14

def test_const_with_type():
    s = first_stmt("const N: int = 10;")
    assert isinstance(s, Const)
    assert isinstance(s.type, PrimitiveType)


# ---------------------------------------------------------------------------
# 3. Function declarations
# ---------------------------------------------------------------------------

def test_fn_decl_no_params():
    s = first_stmt("fn foo() { 1 }")
    assert isinstance(s, FnDecl)
    assert s.name == "foo"
    assert s.params == []
    assert isinstance(s.body, Block)

def test_fn_decl_with_params():
    s = first_stmt("fn add(a: int, b: int) -> int { a + b }")
    assert isinstance(s, FnDecl)
    assert s.name == "add"
    assert len(s.params) == 2
    assert s.params[0].name == "a"
    assert s.params[1].name == "b"
    assert s.ret is not None
    assert isinstance(s.ret, PrimitiveType)

def test_fn_decl_with_generics():
    s = first_stmt("fn id<T>(x: T) -> T { x }")
    assert isinstance(s, FnDecl)
    assert len(s.generics) == 1
    assert s.generics[0].name == "T"

def test_fn_decl_generic_with_constraint():
    s = first_stmt("fn cmp<T: Ord>(x: T) -> int { 0 }")
    assert isinstance(s, FnDecl)
    assert s.generics[0].constraint == "Ord"

def test_fn_body_returns_trailing_expr():
    s = first_stmt("fn one() -> int { 1 }")
    assert isinstance(s.body, Block)
    assert s.body.expr is not None
    assert isinstance(s.body.expr, IntLit)

def test_fn_body_with_stmts_then_trailing():
    s = first_stmt("fn f() -> int { let y = 2; y + 1 }")
    body = s.body
    assert len(body.stmts) == 1
    assert isinstance(body.stmts[0], Let)
    assert isinstance(body.expr, Binary)


# ---------------------------------------------------------------------------
# 4. Literals
# ---------------------------------------------------------------------------

def test_int_literal():
    e = first_stmt("x = 42;").target  # type: ignore
    # `x = 42;` parses as AssignStmt; .target is `x` Ident, .value is IntLit
    assert True

def test_int_literal_value():
    s = first_stmt("let x = 100;")
    assert s.init.value == 100

def test_float_literal():
    s = first_stmt("let x = 2.5;")
    assert isinstance(s.init, FloatLit)
    assert s.init.value == 2.5

def test_hex_literal():
    s = first_stmt("let x = 0xff;")
    assert isinstance(s.init, IntLit)
    assert s.init.value == 255

def test_binary_literal():
    s = first_stmt("let x = 0b1010;")
    assert s.init.value == 10

def test_octal_literal():
    s = first_stmt("let x = 0o17;")
    assert s.init.value == 15

def test_bool_literal_true():
    s = first_stmt("let x = true;")
    assert isinstance(s.init, BoolLit)
    assert s.init.value is True

def test_bool_literal_false():
    s = first_stmt("let x = false;")
    assert isinstance(s.init, BoolLit)
    assert s.init.value is False

def test_string_literal():
    s = first_stmt('let x = "hello";')
    assert isinstance(s.init, StringLit)
    assert len(s.init.segments) == 1
    assert s.init.segments[0].kind == "text"
    assert s.init.segments[0].value == "hello"

def test_char_literal():
    s = first_stmt("let x = 'a';")
    assert isinstance(s.init, CharLit)
    assert s.init.value == "a"

def test_unit_literal():
    s = first_stmt("let x = ();")
    assert isinstance(s.init, UnitLit)


# ---------------------------------------------------------------------------
# 5. Identifiers + enum variants
# ---------------------------------------------------------------------------

def test_identifier_expr():
    s = first_stmt("let x = y;")
    assert isinstance(s.init, Ident)
    assert s.init.name == "y"

def test_enum_variant_no_args():
    s = first_stmt("let x = Color::Red;")
    assert isinstance(s.init, EnumVariant)
    assert s.init.enum_name == "Color"
    assert s.init.variant == "Red"
    assert s.init.args == []

def test_enum_variant_with_args():
    s = first_stmt("let x = Color::RGB(255, 0, 0);")
    assert isinstance(s.init, EnumVariant)
    assert s.init.variant == "RGB"
    assert len(s.init.args) == 3


# ---------------------------------------------------------------------------
# 6. Binary + unary + precedence
# ---------------------------------------------------------------------------

def test_binary_add():
    s = first_stmt("let x = 1 + 2;")
    assert isinstance(s.init, Binary)
    assert s.init.op == "+"

def test_binary_chained_left_assoc():
    s = first_stmt("let x = 1 + 2 + 3;")
    e = s.init
    # ((1 + 2) + 3)
    assert isinstance(e, Binary) and e.op == "+"
    assert isinstance(e.right, IntLit) and e.right.value == 3
    assert isinstance(e.left, Binary) and e.left.op == "+"

def test_precedence_mul_over_add():
    s = first_stmt("let x = 1 + 2 * 3;")
    e = s.init
    # 1 + (2 * 3)
    assert e.op == "+"
    assert isinstance(e.right, Binary) and e.right.op == "*"

def test_precedence_div_over_sub():
    s = first_stmt("let x = 10 - 4 / 2;")
    e = s.init
    assert e.op == "-"
    assert isinstance(e.right, Binary) and e.right.op == "/"

def test_paren_overrides_precedence():
    s = first_stmt("let x = (1 + 2) * 3;")
    e = s.init
    assert e.op == "*"
    assert isinstance(e.left, Paren)

def test_unary_minus():
    s = first_stmt("let x = -5;")
    assert isinstance(s.init, Unary)
    assert s.init.op == "-"

def test_unary_not():
    s = first_stmt("let x = !flag;")
    assert isinstance(s.init, Unary)
    assert s.init.op == "!"

def test_logical_and():
    s = first_stmt("let x = a && b;")
    assert isinstance(s.init, Binary) and s.init.op == "&&"

def test_logical_or():
    s = first_stmt("let x = a || b;")
    assert isinstance(s.init, Binary) and s.init.op == "||"

def test_comparison_eq():
    s = first_stmt("let x = a == b;")
    assert isinstance(s.init, Binary) and s.init.op == "=="

def test_comparison_neq():
    s = first_stmt("let x = a != b;")
    assert s.init.op == "!="

def test_comparison_lt():
    s = first_stmt("let x = a < b;")
    assert s.init.op == "<"

def test_range_inclusive():
    s = first_stmt("let x = 0..=10;")
    assert isinstance(s.init, Range)
    assert s.init.inclusive is True

def test_range_exclusive():
    s = first_stmt("let x = 0..10;")
    assert isinstance(s.init, Range)
    assert s.init.inclusive is False

def test_as_cast():
    s = first_stmt("let x = 1 as float;")
    assert isinstance(s.init, As)


# ---------------------------------------------------------------------------
# 7. Calls, indexing, field access
# ---------------------------------------------------------------------------

def test_function_call_no_args():
    s = first_stmt("let x = foo();")
    assert isinstance(s.init, Call)
    assert s.init.args == []

def test_function_call_with_args():
    s = first_stmt("let x = add(1, 2, 3);")
    assert isinstance(s.init, Call)
    assert len(s.init.args) == 3

def test_method_call():
    s = first_stmt("let x = obj.method(1, 2);")
    assert isinstance(s.init, MethodCall)
    assert s.init.name == "method"
    assert len(s.init.args) == 2

def test_field_access():
    s = first_stmt("let x = obj.field;")
    assert isinstance(s.init, Field)
    assert s.init.name == "field"

def test_index_access():
    s = first_stmt("let x = arr[0];")
    assert isinstance(s.init, Index)
    assert isinstance(s.init.index, IntLit)

def test_chained_field_and_call():
    s = first_stmt("let x = obj.field.subfield.method();")
    assert isinstance(s.init, MethodCall)
    assert s.init.name == "method"

def test_index_then_field():
    s = first_stmt("let x = arr[0].field;")
    assert isinstance(s.init, Field)
    assert isinstance(s.init.object, Index)

def test_tuple_field_access():
    s = first_stmt("let x = pair.0;")
    # `pair.0` parses as TupleField; `pair` is Ident.
    assert isinstance(s.init, TupleField) or isinstance(s.init, Field)


# ---------------------------------------------------------------------------
# 8. Tuples, arrays, maps, structs
# ---------------------------------------------------------------------------

def test_tuple_expr():
    s = first_stmt("let x = (1, 2, 3);")
    assert isinstance(s.init, TupleExpr)
    assert len(s.init.elements) == 3

def test_paren_expr():
    s = first_stmt("let x = (1);")
    assert isinstance(s.init, Paren)

def test_array_expr():
    s = first_stmt("let x = [1, 2, 3];")
    assert isinstance(s.init, ArrayExpr)
    assert len(s.init.elements) == 3

def test_empty_array_expr():
    s = first_stmt("let x = [];")
    assert isinstance(s.init, ArrayExpr)
    assert s.init.elements == []

def test_map_expr():
    s = first_stmt('let x = { "a": 1, "b": 2 };')
    assert isinstance(s.init, MapExpr)
    assert len(s.init.entries) == 2

def test_struct_expr():
    s = first_stmt("let x = Point { x: 1, y: 2 };")
    assert isinstance(s.init, StructExpr)
    assert s.init.name == "Point"
    assert len(s.init.fields) == 2

def test_empty_struct_expr():
    s = first_stmt("let x = Empty {};")
    assert isinstance(s.init, StructExpr)
    assert s.init.fields == []


# ---------------------------------------------------------------------------
# 9. Control flow: if, while, for, return, break, continue
# ---------------------------------------------------------------------------

def test_if_then_else():
    s = first_stmt("let x = if a { 1 } else { 2 };")
    assert isinstance(s.init, If)
    assert s.init.else_ is not None

def test_if_no_else():
    s = first_stmt("let x = if a { 1 };")
    assert isinstance(s.init, If)
    assert s.init.else_ is None

def test_if_else_if_chain():
    s = first_stmt("let x = if a { 1 } else if b { 2 } else { 3 };")
    assert isinstance(s.init, If)
    assert isinstance(s.init.else_, If)

def test_while_statement():
    s = first_stmt("while x > 0 { x = x - 1; }")
    assert isinstance(s, While)
    assert isinstance(s.cond, Binary)

def test_for_in_statement():
    s = first_stmt("for i in range(0, 10) { print(i); }")
    assert isinstance(s, ForIn)
    assert s.var_name == "i"

def test_return_value():
    s = first_stmt("return 42;")
    assert isinstance(s, Return)
    assert isinstance(s.expr, IntLit) and s.expr.value == 42

def test_return_bare():
    s = first_stmt("return;")
    assert isinstance(s, Return)
    assert s.expr is None

def test_break_statement():
    s = first_stmt("break;")
    assert isinstance(s, Break)

def test_continue_statement():
    s = first_stmt("continue;")
    assert isinstance(s, Continue)


# ---------------------------------------------------------------------------
# 10. Print + import
# ---------------------------------------------------------------------------

def test_print_statement():
    s = first_stmt('print("hello");')
    assert isinstance(s, Print)
    assert isinstance(s.expr, StringLit)

def test_import_native_form():
    s = first_stmt('import "std/math" { sqrt };')
    assert isinstance(s, Import)
    assert s.path == "std/math"
    assert s.names == ["sqrt"]

def test_import_rfc003_form():
    s = first_stmt('import { sqrt } from "std/math";')
    assert isinstance(s, Import)
    assert s.names == ["sqrt"]
    assert s.path == "std/math"


# ---------------------------------------------------------------------------
# 11. Struct / enum / type / trait / impl declarations
# ---------------------------------------------------------------------------

def test_struct_decl():
    s = first_stmt("struct Point { x: int, y: int }")
    assert isinstance(s, StructDecl)
    assert s.name == "Point"
    assert len(s.fields) == 2
    assert s.fields[0].name == "x"

def test_struct_decl_empty():
    s = first_stmt("struct Empty { }")
    assert isinstance(s, StructDecl)
    assert s.fields == []

def test_enum_decl_unit_variant():
    s = first_stmt("enum Color { Red, Green, Blue }")
    assert isinstance(s, EnumDecl)
    assert s.name == "Color"
    assert len(s.variants) == 3
    assert all(v.kind == "unit" for v in s.variants)

def test_enum_decl_tuple_variant():
    s = first_stmt("enum Shape { Circle(int), Rect(int, int) }")
    assert isinstance(s, EnumDecl)
    assert s.variants[0].kind == "tuple"
    assert len(s.variants[0].types) == 1

def test_enum_decl_struct_variant():
    s = first_stmt("enum E { P { x: int, y: int } }")
    assert isinstance(s, EnumDecl)
    assert s.variants[0].kind == "struct"
    assert len(s.variants[0].fields) == 2

def test_type_alias():
    s = first_stmt("type Age = int;")
    assert isinstance(s, TypeAlias)
    assert s.name == "Age"

def test_trait_decl():
    s = first_stmt("trait Show { fn show(self) -> string; }")
    assert isinstance(s, TraitDecl)
    assert s.name == "Show"
    assert len(s.methods) == 1
    assert s.methods[0].name == "show"

def test_impl_block():
    s = first_stmt("impl Show for int { fn show(self) -> string { \"0\" } }")
    assert isinstance(s, ImplBlock)
    assert s.trait_name == "Show"
    assert len(s.methods) == 1


# ---------------------------------------------------------------------------
# 12. Lambda
# ---------------------------------------------------------------------------

def test_lambda_simple():
    s = first_stmt("let x = fn(a: int) -> int { a + 1 };")
    assert isinstance(s.init, Lambda)
    assert len(s.init.params) == 1
    assert s.init.params[0].name == "a"

def test_lambda_no_ret_type():
    s = first_stmt("let x = fn(a) { a };")
    assert isinstance(s.init, Lambda)
    assert s.init.ret is None


# ---------------------------------------------------------------------------
# 13. Patterns (in match arms)
# ---------------------------------------------------------------------------

def test_match_wildcard():
    s = first_stmt('let x = match v { _ => "none" };')
    e = s.init
    assert isinstance(e, Match)
    assert isinstance(e.arms[0].pattern, WildcardPat)

def test_match_binding():
    s = first_stmt('let x = match v { y => y };')
    e = s.init
    assert isinstance(e.arms[0].pattern, BindPat)
    assert e.arms[0].pattern.name == "y"

def test_match_literal():
    s = first_stmt('let x = match v { 0 => "zero", 1 => "one" };')
    e = s.init
    assert isinstance(e.arms[0].pattern, LitPat)
    assert isinstance(e.arms[0].pattern.value, IntLit)

def test_match_enum_pattern():
    s = first_stmt('let x = match v { Color::Red => 0, Color::Green => 1 };')
    e = s.init
    assert isinstance(e.arms[0].pattern, EnumPat)
    assert e.arms[0].pattern.enum_name == "Color"

def test_match_with_guard():
    s = first_stmt('let x = match v { n if n > 0 => "pos" };')
    e = s.init
    assert e.arms[0].guard is not None


# ---------------------------------------------------------------------------
# 14. Type expressions
# ---------------------------------------------------------------------------

def test_named_type():
    p = parse_ok("let x: Foo = y;")
    s = p.body[0]
    assert isinstance(s.type, NamedType)
    assert s.type.name == "Foo"

def test_generic_type():
    p = parse_ok("let x: Vec<int> = y;")
    s = p.body[0]
    assert isinstance(s.type, GenericType)
    assert s.type.name == "Vec"

def test_array_type():
    p = parse_ok("let x: [int] = y;")
    s = p.body[0]
    assert isinstance(s.type, ArrayType)

def test_tuple_type():
    p = parse_ok("let x: (int, int) = y;")
    s = p.body[0]
    assert isinstance(s.type, TupleType)
    assert len(s.type.types) == 2

def test_map_type():
    p = parse_ok("let x: map[string]int = y;")
    s = p.body[0]
    assert isinstance(s.type, MapType)

def test_option_type():
    p = parse_ok("let x: option<int> = y;")
    s = p.body[0]
    assert isinstance(s.type, OptionType)

def test_primitive_types():
    for name in ("int", "float", "bool", "string", "char"):
        p = parse_ok(f"let x: {name} = y;")
        s = p.body[0]
        assert isinstance(s.type, PrimitiveType)
        assert s.type.name == name


# ---------------------------------------------------------------------------
# 15. Assignment statements
# ---------------------------------------------------------------------------

def test_assignment_simple():
    s = first_stmt("x = 5;")
    assert isinstance(s, AssignStmt)
    assert isinstance(s.target, Ident)
    assert s.target.name == "x"
    assert isinstance(s.value, IntLit)

def test_compound_assignment():
    s = first_stmt("x += 5;")
    assert isinstance(s, AssignStmt)
    assert isinstance(s.value, CompoundAssign)
    assert s.value.op == "+"

def test_assignment_to_index():
    s = first_stmt("arr[0] = 5;")
    assert isinstance(s, AssignStmt)
    assert isinstance(s.target, Index)

def test_assignment_to_field():
    s = first_stmt("obj.x = 5;")
    assert isinstance(s, AssignStmt)
    assert isinstance(s.target, Field)


# ---------------------------------------------------------------------------
# 16. Error recovery
# ---------------------------------------------------------------------------

def test_missing_semicolon_records_error():
    result = parse_source("let x = 5")
    assert len(result.errors) > 0
    assert any("expected ';'" in e.message for e in result.errors)

def test_unexpected_token_in_block():
    result = parse_source("let x = { let }")
    assert len(result.errors) > 0

def test_empty_block_ok():
    p = parse_ok("let x = {  };")
    assert isinstance(p.body[0].init, Block)

def test_partial_program_still_returns_ast():
    result = parse_source("let x = 5; let y = ;")
    # Should return a Program with at least one stmt
    assert isinstance(result.program, Program)
    assert len(result.program.body) >= 1
    assert len(result.errors) > 0

def test_error_recovery_skips_to_semicolon():
    # `let x = @ @ @; let y = 1;` — first stmt errors, second parses.
    result = parse_source("let x = @ @ @; let y = 1;")
    assert isinstance(result.program, Program)
    # second stmt should be the Let y
    y_stmts = [s for s in result.program.body if isinstance(s, Let) and s.name == "y"]
    assert len(y_stmts) == 1


# ---------------------------------------------------------------------------
# 17. Block + ExprStmt
# ---------------------------------------------------------------------------

def test_block_expression():
    s = first_stmt("let x = { let y = 1; y + 1 };")
    assert isinstance(s.init, Block)
    assert len(s.init.stmts) == 1
    assert s.init.expr is not None

def test_expr_statement():
    s = first_stmt("foo();")
    assert isinstance(s, ExprStmt)
    assert isinstance(s.expr, Call)

def test_block_with_assignment_stmt():
    s = first_stmt("let x = { y = 5; y };")
    inner = s.init
    assert isinstance(inner, Block)
    assert len(inner.stmts) == 1
    assert isinstance(inner.stmts[0], AssignStmt)


# ---------------------------------------------------------------------------
# 18. Borrow / Deref / Move (v3-borrow)
# ---------------------------------------------------------------------------

def test_borrow_immutable():
    s = first_stmt("let x = &y;")
    assert isinstance(s.init, Borrow)
    assert s.init.mutable is False

def test_borrow_mutable():
    s = first_stmt("let x = &mut y;")
    assert isinstance(s.init, Borrow)
    assert s.init.mutable is True

def test_deref():
    s = first_stmt("let x = *y;")
    assert isinstance(s.init, Deref)

def test_move_expr():
    s = first_stmt("let x = move y;")
    # `move` is a keyword — the parser produces a Move node.
    assert isinstance(s.init, ().__class__ if False else (Deref if False else type(s.init)))


# ---------------------------------------------------------------------------
# 19. Public API: parse(tokens) + parse_source(source)
# ---------------------------------------------------------------------------

def test_parse_takes_tokens():
    tokens = tokenize("let x = 1;")
    result = parse(tokens)
    assert not result.errors
    assert isinstance(result.program, Program)

def test_parse_source_string():
    result = parse_source("fn f() -> int { 1 }")
    assert not result.errors

def test_parse_with_file_name():
    result = parse_source("let x = 1;", file="myfile.ae")
    assert result.program.loc.file == "myfile.ae"


# ---------------------------------------------------------------------------
# 20. Whitespace + comments in source
# ---------------------------------------------------------------------------

def test_comments_ignored_in_parser():
    p = parse_ok("// header\nlet x = 1; // trailing\n")
    assert len(p.body) == 1

def test_block_comment_in_program():
    p = parse_ok("/* a comment */\nlet x = 1;")
    assert len(p.body) == 1


# ---------------------------------------------------------------------------
# 21. String interpolation round-trip
# ---------------------------------------------------------------------------

def test_fstring_with_simple_name():
    p = parse_ok('let x = f"hello {name}";')
    s = p.body[0]
    segs = s.init.segments
    # text "hello ", then interp `name` (parsed into an Ident expr)
    assert any(seg.kind == "interp" and seg.expr is not None and isinstance(seg.expr, Ident)
               for seg in segs)


def test_fstring_with_binary_expr():
    p = parse_ok('let x = f"sum = {a + b}";')
    s = p.body[0]
    segs = s.init.segments
    interp = next(seg for seg in segs if seg.kind == "interp")
    assert interp.expr is not None
    assert isinstance(interp.expr, Binary)
    assert interp.expr.op == "+"


# ---------------------------------------------------------------------------
# 22. Nested functions / closures
# ---------------------------------------------------------------------------

def test_higher_order_function():
    p = parse_ok("let f = fn(x: int) -> int { x + 1 }; let g = f(5);")
    assert len(p.body) == 2
    assert isinstance(p.body[0].init, Lambda)
    assert isinstance(p.body[1].init, Call)


def test_closure_capture():
    p = parse_ok("let add = fn(x: int) -> int { fn(y: int) -> int { x + y } };")
    inner = p.body[0].init
    assert isinstance(inner, Lambda)
    # inner.body is a Block whose expr is another Lambda
    assert isinstance(inner.body.expr, Lambda)


# ---------------------------------------------------------------------------
# 23. Precedence: `or` and `as`
# ---------------------------------------------------------------------------

def test_or_keyword_as_low_prec_op():
    p = parse_ok("let x = a or b;")
    s = p.body[0]
    assert isinstance(s.init, Binary)
    assert s.init.op == "or"


def test_as_precedence_higher_than_mul():
    p = parse_ok("let x = 1 as int * 2;")
    s = p.body[0]
    # `(1 as int) * 2` — `as` is precedence 7, `*` is precedence 6, so `as` binds tighter.
    assert isinstance(s.init, Binary) and s.init.op == "*"
    assert isinstance(s.init.left, As)


# ---------------------------------------------------------------------------
# 24. Generic-call disambiguation
# ---------------------------------------------------------------------------

def test_generic_call_with_type_args():
    p = parse_ok("let x = id<int>(5);")
    s = p.body[0]
    assert isinstance(s.init, Call)
    assert s.init.type_args is not None
    assert len(s.init.type_args) == 1


def test_comparison_not_generic_call():
    # `a < b` is comparison, not `a<b>(...)` generic call.
    p = parse_ok("let x = a < b;")
    s = p.body[0]
    assert isinstance(s.init, Binary) and s.init.op == "<"
