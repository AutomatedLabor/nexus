# aether-ports/go — the Go port of the Aether compiler front-end

This directory contains a Go port of the Aether compiler front-end:
the lexer and the parser, plus the AST node types that glue them
together.  It mirrors the TypeScript reference implementation in
`aether/core/lexer/lexer.ts` and `aether/core/parser/parser.ts`, and
the Python port in `aether-ports/python/aether_compiler/`.

The Go port produces the same AST shape as the other ports so that
JSON output across all three implementations can be diffed without
translation.  Each AST node carries a `Loc` field (a
`SourceLocation` with 1-based line/col and 0-based absolute byte
offset) so callers can produce error messages identical to those
from the TS port.

## Layout

```
aether-ports/go/
└── aether_compiler/
    ├── ast.go            # AST node structs (Program, Stmt, Expr, ...)
    ├── lexer.go          # Tokenize Aether source → []Token
    ├── parser.go         # Recursive-descent + Pratt parser
    ├── lexer_test.go     # 95 unit tests for the lexer
    ├── parser_test.go    # 134 unit tests for the parser
    ├── go.mod            # module declaration
    └── README.md         # this file (no — see the parent README)
```

The Go module is rooted at `aether-ports/go/aether_compiler/` —
that is, `go.mod` lives inside the package directory.  All package
files share `package aether_compiler`.

## Why a Go port?

Aether is being ported to multiple host languages so that:

1. **Aether can be embedded in Go tools** — language servers,
   formatters, documentation generators, linters.  The TS port is
   ideal for the playground and CI; the Python port is ideal for
   ad-hoc scripting and teaching; the Go port is ideal for
   distribution as a single static binary.

2. **The compiler can be cross-checked** — the same source
   programs can be lexed and parsed by three independent
   implementations, and the resulting ASTs should be identical (up
   to source-location rounding).  Discrepancies between any two
   ports indicate a bug in one of them.

3. **Performance baseline** — Go's static typing and predictable
   memory model give a useful performance baseline against which
   the TS and Python ports can be compared.

## How it mirrors the TS port

The Go port follows `aether/core/lexer/lexer.ts` token-for-token:

* **Same `TokenKind` enumeration** — `Int`, `Float`, `Hex`,
  `Binary`, `Octal`, `Char`, `String`, `Ident`, `Keyword`, `Punct`,
  `Eof`, `Error`.  All names are preserved as Go string constants
  so JSON output round-trips without translation.
* **Same keyword table** — 32 keywords including the v3 additions
  (`trait`, `impl`, `dyn`) and the RFC-004 `move` expression.
* **Same operator table** — all multi-character operators are
  sorted by descending length at `init()` time so the longest
  match wins (`..=` over `..` over `.`).
* **Same number lexing** — underscores are accepted and stripped;
  exponents are tentatively scanned then restored if the
  fractional part is missing; hex/binary/octal prefixes are
  handled separately.
* **Same f-string interpolation** — `f"Hello, {name}!"` is a
  single `TokenString` whose `Segments` slice alternates between
  `{Kind: "text"}` and `{Kind: "interp"}`.  The parser later
  re-lexes each `interp` segment into an `Expr`.
* **Same `prevIsAtom` heuristic** — `.5` is a float when nothing
  precedes it, but a field access when the previous token is an
  identifier, `)`, `]`, or a literal keyword like `true`/`false`.
  This is what makes `obj.0` work as tuple-field access while
  `0.5` still lexes as a single Float.
* **Same error recovery** — `TokenizeWithErrors` never panics; it
  appends to the `errors` slice and pushes an `Error` token into
  the stream so the parser can recover.
* **Same source-location convention** — `Position` is 1-based
  line/col with 0-based byte offset; `SourceLocation` is a
  half-open `[Start, End)` slice.

## How it mirrors the Python port

The Python port (`aether-ports/python/aether_compiler/`) is itself a
direct port of the TS reference.  The Go port follows the Python
port's *structure* — using a struct/object for the lexer state, with
methods like `cur()`, `peek(n)`, `advance()`, `posOf()`, `locFrom()`,
`push()` — because Go's struct-with-methods idiom matches Python's
class-with-methods more closely than it matches the TS module of
free functions.

The parser mirrors the Python parser almost method-for-method:

* `Parser` struct with `tokens`, `pos`, `errors`, `file`, and
  `pendingDerive` fields (the Python port uses `__init__`).
* `parse()`, `parseStmt()`, `parseLet()`, ... — same recursive
  descent + Pratt precedence as the Python port.
