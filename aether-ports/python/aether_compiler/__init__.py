"""
aether_compiler
===============
Pure-Python port of the Aether compiler front-end (lexer + parser).

This package is the start of Wave 8 (multi-language ports) of the
Aether project. It implements the same tokenizer and recursive-descent
+ Pratt parser as the TypeScript reference implementation at
``aether/core/``, producing the same AST shape (see
:mod:`aether_compiler.ast_nodes`).

The port is intentionally close to the TS reference:

- Token kinds, keyword set, and operator table match
  ``aether/core/lexer/lexer.ts`` exactly.
- AST node classes mirror the discriminated union in
  ``aether/core/ast/ast.ts`` (every node carries a ``kind`` string
  discriminator and a ``loc``).
- The parser uses the same precedence levels and error-recovery
  strategy as ``aether/core/parser/parser.ts``.

Public API
----------
- :func:`tokenize(source, file="<aether>")` — tokenize Aether source
  into a list of :class:`Token` objects.
- :func:`parse(tokens, file)` — parse tokens into a
  :class:`ParseResult` (with ``program`` and ``errors``).
- :func:`parse_source(source, file)` — convenience: tokenize + parse
  in one call.

Examples
--------
::

    from aether_compiler import tokenize, parse_source

    tokens = tokenize('let x = 42;')
    result = parse_source('fn add(a: int, b: int) -> int { a + b }')
    print(result.program)        # the AST root
    print(len(result.errors))    # 0 on a clean parse
"""

from __future__ import annotations

from .ast_nodes import *  # noqa: F401, F403 — re-export all AST node classes
from .ast_nodes import (
    Program, Node, Stmt, Expr, Pattern, TypeNode,
    Position, SourceLocation, make_loc, SOURCE_LOCATION_ZERO,
    is_expr, is_stmt,
)
from .lexer import (
    Token, LexError, tokenize, tokenize_with_errors, is_keyword, is_punct,
)
from .parser import Parser, ParseError, ParseResult, parse, parse_source

__version__ = "0.1.0"

__all__ = [
    "__version__",
    # re-export everything from ast_nodes (via the star import above)
    "Program", "Node", "Stmt", "Expr", "Pattern", "TypeNode",
    "Position", "SourceLocation", "make_loc", "SOURCE_LOCATION_ZERO",
    "is_expr", "is_stmt",
    # lexer
    "Token", "LexError", "tokenize", "tokenize_with_errors",
    "is_keyword", "is_punct",
    # parser
    "Parser", "ParseError", "ParseResult", "parse", "parse_source",
]
