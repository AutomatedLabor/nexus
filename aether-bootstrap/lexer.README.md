# aether-bootstrap/lexer — Aether lexes itself (V3-W1-LEX, part 1 of 6)

> The canonical "real language" milestone: the Aether language lexes itself.

This directory contains the **bootstrap lexer**, a tokenizer for the Aether
programming language written **in Aether**. It mirrors the production
TypeScript lexer at `aether/core/lexer/lexer.ts` (425 LOC) token-for-token,
and is the first of six waves of the Aether-in-Aether self-hosting effort
documented in `docs/v3-prompt.md`.

The lexer reads an Aether source string and produces the full token stream
that the downstream parser (Wave 2) will consume. By the end of Wave 1 you
have a `fn lex(source: string) -> [Token]` callable from any Aether program,
including itself.

## Files

| File                        | Purpose                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| `lexer.ae`         (660 LOC)| The lexer. Pure Aether. Includes a self-test that lexes `let x: int = 42;` and prints every token. |
| `lexer.test.ae`     (660 LOC) | The test suite. Imports `lex`/`lexWithErrors`/predicate helpers from `lexer.ae` and runs 369 `assert_eq` checks. |
| `lexer.README.md`           | This document.                                                          |

Run the lexer directly:

```
bun .bootstrap-tmp/verify_bootstrap.ts aether-bootstrap/lexer.ae
```

Run the test suite:

```
bun .bootstrap-tmp/verify_bootstrap.ts aether-bootstrap/lexer.test.ae
```

Or with the project CLI:

```
bun aether/tools/cli/cli.ts run aether-bootstrap/lexer.ae
bun aether/tools/cli/cli.ts run aether-bootstrap/lexer.test.ae
```

