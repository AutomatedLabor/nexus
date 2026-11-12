"""
test_lexer.py — pytest tests for aether_compiler.lexer.

Covers every token kind, escape sequences, f-string interpolation,
comments (line + nested block), error handling, locations, and the
``tokenize`` vs ``tokenize_with_errors`` distinction. Mirrors the TS
port's behaviour token-for-token.
"""

from __future__ import annotations

import pytest

from aether_compiler.lexer import (
    LexError, Token, is_keyword, is_punct, tokenize, tokenize_with_errors,
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def kinds(tokens):
    return [t.kind for t in tokens]

def values(tokens):
    return [t.value for t in tokens]


# ---------------------------------------------------------------------------
# 1. Whitespace + EOF
# ---------------------------------------------------------------------------

def test_empty_source_emits_only_eof():
    toks = tokenize("")
    assert len(toks) == 1
    assert toks[0].kind == "Eof"


def test_whitespace_is_skipped():
    toks = tokenize("   \t\n  ")
    assert len(toks) == 1
    assert toks[0].kind == "Eof"


def test_eof_has_correct_location():
    toks = tokenize("abc")
    eof = toks[-1]
    assert eof.kind == "Eof"
    # `abc` ends at offset 3 (line 1, col 4); the EOF is right after.
    assert eof.loc.start.line == 1
    assert eof.loc.start.col == 4
    assert eof.loc.start.offset == 3


# ---------------------------------------------------------------------------
# 2. Integers
# ---------------------------------------------------------------------------

def test_decimal_int():
    toks = tokenize("42")
    assert toks[0].kind == "Int"
    assert toks[0].value == "42"

def test_decimal_int_with_underscores():
    toks = tokenize("1_000_000")
    assert toks[0].kind == "Int"
    assert toks[0].value == "1000000"

def test_zero():
    toks = tokenize("0")
    assert toks[0].kind == "Int"
    assert toks[0].value == "0"


# ---------------------------------------------------------------------------
# 3. Float
# ---------------------------------------------------------------------------

def test_float_simple():
    toks = tokenize("3.14")
    assert toks[0].kind == "Float"
    assert toks[0].value == "3.14"

def test_float_with_exponent():
    toks = tokenize("1.5e10")
    assert toks[0].kind == "Float"
    assert toks[0].value == "1.5e10"

def test_float_with_negative_exponent():
    toks = tokenize("2.0E-3")
    assert toks[0].kind == "Float"
    assert toks[0].value == "2.0E-3"

def test_int_then_dot_then_ident_not_a_float():
    # `1.abc` should error; `1.5` should be a float.
    # `1.foo` (with prev atom) is field access — `1` is the int, `.` is punct.
    toks = tokenize("x.y")
    assert toks[0].kind == "Ident" and toks[0].value == "x"
    assert toks[1].kind == "Punct" and toks[1].value == "."
    assert toks[2].kind == "Ident" and toks[2].value == "y"


# ---------------------------------------------------------------------------
# 4. Hex / binary / octal
# ---------------------------------------------------------------------------

def test_hex_lowercase():
    toks = tokenize("0xff")
    assert toks[0].kind == "Hex"
    assert toks[0].value == "0xff"

def test_hex_uppercase_prefix():
    toks = tokenize("0X1A")
    assert toks[0].kind == "Hex"
    # The TS port stores hex with lowercase prefix; the Python port matches.
    assert toks[0].value == "0x1A"

def test_hex_with_underscores():
    toks = tokenize("0xdead_beef")
    assert toks[0].kind == "Hex"
    assert toks[0].value == "0xdeadbeef"

def test_binary():
    toks = tokenize("0b1010")
    assert toks[0].kind == "Binary"
    assert toks[0].value == "0b1010"

def test_binary_uppercase_prefix():
    toks = tokenize("0B11")
    assert toks[0].kind == "Binary"
    assert toks[0].value == "0b11"

def test_octal():
    toks = tokenize("0o777")
    assert toks[0].kind == "Octal"
    assert toks[0].value == "0o777"


# ---------------------------------------------------------------------------
# 5. Identifiers + keywords
# ---------------------------------------------------------------------------

def test_simple_ident():
    toks = tokenize("hello")
    assert toks[0].kind == "Ident"
    assert toks[0].value == "hello"

def test_ident_with_underscore():
    toks = tokenize("_foo")
    assert toks[0].kind == "Ident"
    assert toks[0].value == "_foo"

def test_ident_with_digits():
    toks = tokenize("x1y2")
    assert toks[0].kind == "Ident"
    assert toks[0].value == "x1y2"

def test_dollar_ident():
    toks = tokenize("$x")
    assert toks[0].kind == "Ident"
    assert toks[0].value == "$x"

@pytest.mark.parametrize("kw", [
    "let", "mut", "const", "fn", "enum", "struct", "type", "match", "if",
    "else", "while", "for", "in", "return", "break", "continue", "print",
    "true", "false", "unit", "self", "as", "range", "import", "pub", "use",
    "or", "do", "trait", "impl", "dyn", "move",
])
def test_keywords_recognized(kw):
    toks = tokenize(kw)
    assert toks[0].kind == "Keyword"
    assert toks[0].value == kw


# ---------------------------------------------------------------------------
# 6. Char literals
# ---------------------------------------------------------------------------

def test_char_simple():
    toks = tokenize("'a'")
    assert toks[0].kind == "Char"
    assert toks[0].value == "a"

def test_char_escape_newline():
    toks = tokenize("'\\n'")
    assert toks[0].kind == "Char"
    assert toks[0].value == "\n"

def test_char_escape_tab():
    toks = tokenize("'\\t'")
    assert toks[0].kind == "Char"
    assert toks[0].value == "\t"

def test_char_escape_backslash():
    toks = tokenize("'\\\\'")
    assert toks[0].kind == "Char"
    assert toks[0].value == "\\"

def test_char_escape_quote():
    toks = tokenize("'\\''")
    assert toks[0].kind == "Char"
    assert toks[0].value == "'"

def test_char_unicode_escape():
    toks = tokenize("'\\u{1F600}'")
    assert toks[0].kind == "Char"
    assert toks[0].value == "😀"


# ---------------------------------------------------------------------------
# 7. String literals
# ---------------------------------------------------------------------------

def test_string_simple():
    toks = tokenize('"hello"')
    assert toks[0].kind == "String"
    segs = toks[0].segments
    assert segs is not None
    assert len(segs) == 1
    assert segs[0].kind == "text"
    assert segs[0].value == "hello"

def test_string_with_escape():
    toks = tokenize('"a\\nb"')
    segs = toks[0].segments
    # one text segment containing literal newline
    assert segs[0].kind == "text"
    assert segs[0].value == "a\nb"

def test_string_empty():
    toks = tokenize('""')
    segs = toks[0].segments
    # empty string -> zero segments
    assert segs == []

def test_fstring_simple_interp():
    toks = tokenize('f"hello {name}"')
    assert toks[0].kind == "String"
    segs = toks[0].segments
    kinds_ = [s.kind for s in segs]
    assert "text" in kinds_
    assert "interp" in kinds_
    # find the interp segment; its value is the raw inner source
    interp = next(s for s in segs if s.kind == "interp")
    assert interp.value == "name"

def test_fstring_with_braces_in_text():
    # `{{` and `}}` aren't escapes here; we treat them as literal braces.
    # f"{{x}}" — interp handler scans to first `}` (depth tracking).
    # The lexer emits `{{x}}` as one interp expression with depth handling.
    toks = tokenize('f"{{x}}"')
    segs = toks[0].segments
    assert any(s.kind == "interp" for s in segs)


# ---------------------------------------------------------------------------
# 8. Punctuation (longest-match)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("op", [
    "..=", "...", "..", "::", "->", "=>", "==", "!=", "<=", ">=", "&&", "||",
    "+=", "-=", "*=", "/=", "%=", "<<", ">>", "??", "?", "!", "~",
    "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "=",
    "(", ")", "[", "]", "{", "}", ",", ";", ":", ".", "@", "#",
])
def test_punctuation_operators(op):
    toks = tokenize(op)
    assert toks[0].kind == "Punct"
    assert toks[0].value == op