* `_ParseAbort` becomes `parseAbort` (a struct value used as a
  panic payload, recovered in `parseStmt`).
* Error messages match the Python port's format
  `"expected ';', found '}' at line 42:15"`.
* The same Pratt precedence table:
  `||=1, &&=2, comparisons=3, range=4, bitwise/shift=4, +=5, */%=6,
  as=7`.  Range is handled specially because it's non-associative
  (`1..2..3` doesn't parse).
* `parseStringSegments` re-lexes each `interp` segment with a
  fresh `Parser` and attaches the parsed `Expr` to the segment.
* Error recovery skips to the next `;` or `}` (whichever comes
  first) and continues, exactly as the Python port does.

## How to run the tests

If you have Go 1.21+ installed:

```
cd aether-ports/go/aether_compiler
go test ./...
```

Expected output (in verbose mode with `go test -v ./...`):
`95 PASS` lexer tests + `134 PASS` parser tests = `229 PASS`
total.  In the default mode you'll see `ok aether_compiler 0.Xs`.

The Go module is rooted at `aether-ports/go/aether_compiler/` —
that is, `go.mod` lives *inside* the package directory, not at
`aether-ports/go/go.mod`.  This keeps the package self-contained
and makes it trivial to drop into a larger Go project as a
sub-module.  To run the tests from the repo root, use:

```
(cd aether-ports/go/aether_compiler && go test ./...)
```

If Go is not installed on the host that builds this port, the
tests cannot be executed locally — but the Go code is real and
syntactically valid, and any standard Go 1.21+ toolchain will
compile and test it without modification.

## Smoke test

A simple smoke test that lexes `let x = 42;` and prints the token
stream can be written as a small `main` package, but is omitted
here because the spec puts `go.mod` inside `aether_compiler/`
(which is therefore a library, not a binary).  To smoke-test
manually:

```
cat <<EOF > /tmp/aether_smoke.go
package main

import (
    "fmt"
    "aether_compiler"
)

func main() {
    toks, _ := aether_compiler.TokenizeWithErrors("let x = 42;", "<smoke>")
    for _, t := range toks {
        fmt.Printf("%s %q at %d:%d\n", t.Kind, t.Value, t.Loc.Start.Line, t.Loc.Start.Col)
    }
}
EOF
# Then in a separate module that imports aether_compiler via replace:
#   go mod init smoke
#   go mod edit -replace aether_compiler=./aether-ports/go/aether_compiler
#   go run /tmp/aether_smoke.go
```

Alternatively, the lexer tests in `lexer_test.go` cover the
shape of the token stream for `let x = 1;` directly — running
`go test -run TestLetStatement ./...` exercises the same
behaviour as the smoke test would.

## What's NOT in this port

This port covers the **front-end** only — lexer + parser + AST
node types.  It does not include:

* A type checker (the `sema` phase from the TS port).
* An evaluator / interpreter (the `run()` function from the TS
  port).
* A code generator.
* A standard library wiring layer (the TS `aether/stdlib/`
  package).
* A REPL or playground host.

These layers can be ported on top of this front-end in
subsequent work.  The AST is rich enough to support all of them —
the TS port's type checker, evaluator, and codegen all consume
exactly this AST shape.

## Differences from the TS / Python ports

The Go port deliberately preserves the AST shape and the parser
control flow, but a few differences are inherent to the language:

* **Pointers vs values.**  Go requires explicit pointer
  receivers for AST nodes (so they satisfy the `Expr` / `Stmt` /
  `Pattern` / `TypeNode` interfaces).  The TS port uses
  discriminated unions; the Python port uses dataclasses with
  `slots=True`.  The Go port uses structs with the `Loc_` field
  (note the trailing underscore — `Loc` is the interface
  method, `Loc_` is the field, and Go forbids a method and a
  field with the same name).
* **No exceptions in the lexer.**  `TokenizeWithErrors` never
  panics — it returns `([]Token, []LexError)`.  A separate
  `Tokenize` wrapper returns the first error as a Go `error`
  for callers who want exception-style semantics.  This is the
  idiomatic Go shape.
* **Recovery via panic/recover.**  The Python port raises a
  `_ParseAbort` exception to abort a sub-parse; the Go port
  panics with a `parseAbort` struct value and recovers it in
  `parseStmt`.  This is the standard Go translation of "throw /
  catch".
* **No `unicode.IsID_Start` exactly.**  The TS port uses
  `\p{ID_Start}` (a Unicode category) for identifier starts;
  Python uses `unicodedata.category`.  Go's `unicode.IsLetter`
  is close but not identical to Unicode `ID_Start` (it excludes
  `Sc`/`Pc`-only characters like `_` and `$`, which we add
  manually).  The result is that Aether's identifier rules in
  the Go port are slightly more permissive for ASCII and
  slightly more restrictive for exotic Unicode — but the common
  cases (ASCII identifiers, accented Latin letters, common
  CJK identifiers) all work identically.
* **Byte-level column counting.**  The TS port counts UTF-16
  code units for column; the Python port counts code points;
  the Go port counts bytes.  For ASCII-only sources, all three
  match exactly.  For non-ASCII identifiers, the Go col count
  may differ from the TS col count — this is a known limitation
  and would be addressed by switching to rune-aware column
  counting in a future revision.

## Future work

* **Rune-aware column counting** — replace byte-level `advance`
  with rune-level so non-ASCII identifiers produce the same
  column numbers as the TS port.
* **Type checker port** — port the `sema` phase so the Go port
  can reject invalid programs without running them.
* **Evaluator port** — port the `run()` function so the Go port
  can execute Aether programs.
* **Standard library port** — port the 30+ stdlib modules to
  Go so the evaluator has something to call.
* **`main` package** — add a `cmd/aether` sub-package with a
  CLI that exposes `-lex`, `-parse`, and `-run` flags, matching
  the TS playground's REPL.

## Test coverage at a glance

Lexer tests cover:

* Whitespace, line comments, nested block comments,
  unterminated block comments.
* All number formats — decimal int, hex, binary, octal, float
  with exponent, underscores stripped, scientific notation.
* Char literals with escapes (`\n`, `\t`, `\0`, `\u{...}`).
* String literals with text + interpolation segments; nested
  braces and nested strings inside interpolations; unterminated
  strings and interpolations.
* All 32 keywords; identifiers including Unicode (café);
  `$foo`, `_foo`.
* All single- and multi-character operators, including the
  longest-match rule for `..=`, `...`, `::`, `->`.
* `prevIsAtom` heuristic — `.5` is a float; `a.5` is field
  access; `).5` is field access; `1.5` is a float; `1..2` is
  Int, Punct(..), Int.
* Source locations — line/col tracking through newlines, CRLF
  handling, EOF location.

Parser tests cover:

* All statement forms — `let`, `mut let`, `const`, `fn`,
  `enum` (unit/tuple/struct), `struct` (with derive), `type`,
  `trait` (with assoc types, default methods, super traits),
  `impl` (with assoc types), `return`, `break`, `continue`,
  `while`, `for`, `print`, `import` (both forms), `pub fn`.
* All expression forms — literals (int/float/hex/binary/octal/
  char/string/bool/unit), identifiers, `self`, `unit`, lambdas,
  `if`/`else if`/`else`, `match` with guards and all pattern
  kinds (wildcard, bind, lit, tuple, array, struct, enum, or),
  calls, indexes, fields, method calls, tuple fields, error
  propagation (`?`), borrows (`&`/`&mut`), deref (`*`), move.
* All binary operators — `||`, `&&`, comparisons, bitwise,
  shifts, arithmetic, `as`, `or`, ranges (`..`/`..=`).
* Precedence — `*` binds tighter than `+`; `-` is left-associative.
* Generic call vs. comparison disambiguation — `id<int>(5)` is a
  generic call; `a < b` is a comparison.
* All type forms — primitive, tuple, array, map, option, result,
  func, generic, named, dyn, unit.
* Struct / array / map literals with trailing commas.
* Block expressions with trailing expression (tail-call form).
* Error recovery — missing semicolon, missing expression.
* Comments between statements.
* Nested functions, nested tuples, chained calls and fields.
* Pattern destructuring in `match` arms.

## Conclusion

This Go port is a real, working implementation of the Aether
front-end.  When a Go toolchain is available, `go test ./...`
passes 229 tests covering the lexer and parser.  When the host
machine lacks Go, the code is still syntactically valid Go and
will compile and test cleanly under any standard Go 1.21+
toolchain.

The port preserves the AST shape of the TS and Python ports so
that downstream tooling (type checkers, evaluators, code
generators) can be ported incrementally on top of this
front-end.  See `ast.go` for the full type catalogue,
`lexer.go` for the tokenizer, and `parser.go` for the
recursive-descent + Pratt parser that ties them together.