(Both verifiers detect the `import { ... } from "./lexer.ae";` line in the
test file and route through `runModule` for multi-file resolution; the
lexer's self-test file has no imports and uses single-file `compileAndRun`.)

## What the bootstrap lexer does

The lexer implements the full Aether lexical grammar:

- **Identifiers / keywords** — 28 keywords (`let`, `mut`, `const`, `fn`,
  `enum`, `struct`, `type`, `match`, `if`, `else`, `while`, `for`, `in`,
  `return`, `break`, `continue`, `print`, `true`, `false`, `unit`, `self`,
  `as`, `range`, `import`, `pub`, `use`, `or`, `do`). Identifiers are
  Unicode-aware (ASCII letters + `_` start; Latin-1 supplement, Latin
  Extended-A/B, IPA, Greek, Cyrillic, Hebrew ranges continue — see
  `isIdentStart`/`isIdentCont`).

- **Numeric literals** — decimal `int` (`42`, `1_000_000`), `float`
  (`3.14`, `1.5e3`, `2e+10`, `2e-5`), `0xFF` hex, `0b101` binary, `0o777`
  octal. Underscores are stripped from the token text, matching the TS
  reference.

- **String literals** — plain `"..."` and `f"..."` interpolation form. The
  token's `text` field is empty (matching the TS lexer); the literal pieces
  live in the `segments` array as `{ kind: "text", value: "..." }` and
  `{ kind: "interp", value: "raw inner source" }`. The lexer tracks nested
  `{}` inside interpolations and consumes nested strings verbatim, so
  `f"{f("inner")}"` lexes correctly.

- **Char literals** — `'a'`, `'\n'`, `'\t'`, `'\r'`, `'\0'`, `'\\'`,
  `'\''`, `'\"'`, `'\u{1F600}'` (full Unicode code point escapes).

- **Punctuation** — longest-match for all 45 operators/punctuation:
  3-char `..=`, `...`; 2-char `..`, `::`, `->`, `=>`, `==`, `!=`, `<=`,
  `>=`, `&&`, `||`, `+=`, `-=`, `*=`, `/=`, `%=`, `<<`, `>>`, `??`;
  1-char `?`, `!`, `~`, `+`, `-`, `*`, `/`, `%`, `&`, `|`, `^`, `<`, `>`,
  `=`, `(`, `)`, `[`, `]`, `{`, `}`, `,`, `;`, `:`, `.`, `@`.

- **Comments** — line `//`, nestable block `/* ... /* ... */ ... */`. An
  unterminated block comment is a lexer error.

- **Whitespace** — space, tab, LF, CR. LF increments `line` and resets
  `col` to 1.

- **Location tracking** — every token records `line`, `col`, `offset`,
  and `endOffset`. The EOF token at end-of-input carries the final
  line/col/offset.

- **Errors** — unterminated string, unterminated f-string interpolation,
  unterminated char, empty char, unterminated block comment, invalid
  number literal (e.g. `12abc`), unexpected character. The lexer keeps
  going past an error: it pushes an `Error` token inline (so the parser
  can recover) and records the error in the `errors` array. `lex` returns
  only the tokens; `lexWithErrors` returns both tokens and errors.

## Public API

```aether
pub fn lex(source: string) -> [Token]
pub fn lexWithErrors(source: string) -> LexResult
pub fn isDigit(c: int) -> bool
pub fn isHexDigit(c: int) -> bool
pub fn isBinDigit(c: int) -> bool
pub fn isOctDigit(c: int) -> bool
pub fn isAlpha(c: int) -> bool
pub fn isAlphaNum(c: int) -> bool
pub fn isWhitespace(c: int) -> bool
pub fn isIdentStart(c: int) -> bool
pub fn isIdentCont(c: int) -> bool
pub fn isKeyword(kw: string) -> bool
pub fn kindOf(t: Token) -> string
pub fn textOf(t: Token) -> string
pub fn emptyTokens() -> [Token]
pub fn emptyErrors() -> [LexError]
pub fn emptySegs() -> [StringSeg]
```

`Token`, `StringSeg`, `LexError`, `LexResult`, `Lex` are the structs
defined at the top of `lexer.ae`. `Token` has the fields `kind`, `text`,
`line`, `col`, `offset`, `endOffset`, `segments`. The `kind` string is
one of `Int|Float|Hex|Binary|Octal|Char|String|FString|Ident|Keyword|Punct|
Eof|Error`.

## How it mirrors the TS lexer

The Aether file is structured to mirror `aether/core/lexer/lexer.ts`:

| TS reference (`lexer.ts`)                 | Aether (`lexer.ae`)                       |
| ----------------------------------------- | ----------------------------------------- |
| `interface State { src, pos, line, col }` | `struct Lex { src, srcLen, pos, line, col, tokens, errors }` |
| `function cur(s)` / `peek(s, n)`          | `fn cur(l: Lex)` / `fn peek(l: Lex, n)`   |
| `function advance(s)`                     | `fn advance(l: Lex)`                      |
| `function push(s, kind, start, value)`    | `fn pushTok(l, kind, text, sLine, sCol, sOff, segs)` |
| `function err(s, start, msg)`              | `fn pushErr(l, line, col, msg)`           |
| `function lexWithErrors(source)`          | `pub fn lexWithErrors(source)`           |
| `function scanNumber(s, start)`           | `fn scanNumber(l, sLine, sCol, sOff)`     |
| `function scanChar(s, start)`              | `fn scanChar(l, sLine, sCol, sOff)`        |
| `function scanString(s, start)`            | `fn scanString(l, sLine, sCol, sOff)`      |
| `function scanIdent(s, start)`             | `fn scanIdent(l, sLine, sCol, sOff)`       |
| `function scanPunct(s, start)`             | `fn scanPunct(l, sLine, sCol, sOff)`       |
| `function skipLineComment(s)` / `skipBlockComment(s, start)` | `fn skipLineComment(l)` / `fn skipBlockComment(l, sLine, sCol)` |
| `function scanEscape(s)`                   | `fn scanEscape(l)`                        |
| `function prevIsAtom(s)`                   | `fn prevIsAtom(l)`                         |
| `function isDigit(c)` etc. (string args)  | `pub fn isDigit(c: int)` etc. (char-code args) |
| `const KEYWORDS = new Set([...])`         | `pub fn isKeyword(kw)` — `||` chain       |
| `const PUNCT_SORTED = [...].sort(...)`    | `fn matchPunct(l)` — explicit if/else longest-match |

The lexical behavior is identical: `let x = 42;` produces the same 6
tokens, `f"Hello, {name}!"` produces a single FString token with three
segments, `0xFF` is a Hex token with text `"0xFF"`, etc.

### Intentional differences (documented)

1. **`FString` vs `String` kind**: the TS reference uses kind `"String"` for
   both plain and f-prefixed strings (distinguishing them by the presence
   of `interp` segments). This bootstrap uses a distinct `"FString"` kind
   for f-strings, per the prompt's test spec. The segment model is
   otherwise identical.

2. **`file` is not tracked**: the bootstrap always lexes a single source,
   so the TS `loc.file` field is dropped from `Token`.

3. **`loc` is flat**: the TS lexer uses `loc: { start: Position, end:
   Position, file }`. The bootstrap stores `line`/`col`/`offset` (start)
   and `endOffset` (end position) directly on `Token`. Equivalent
   information, fewer indirections.

4. **Unicode identifier classification**: the TS lexer uses
   `[\p{ID_Start}$_]`/`[\p{ID_Continue}$_]` regexes. The bootstrap
   approximates these with ASCII + the common Latin-1 supplement, Latin
   Extended-A/B, IPA Extensions, Greek, Cyrillic, and Hebrew ranges
   (see `isIdentStart` and `isIdentCont`). Pure-ASCII identifiers (the
   overwhelming majority) work exactly like the TS lexer.

5. **`prevIsAtom` branch expansion**: the TS function uses a single `if`
   with `||` chains; the bootstrap uses an explicit chain of `if X {
   return true; };` statements because Aether's parser requires `;` after
   each `if {}` statement (the function body is otherwise identical in
   effect).

## Host builtins used (the "libc" of the bootstrap)

The bootstrap lexer is pure Aether with one exception: three small
**host primitive** builtins, registered as inline evaluator builtins in
`aether/core/eval/eval.ts` and declared in the type-checker at
`aether/core/sema/sema.ts`. They are the Aether bootstrap's analogue of a
self-hosted compiler linking against libc — minimal, surgical, well-defined.

| Host builtin                                      | JS equivalent                      | Used by                              |
| ------------------------------------------------- | ---------------------------------- | ------------------------------------ |
| `charCode(s: string, i: int) -> int`              | `s.charCodeAt(i)` (-1 if out of range) | `cur`/`peek` cursor reads, all char-code classification |
| `fromCharCode(n: int) -> string`                  | `String.fromCodePoint(n)` (astral-safe) | escape-segment construction, source rebuild |
| `strSlice(s: string, start: int, end: int) -> string` | `s.slice(start, end)` with clamping | reserved for parser use (Wave 2)    |

Adding these was a surgical edit (three `set("charCode", ...)` calls inside
`installInlineBuiltins()`, plus three `reg("charCode", ...)` calls inside
`Checker.predeclareBuiltins()`). They do not change the behavior of any
existing builtin or existing Aether program. The full vitest suite (661
tests across `aether/core` and `aether/stdlib`) passes unchanged after
the edit; `bunx tsc --noEmit` reports zero new errors in `aether/core/eval`
or `aether/core/sema`.

## Test approach

`lexer.test.ae` imports `lex`, `lexWithErrors`, the predicate helpers, and
`emptySegs` from `./lexer.ae` and runs **369 `assert_eq` / `assert` checks**
across 17 categories:

1. **Keywords** (28 keywords × 2 asserts each = 56) — every Aether
   keyword lexes to a `Keyword` token with the expected text.
2. **Identifiers** — `_`, `_underscore`, `letX`, `foo_bar_baz`, etc.
3. **Numeric literals** — int, float, hex (both `0x` and `0X` — normalized
   to lowercase `0x`), binary, octal. Underscores stripped from text.
4. **String literals** — plain `"..."`, escapes (`\"`, `\n`, `\t`, `\\`,
   `\u{...}`), and empty `""`.
5. **F-strings** — `f"hi {name}!"` produces 3 segments (`text`, `interp`,
   `text`). Nested interpolations and nested strings inside interpolations
   are exercised.
6. **Char literals** — `'a'`, `'\n'`, `'\t'`, `'\u{1F600}'` (emoji
   surrogate pair via `fromCharCode`).
7. **Punctuation** — every one of the 45 operators + longest-match
   precedence checks (`..=` vs `..` vs `...`, `<` vs `<<` vs `<=`, etc.).
8. **Comments** — line, block, multi-line block, nested block comments.
9. **Whitespace** — leading spaces/tabs/newlines are skipped.
10. **Location tracking** — `line`, `col`, `offset`, `endOffset` for
    tokens after whitespace and newlines.
11. **Full programs** — `let x = 42;`, `let x: int = 42;`,
    `fn add(a: int, b: int) -> int { a + b }`, `let nums = [1, 2, 3];`,
    `print(f"Hello, {name}!");` — each is tokenized and every token's
    kind and text is asserted.
12. **Lexer errors** — unterminated string, unterminated f-string
    interpolation, unterminated char, empty char, unterminated block
    comment, invalid number literal, unexpected character (`$`). Each
    produces an `Error` token inline + an entry in the `errors` array.
13. **Character classification helpers** — `isDigit`, `isHexDigit`,
    `isBinDigit`, `isOctDigit`, `isAlpha`, `isAlphaNum`, `isWhitespace`,
    `isIdentStart`, `isIdentCont`, `isKeyword` — pure predicates on char
    codes.
14. **EOF handling** — empty input yields `[Eof]`; trailing whitespace
    yields `[Eof]` at the right offset.
15. **`lexWithErrors` API** — returns both `tokens` and `errors`; counts
    are checked.
16. **`prevIsAtom` / `.` ambiguity** — `.5` at start of input is a Float;
    `foo.5` is `Ident . Int` (field access); `).5` is `Punct . Int`.
17. **Smoke test** — `let x: int = 42; fn id<T>(x: T) -> T { x }` lexes
    to 23 tokens (22 + EOF), with the first token being `let` and the
    last being `Eof`.

The tests use a `let mut ASSERTS = 0` counter incremented by helper
functions `check`, `checkEq`, `checkStrEq`, `checkBoolEq`. On success the
file prints `all 369 tests passed`.

### Evaluator quirks worked around

Per the prompt's evaluator-quirk notes, the test file:

- uses **`while` loops only** (no `for`-over-iterable — the for-loop
  variable isn't accessible after the loop);
- uses **bare-expression function returns** (e.g. `fn first(s: string)
  -> Token { let toks = lex(s); toks[0] }`) — never `return X;` after a
  block;
- uses **`int(a / b)` not needed** (no integer division required);
- avoids **array-element assignment** beyond what `push` already
  provides — token arrays are built entirely via `push`.

The lexer itself uses the same conventions: every `while` loop is
explicit-position, no `for`, no `return` after a block in expression
position, no integer division.

## Sample: lex `let x = 42;`

Running `bun .bootstrap-tmp/verify_bootstrap.ts aether-bootstrap/lexer.ae`
produces:

```
== aether-bootstrap/lexer.ae self-test ==
lexing: 'let x: int = 42;'
Keyword 'let' @ 1:1+0
Ident 'x' @ 1:5+4
Punct ':' @ 1:6+5
Ident 'int' @ 1:8+7
Punct '=' @ 1:12+11
Int '42' @ 1:14+13
Punct ';' @ 1:16+15
Eof '' @ 1:17+16
== done (8 tokens) ==
```

The lexer reads the 16-char source `let x: int = 42;` and produces 8
tokens (7 real tokens + 1 EOF), with each token's `kind`, `text`, `line`,
`col`, and `offset` printed. `let` is at line 1 col 1 offset 0;
`int` is at line 1 col 8 offset 7 (after the 7-char prefix `let x: `);
the EOF sentinel is at line 1 col 17 offset 16 (one past the last char).

## Verification

Per the prompt's mandatory verification steps:

| Step | Command | Result |
| ---- | ------- | ------ |
| 1. Lexer runs | `bun .bootstrap-tmp/verify_bootstrap.ts aether-bootstrap/lexer.ae` | `ok=true err=none` — 8 tokens printed |
| 2. Tests run | `bun .bootstrap-tmp/verify_bootstrap.ts aether-bootstrap/lexer.test.ae` | `ok=true err=none` — `all 369 tests passed` |
| 3. Vitest no regression | `bunx vitest run aether/core/eval aether/core/sema` | 144 / 144 passed |
| 4. Vitest broad | `bunx vitest run aether/core aether/stdlib/string aether/stdlib/list` | 661 / 661 passed |
| 5. tsc clean for edits | `bunx tsc --noEmit 2>&1 | grep -E "aether/core/(eval|sema)/"` | zero errors in my edited regions; pre-existing sema errors unchanged |

## Next wave

Wave V3-W2 (parser) will use this lexer's `Token` / `StringSeg` /
`LexResult` shapes to build the Aether AST in pure Aether, mirroring
`aether/core/parser/parser.ts`. The lexer's `pub` API surface is the
contract the parser will rely on; the test suite here pins the
token-shape contract end-to-end.