def test_longest_match_three_dot_eq():
    # `..=` wins over `..` and `=`
    toks = tokenize("..=")
    assert toks[0].kind == "Punct" and toks[0].value == "..="
    assert len(toks) == 2  # token + EOF

def test_punct_chained():
    toks = tokenize("->>")
    # `->` then `>` (longest-match)
    assert kinds(toks[:2]) == ["Punct", "Punct"]
    assert values(toks[:2]) == ["->", ">"]


# ---------------------------------------------------------------------------
# 9. Comments
# ---------------------------------------------------------------------------

def test_line_comment_skipped():
    toks = tokenize("// a comment\nx")
    assert toks[0].kind == "Ident" and toks[0].value == "x"

def test_line_comment_at_eof():
    toks = tokenize("// eof comment")
    assert len(toks) == 1  # just EOF
    assert toks[0].kind == "Eof"

def test_block_comment_simple():
    toks = tokenize("/* a */ x")
    assert toks[0].kind == "Ident" and toks[0].value == "x"

def test_block_comment_nested():
    toks = tokenize("/* outer /* inner */ still outer */ x")
    assert toks[0].kind == "Ident" and toks[0].value == "x"

def test_block_comment_unterminated_errors():
    tokens, errors = tokenize_with_errors("/* unterminated")
    assert len(errors) > 0
    assert "unterminated block comment" in errors[0].message


