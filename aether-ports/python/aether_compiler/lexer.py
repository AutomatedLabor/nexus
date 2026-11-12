"""
aether_compiler/lexer.py
========================
The Aether tokenizer (Python port).

Mirrors ``aether/core/lexer/lexer.ts`` token-for-token. Produces a
list of :class:`Token` objects whose ``kind``, ``value``, ``loc``,
and (for strings) ``segments`` fields match the TS port exactly.

Token model
-----------
A string literal (including f-string interpolations like
``f"Hello, {name}!"``) is tokenized as a *single* token of kind
``"String"``. Its ``segments`` field is a list of
:class:`StringSegment` objects where each segment is either
``{kind: "text", value: "..."}`` (raw text) or
``{kind: "interp", value: "name"}`` (the raw inner source,
including nested ``{ }`` for arbitrary expressions). The parser
re-lexes/parses the ``interp`` segments into Expr nodes when
building the AST — exactly as the TS port does.

Tokens produced
----------------
``Int``, ``Float``, ``Hex``, ``Binary``, ``Octal``, ``Char``,
``String``, ``Ident``, ``Keyword``, ``Punct``, ``Eof``, ``Error``.

Whitespace and comments (line ``//`` and nestable block comments
``/* ... /* ... */ ... */``) are skipped, but unterminated block
comments produce a lexer error.

Source locations
-----------------
Every token has a ``loc: SourceLocation`` spanning its slice of
the source. :class:`Position` is 1-based line/col, plus 0-based
absolute offset — same convention as the TS port.

Public API
----------
- :func:`tokenize(source, file="<aether>")` — returns a list of
  :class:`Token` (errors are raised as :class:`LexError`).
- :func:`tokenize_with_errors(source, file)` — returns
  ``(tokens, errors)``; never raises; the lexer keeps going past
  errors and emits :class:`Token` of kind ``"Error"`` so the
  parser can recover.

The "keeps going past errors" semantics match the TS port, which
is important because the playground wants to show *all* errors at
once, not bail on the first.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from typing import List, Optional

from .ast_nodes import Position, SourceLocation, StringSegment, make_loc


# ----------------------------------------------------------------------------
# Token model
# ----------------------------------------------------------------------------


TokenKind = str  # one of: Int, Float, Hex, Binary, Octal, Char, String,
#            Ident, Keyword, Punct, Eof, Error


@dataclass(slots=True)
class Token:
    kind: TokenKind
    value: str
    loc: SourceLocation
    segments: Optional[List[StringSegment]] = None


@dataclass
class LexError(Exception):
    """A lexer error. Subclass of Exception so callers can ``raise`` it.

    Carries the source location so the playground can render the
    error in the editor.
    """

    message: str
    loc: SourceLocation

    def __init__(self, message: str, loc: SourceLocation):
        super().__init__(message)
        self.message = message
        self.loc = loc


# ----------------------------------------------------------------------------
# Keyword + operator tables
# ----------------------------------------------------------------------------

KEYWORDS = {
    "let", "mut", "const", "fn", "enum", "struct", "type", "match", "if",
    "else", "while", "for", "in", "return", "break", "continue", "print",
    "true", "false", "unit", "self", "as", "range", "import", "pub", "use",
    "or", "do",
    # v3: trait / impl / dyn
    "trait", "impl", "dyn",
    # v3-borrow: move expression (RFC-004)
    "move",
}

# Longest-match wins; we sort by descending length at module-load time.
_PUNCT = [
    "..=", "...", "..", "::", "->", "=>", "==", "!=", "<=", ">=", "&&", "||",
    "+=", "-=", "*=", "/=", "%=", "<<", ">>", "??", "?", "!", "~",
    "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "=",
    "(", ")", "[", "]", "{", "}", ",", ";", ":", ".", "@", "#",
]
_PUNCT_SORTED = sorted(_PUNCT, key=lambda p: -len(p))

# Allow plain ASCII identifier chars (the common case).
_ASCII_IDENT_START = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$")
_ASCII_IDENT_CONT = _ASCII_IDENT_START | set("0123456789")
_ASCII_DIGIT = set("0123456789")
_ASCII_HEX = set("0123456789abcdefABCDEF")
_ASCII_BIN = set("01")
_ASCII_OCT = set("01234567")


def _is_digit(c: str) -> bool:
    return c in _ASCII_DIGIT


def _is_hex(c: str) -> bool:
    return c in _ASCII_HEX


def _is_bin(c: str) -> bool:
    return c in _ASCII_BIN


def _is_oct(c: str) -> bool:
    return c in _ASCII_OCT


# Unicode ID_Start / ID_Continue categories. We use ``unicodedata.category``
# so the lexer accepts non-ASCII identifiers (e.g. ``café`` or ``λ``) without
# any external regex library — matching the TS port's ``\p{ID_Start}`` /
# ``\p{ID_Continue}`` semantics.
_ID_START_CATEGORIES = {"Lu", "Ll", "Lt", "Lm", "Lo", "Nl", "Sc", "Pc"}
_ID_CONTINUE_CATEGORIES = _ID_START_CATEGORIES | {"Mn", "Mc", "Nd"}


def _is_ident_start(c: str) -> bool:
    if not c:
        return False
    if c in _ASCII_IDENT_START:
        return True
    cat = unicodedata.category(c)
    return cat in _ID_START_CATEGORIES


def _is_ident_cont(c: str) -> bool:
    if not c:
        return False
    if c in _ASCII_IDENT_CONT:
        return True
    cat = unicodedata.category(c)
    return cat in _ID_CONTINUE_CATEGORIES


# ----------------------------------------------------------------------------
# Lexer state
# ----------------------------------------------------------------------------


@dataclass
class _State:
    src: str
    file: str
    pos: int = 0
    line: int = 1
    col: int = 1
    tokens: List[Token] = field(default_factory=list)
    errors: List[LexError] = field(default_factory=list)


def _cur(s: _State) -> str:
    return s.src[s.pos] if s.pos < len(s.src) else ""


def _peek(s: _State, n: int = 0) -> str:
    return s.src[s.pos + n] if (s.pos + n) < len(s.src) else ""


def _advance(s: _State) -> str:
    c = s.src[s.pos]
    if c == "\n":
        s.line += 1
        s.col = 1
    else:
        s.col += 1
    s.pos += 1
    return c


def _pos_of(s: _State) -> Position:
    return Position(line=s.line, col=s.col, offset=s.pos)


def _loc_from(s: _State, start: Position) -> SourceLocation:
    return make_loc(start, _pos_of(s), s.file)


def _push(s: _State, kind: TokenKind, start: Position, value: str,
          segments: Optional[List[StringSegment]] = None) -> None:
    t = Token(kind=kind, value=value, loc=_loc_from(s, start), segments=segments)
    s.tokens.append(t)


def _err(s: _State, start: Position, message: str) -> None:
    s.errors.append(LexError(message=message, loc=_loc_from(s, start)))
    s.tokens.append(Token(kind="Error", value="", loc=_loc_from(s, start)))


def _prev_is_atom(s: _State) -> bool:
    """Whether the previous token is something that, if followed by ``.``,
    must be treated as field access rather than the start of a float
    literal. Mirrors the TS ``prevIsAtom`` helper.
    """
    if not s.tokens:
        return False
    prev = s.tokens[-1]
    if prev.kind in ("Ident", "Char", "String"):
        return True
    if prev.kind in ("Int", "Float", "Hex", "Binary", "Octal"):
        return True
    if prev.kind == "Punct" and prev.value in (")", "]"):
        return True
    if prev.kind == "Keyword" and prev.value in ("true", "false", "self", "unit"):
        return True
    return False


# ----------------------------------------------------------------------------
# Comment skippers
# ----------------------------------------------------------------------------


def _skip_line_comment(s: _State) -> None:
    while s.pos < len(s.src) and _cur(s) != "\n":
        _advance(s)


def _skip_block_comment(s: _State, start: Position) -> None:
    _advance(s); _advance(s)  # consume "/*"
    depth = 1
    while s.pos < len(s.src) and depth > 0:
        if _cur(s) == "/" and _peek(s, 1) == "*":
            _advance(s); _advance(s); depth += 1
        elif _cur(s) == "*" and _peek(s, 1) == "/":
            _advance(s); _advance(s); depth -= 1
        else:
            _advance(s)
    if depth > 0:
        _err(s, start, "unterminated block comment")


# ----------------------------------------------------------------------------
# Numbers
# ----------------------------------------------------------------------------


def _scan_number(s: _State, start: Position) -> None:
    raw = ""
    # Hex / binary / octal prefixes.
    if _cur(s) == "0" and _peek(s, 1) in ("x", "X"):
        _advance(s); _advance(s)
        while s.pos < len(s.src) and (_is_hex(_cur(s)) or _cur(s) == "_"):
            raw += _advance(s)
        _push(s, "Hex", start, "0x" + raw.replace("_", ""))
        return
    if _cur(s) == "0" and _peek(s, 1) in ("b", "B"):
        _advance(s); _advance(s)
        while s.pos < len(s.src) and (_is_bin(_cur(s)) or _cur(s) == "_"):
            raw += _advance(s)
        _push(s, "Binary", start, "0b" + raw.replace("_", ""))
        return
    if _cur(s) == "0" and _peek(s, 1) in ("o", "O"):
        _advance(s); _advance(s)
        while s.pos < len(s.src) and (_is_oct(_cur(s)) or _cur(s) == "_"):
            raw += _advance(s)
        _push(s, "Octal", start, "0o" + raw.replace("_", ""))
        return

    # Decimal int / float.
    is_float = False
    entered_exp = False
    while s.pos < len(s.src) and (_is_digit(_cur(s)) or _cur(s) == "_"):
        raw += _advance(s)
    # fractional part
    if _cur(s) == "." and _is_digit(_peek(s, 1)):
        is_float = True
        raw += _advance(s)
        while s.pos < len(s.src) and (_is_digit(_cur(s)) or _cur(s) == "_"):
            raw += _advance(s)
    # exponent
    if _cur(s) in ("e", "E"):
        save = s.pos
        save_line, save_col = s.line, s.col
        entered_exp = True
        exp = _advance(s)  # e
        if _cur(s) in ("+", "-"):
            exp += _advance(s)
        if _is_digit(_cur(s)):
            is_float = True
            while s.pos < len(s.src) and _is_digit(_cur(s)):
                exp += _advance(s)
            raw += exp
        else:
            # not an exponent; restore
            s.pos = save
            s.line = save_line
            s.col = save_col
    # suffix-less int literal: ensure we didn't stop on a letter (e.g. "12abc").
    if (s.pos < len(s.src) and _is_ident_start(_cur(s)) and not _is_digit(_cur(s))
            and (_cur(s) not in ("e", "E") or not entered_exp)):
        while s.pos < len(s.src) and _is_ident_cont(_cur(s)):
            raw += _advance(s)
        _err(s, start, f"invalid number literal '{raw}'")
        return
    _push(s, "Float" if is_float else "Int", start, raw.replace("_", ""))


# ----------------------------------------------------------------------------
# Characters
# ----------------------------------------------------------------------------


def _scan_escape(s: _State) -> str:
    c = _advance(s)
    if c == "n":
        return "\n"
    if c == "r":
        return "\r"
    if c == "t":
        return "\t"
    if c == "0":
        return "\0"
    if c == "\\":
        return "\\"
    if c == "'":
        return "'"
    if c == '"':
        return '"'
    if c == "u":
        # \u{...}
        hexs = ""
        if _cur(s) == "{":
            _advance(s)
            while s.pos < len(s.src) and _cur(s) != "}" and len(hexs) < 8:
                hexs += _advance(s)
            if _cur(s) == "}":
                _advance(s)
        try:
            code = int(hexs, 16) if hexs else 0
            return chr(code) if 0 <= code <= 0x10FFFF else ""
        except ValueError:
            return ""
    return c


def _scan_char(s: _State, start: Position) -> None:
    _advance(s)  # consume opening '
    if s.pos >= len(s.src):
        _err(s, start, "unterminated char literal")
        return
    if _cur(s) == "\\":
        _advance(s)
        value = _scan_escape(s)
    elif _cur(s) == "'":
        _err(s, start, "empty char literal")
        _advance(s)
        return
    else:
        value = _advance(s)
    if _cur(s) != "'":
        _err(s, start, "unterminated char literal")
        return
    _advance(s)  # consume closing '
    _push(s, "Char", start, value)


# ----------------------------------------------------------------------------
# Strings (with interpolation)
# ----------------------------------------------------------------------------


def _scan_string(s: _State, start: Position) -> None:
    is_f = False
    if _cur(s) == "f":
        is_f = True
        _advance(s)
    _advance(s)  # consume opening "
    segments: List[StringSegment] = []
    text = ""
    while s.pos < len(s.src) and _cur(s) != '"':
        c = _cur(s)
        if c == "\\":
            _advance(s)
            text += _scan_escape(s)
            continue
        if is_f and c == "{":
            if text:
                segments.append(StringSegment(kind="text", value=text))
                text = ""
            # Scan until matching }, accounting for nesting and strings.
            _advance(s)  # consume {
            depth = 1
            inner = ""
            while s.pos < len(s.src) and depth > 0:
                c2 = _cur(s)
                if c2 == "{":
                    depth += 1
                    inner += _advance(s)
                    continue
                if c2 == "}":
                    depth -= 1
                    if depth == 0:
                        _advance(s)
                        break
                    inner += _advance(s)
                    continue
                if c2 == '"':
                    # consume nested string verbatim
                    inner += _advance(s)
                    while s.pos < len(s.src) and _cur(s) != '"':
                        if _cur(s) == "\\":
                            inner += _advance(s)
                            inner += _advance(s)
                            continue
                        inner += _advance(s)
                    if s.pos < len(s.src):
                        inner += _advance(s)  # closing "
                    continue
                inner += _advance(s)
            if depth > 0:
                _err(s, start, "unterminated string interpolation")
                return
            segments.append(StringSegment(kind="interp", value=inner))
            continue
        text += _advance(s)
    if text:
        segments.append(StringSegment(kind="text", value=text))
    if s.pos >= len(s.src):
        _err(s, start, "unterminated string literal")
        return
    _advance(s)  # consume closing "
    _push(s, "String", start, "", segments)


# ----------------------------------------------------------------------------
# Identifiers / keywords
# ----------------------------------------------------------------------------


def _scan_ident(s: _State, start: Position) -> None:
    raw = ""
    while s.pos < len(s.src) and _is_ident_cont(_cur(s)):
        raw += _advance(s)
    if raw in KEYWORDS:
        _push(s, "Keyword", start, raw)
    else:
        _push(s, "Ident", start, raw)


# ----------------------------------------------------------------------------
# Punctuation (longest-match)
# ----------------------------------------------------------------------------


def _starts_with_at(s: _State, p: str) -> bool:
    return s.src[s.pos:s.pos + len(p)] == p


def _scan_punct(s: _State, start: Position) -> bool:
    for p in _PUNCT_SORTED:
        if _starts_with_at(s, p):
            for _ in range(len(p)):
                _advance(s)
            _push(s, "Punct", start, p)
            return True
    return False


# ----------------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------------


def tokenize(source: str, file: str = "<aether>") -> List[Token]:
    """Tokenize Aether source, raising :class:`LexError` on the first error."""
    tokens, errors = tokenize_with_errors(source, file)
    if errors:
        # Raise the first error for callers who want exceptions.
        raise errors[0]
    return tokens


def tokenize_with_errors(source: str, file: str = "<aether>") -> tuple:
    """Tokenize Aether source, returning ``(tokens, errors)``.

    Never raises; the lexer keeps going past errors and emits
    :class:`Token` of kind ``"Error"`` so the parser can recover.
    """
    s = _State(src=source, file=file)
    while s.pos < len(s.src):
        start = _pos_of(s)
        c = _cur(s)
        # Whitespace
        if c in (" ", "\t", "\r", "\n"):
            _advance(s)
            continue
        # Comments
        if c == "/" and _peek(s, 1) == "/":
            _skip_line_comment(s)
            continue
        if c == "/" and _peek(s, 1) == "*":
            _skip_block_comment(s, start)
            continue
        # Numbers
        if _is_digit(c) or (c == "." and _is_digit(_peek(s, 1)) and not _prev_is_atom(s)):
            _scan_number(s, start)
            continue
        # Char
        if c == "'":
            _scan_char(s, start)
            continue
        # String (possibly f-string)
        if c == '"' or (c == "f" and _peek(s, 1) == '"'):
            _scan_string(s, start)
            continue
        # Identifiers / keywords
        if _is_ident_start(c):
            _scan_ident(s, start)
            continue
        # Punctuation
        if _scan_punct(s, start):
            continue
        # Unrecognized character
        _err(s, start, f"unexpected character '{c}'")
        _advance(s)
    # EOF token
    eof_pos = _pos_of(s)
    s.tokens.append(Token(kind="Eof", value="", loc=make_loc(eof_pos, eof_pos, s.file)))
    return s.tokens, s.errors


# ----------------------------------------------------------------------------
# Predicate helpers (mirror the TS ``isKeyword`` and ``isPunct``).
# ----------------------------------------------------------------------------


def is_keyword(t: Token, kw: str) -> bool:
    return t.kind == "Keyword" and t.value == kw


def is_punct(t: Token, p: str) -> bool:
    return t.kind == "Punct" and t.value == p


__all__ = [
    "Token", "LexError", "TokenKind",
    "tokenize", "tokenize_with_errors",
    "is_keyword", "is_punct",
]