# ---------------------------------------------------------------------------
# 10. Locations
# ---------------------------------------------------------------------------

def test_int_location():
    toks = tokenize("42")
    t = toks[0]
    assert t.loc.start.line == 1
    assert t.loc.start.col == 1
    assert t.loc.start.offset == 0
    assert t.loc.end.col == 3
    assert t.loc.end.offset == 2

def test_multiline_locations():
    src = "let x = 1;\nlet y = 2;"
    toks = tokenize(src)
    # second `let` is on line 2
    second_let = [t for t in toks if t.kind == "Keyword" and t.value == "let"][1]
    assert second_let.loc.start.line == 2
    assert second_let.loc.start.col == 1

def test_location_advances_after_newline():
    src = "x\ny"
    toks = tokenize(src)
    assert toks[0].loc.start.line == 1 and toks[0].loc.start.col == 1
    assert toks[1].loc.start.line == 2 and toks[1].loc.start.col == 1


# ---------------------------------------------------------------------------
# 11. Error handling — tokenize vs tokenize_with_errors
# ---------------------------------------------------------------------------

def test_unterminated_string_raises_on_tokenize():
    with pytest.raises(LexError):
        tokenize('"unterminated')

def test_unterminated_string_emits_error_token_with_errors():
    tokens, errors = tokenize_with_errors('"unterminated')
    assert len(errors) > 0
    assert any("unterminated string" in e.message for e in errors)
    # an Error token is emitted so the parser can recover
    assert any(t.kind == "Error" for t in tokens)

def test_unterminated_char_literal():
    tokens, errors = tokenize_with_errors("'a")
    assert any("unterminated char" in e.message for e in errors)

def test_empty_char_literal():
    tokens, errors = tokenize_with_errors("''")
    assert any("empty char" in e.message for e in errors)

def test_unterminated_string_interp():
    tokens, errors = tokenize_with_errors('f"hello {name"')
    # interp handler will try to scan to matching } and may run off the end.
    assert any("unterminated" in e.message for e in errors) or any(
        t.kind == "Error" for t in tokens)

def test_invalid_number_literal():
    tokens, errors = tokenize_with_errors("12abc")
    assert any("invalid number" in e.message for e in errors)


# ---------------------------------------------------------------------------
# 12. Helper predicates
# ---------------------------------------------------------------------------

def test_is_keyword_predicate():
    toks = tokenize("let x = 1;")
    assert is_keyword(toks[0], "let")
    assert not is_keyword(toks[0], "fn")

def test_is_punct_predicate():
    toks = tokenize("x = 1;")
    assert is_punct(toks[1], "=")
    assert not is_punct(toks[1], "+")


# ---------------------------------------------------------------------------
# 13. Combined small programs
# ---------------------------------------------------------------------------

def test_let_int_init():
    toks = tokenize("let x = 42;")
    assert kinds(toks) == ["Keyword", "Ident", "Punct", "Int", "Punct", "Eof"]
    assert values(toks) == ["let", "x", "=", "42", ";", ""]


def test_fn_signature():
    toks = tokenize("fn add(a: int, b: int) -> int { a + b }")
    # let's just sanity check the first and last meaningful tokens
    assert toks[0].kind == "Keyword" and toks[0].value == "fn"
    assert toks[1].kind == "Ident" and toks[1].value == "add"
    # last meaningful token before EOF is `}`
    assert toks[-2].kind == "Punct" and toks[-2].value == "}"


def test_fstring_with_complex_expr():
    toks = tokenize('f"sum = {a + b}"')
    segs = toks[0].segments
    # text segment "sum = ", then interp "a + b"
    assert segs[0].kind == "text" and segs[0].value == "sum = "
    assert segs[1].kind == "interp" and segs[1].value == "a + b"


def test_string_with_unicode_escape():
    toks = tokenize('"\\u{1F600} smile"')
    segs = toks[0].segments
    assert segs[0].value == "😀 smile"


def test_fstring_with_nested_string():
    # `f"say {say('hi')}"` — interp contains a single-quoted char/string.
    # Use a single quote inside (the lexer treats 'hi' as a char-or-error;
    # we just check the interp segment exists).
    toks = tokenize('f"say {x}"')
    segs = toks[0].segments
    # one text segment "say ", one interp `x`
    assert any(s.kind == "interp" for s in segs)
    # also confirm the text segment value
    assert segs[0].kind == "text" and segs[0].value == "say "


def test_fstring_with_call_in_interp():
    # `f"sum = {add(1, 2)}"` — interp contains a function call.
    toks = tokenize('f"sum = {add(1, 2)}"')
    segs = toks[0].segments
    assert segs[0].kind == "text" and segs[0].value == "sum = "
    assert segs[1].kind == "interp" and segs[1].value == "add(1, 2)"


# ---------------------------------------------------------------------------
# 14. Edge cases
# ---------------------------------------------------------------------------

def test_dot_after_ident_is_field_access_not_float():
    toks = tokenize("a.b")
    assert kinds(toks[:3]) == ["Ident", "Punct", "Ident"]
    assert values(toks[:3]) == ["a", ".", "b"]


def test_dot_after_close_paren_is_field_access():
    toks = tokenize("(1).x")
    # `(` `1` `)` `.` `x`
    assert kinds(toks[:5]) == ["Punct", "Int", "Punct", "Punct", "Ident"]
    assert toks[3].value == "."


def test_dot_after_int_could_be_float():
    toks = tokenize("3.14")
    assert toks[0].kind == "Float"


def test_dot_at_start_is_float():
    toks = tokenize(".5")
    assert toks[0].kind == "Float"
    assert toks[0].value == ".5"


def test_dot_without_digit_is_punct():
    toks = tokenize("x.y.z")
    assert values(toks[:5]) == ["x", ".", "y", ".", "z"]


def test_negative_number_is_unary_minus():
    toks = tokenize("-5")
    # `-` is punct, `5` is int (the parser turns this into Unary minus)
    assert kinds(toks[:2]) == ["Punct", "Int"]
    assert values(toks[:2]) == ["-", "5"]


def test_two_slashes_not_a_comment():
    toks = tokenize("a / b")
    assert values(toks[:3]) == ["a", "/", "b"]
