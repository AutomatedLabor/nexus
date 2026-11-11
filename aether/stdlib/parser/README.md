# Aether stdlib — `parser`

The `parser` module is a tiny parser-combinator library. A parser is a function `(input, pos) => ParseResult` where `ParseResult` is either `{ ok: true, value, pos }` (success, advanced to `pos`) or `{ ok: false, error, pos }` (failure at `pos`). The combinators in this module compose parsers into bigger parsers. The module ships 18 functions: primitives (`parserOk`, `parserFail`, `parserChar`, `parserString`, `parserDigit`, `parserLetter`), the monadic combinators (`parserBind`, `parserMap`, `parserThen`, `parserOr`), repetition (`parserMany`, `parserMany1`, `parserOptional`, `parserSepBy`, `parserSepBy1`), bracketing (`parserBetween`), and the two entry points (`parserRun`, `parserResult`). All functions are pure TypeScript; throwing an `Error` from a builtin surfaces as an Aether panic.

## Why combinators?

A parser combinator library is a set of higher-order functions that compose primitive parsers into complex parsers. The alternative is a parser generator (Yacc, Bison, ANTLR, tree-sitter), which takes a grammar description file and generates parser source code. We chose combinators because (1) they live in the host language — no separate file format, no code generation step, no separate build phase; (2) they compose the same way functions compose — `parserMany(parserChar("a"))` is just a function call; (3) they're debuggable by stepping through them with a regular debugger; (4) they're a perfect fit for the "tiny DSL" use case (parse a 5-line config file, parse a single expression) where firing up a generator is overkill. The trade-off is performance: a generator can produce a table-driven parser that runs in O(n) time, while combinators tend to be O(n · g) where g is the grammar size (because of backtracking). For stdlib use cases, that's fine. See ADR-016 for the full design discussion.

## Conventions

- **A parser is a function `(input, pos) => ParseResult`.** This is the only shape — no class hierarchy, no inheritance, no instances. The combinators are higher-order functions returning new parsers.
- **`ParseResult` is `{ ok, ... }`.** The `ok` tag is a boolean. Branch on it with `if (r.ok)`.
- **Parsers do NOT throw on parse failure.** They return `{ ok: false, error, pos }`. They DO throw on type errors (e.g. passing a non-parser to `parserMap`) because that's a programming bug, not a parse failure.
- **`parserRun(p, input)`** runs `p` on `input` from position 0 and returns the raw `ParseResult` (does not require full consumption). Use it when you want to parse a prefix.
- **`parserResult(p, input)`** runs `p` on `input` and **requires full consumption** — returns `{ ok: true, value }` or `{ ok: false, error }`. This is the convenience entry point for "parse this whole string".

## Primitives

`parserOk(value)` always succeeds with `value`, consuming no input. `parserFail(msg)` always fails with the message `msg`. `parserChar(c)` matches a single specific character — panics if `c` isn't a single character. `parserString(s)` matches a literal string. `parserDigit()` matches a single digit `0-9`. `parserLetter()` matches a single letter `a-zA-Z`.

```aether
let p = parser.parserChar("a")
parser.parserRun(p, "abc")  // { ok: true, value: "a", pos: 1 }
parser.parserRun(p, "xbc")  // { ok: false, error: "expected 'a'", pos: 0 }
```

## Combinators

`parserBind(p, fn)` is the monadic bind: parse with `p`, then apply `fn(value)` to get the next parser, and run that. The most general combinator; `parserMap`, `parserThen`, etc. can be derived from it. `parserMap(p, fn)` parses with `p` and transforms the value with `fn`. `parserThen(a, b)` sequences two parsers and returns `b`'s value (discards `a`'s). `parserOr(a, b)` tries `a`, and if it fails, tries `b` at the same position — the choice combinator.

```aether
// "a" then "b" then "c", return "b"
let p = parser.parserThen(parser.parserChar("a"), parser.parserChar("b"))
// "a" or "b"
let q = parser.parserOr(parser.parserChar("a"), parser.parserChar("b"))
```

## Repetition

`parserMany(p)` matches `p` zero or more times, returning an array of values. `parserMany1(p)` matches one or more (fails if `p` doesn't match at least once). `parserOptional(p)` matches `p` zero or one times, returning `null` when not present. `parserSepBy(p, sep)` matches zero or more `p` separated by `sep`. `parserSepBy1(p, sep)` matches one or more `p` separated by `sep`.

All repetition combinators include a safety bound (100,000 iterations) to prevent infinite loops on zero-width parsers (e.g. `parserMany(parserOk("x"))`).

```aether
// comma-separated digits
let digit = parser.parserMap(parser.parserDigit(), (d) => int(d))
let list  = parser.parserSepBy(digit, parser.parserChar(","))
parser.parserResult(list, "1,2,3")  // { ok: true, value: [1, 2, 3] }
```

## Bracketing

`parserBetween(open, p, close)` matches `open`, then `p`, then `close`, and returns `p`'s value (discards `open` and `close`). Useful for parenthesized expressions, quoted strings, XML tags.

```aether
let paren = parser.parserBetween(parser.parserChar("("),
                                  parser.parserLetter(),
                                  parser.parserChar(")"))
parser.parserResult(paren, "(x)")  // { ok: true, value: "x" }
```

## Running

`parserRun(p, input)` runs `p` on `input` from position 0. Returns the raw `ParseResult`. **Does NOT require full consumption** — useful when you want to parse a prefix and continue parsing manually.

`parserResult(p, input)` runs `p` and **requires full consumption**. Returns `{ ok: true, value }` or `{ ok: false, error }` (a simplified shape — no `pos` field, just an error string). The error string includes the position. This is the convenience entry point for "parse this whole string".

```aether
let p = parser.parserString("hello")
parser.parserResult(p, "hello")        // { ok: true, value: "hello" }
parser.parserResult(p, "hello world") // { ok: false, error: "unexpected input at pos 5: ' world'" }
```

## Common patterns

- **Parens around an expression**: `parserBetween(char("("), exprParser, char(")"))`.
- **Comma-separated list**: `parserSepBy(itemParser, char(","))`.
- **Keyword + space + identifier**: `parserThen(parserThen(keyword, char(" ")), identifier)`.
- **One or more letters as a word**: `parserMap(parserMany1(parserLetter()), (arr) => arr.join(""))`.
- **Recursive grammars**: use `mut` indirection — define a parser variable as `parserFail("not yet")`, then assign the real parser later (after the recursive references are in scope). See `examples/json_parser.ae` for the pattern.

## Composing a real grammar

A small calculator grammar in combinators:

```aether
// expr := term (("+" | "-") term)*
// term := factor (("*" | "/") factor)*
// factor := digit+ | "(" expr ")"
let digit    = parser.parserMap(parser.parserMany1(parser.parserDigit()),
                                (arr) => int(arr.join("")))
let factor   = parser.parserOr(digit,
                               parser.parserBetween(parser.parserChar("("),
                                                     expr,
                                                     parser.parserChar(")")))
let term     = parser.parserMap(
                 parser.parserBind(factor, (first) =>
                   parser.parserMap(parser.parserMany(parser.parserBind(
                     parser.parserOr(parser.parserChar("*"), parser.parserChar("/")),
                     (op) => parser.parserMap(factor, (next) => [op, next])
                   )), (rest) => [first, ...rest])),
                 (parts) => /* evaluate */ 0)
```

(We left out the actual evaluation — that's the job of the AST builder, not the parser. The parser just produces values.)

## What's NOT in here

- **Backtracking control** (`try`, `cut`): we don't ship a `cut` combinator. `parserOr` always backtracks. If you need committed choice, write a custom combinator on top of `parserBind`.
- **Error reporting beyond position**: we report the position of the failure but not the "expected X or Y" set. A real parser library would aggregate the expected tokens at the furthest failure position. For stdlib, we kept errors simple.
- **Lexing**: there's no separate lexer — these are character-level parsers. For real languages, you'd build a lexer on top (e.g. `parserMany(parserWhitespace())` to skip whitespace, then `parserMany1(parserLetter())` for a word).
- **PEG-style ordered choice** vs CFG-style ambiguous grammars: we ship ordered choice (`parserOr` is left-biased), which is the PEG convention.

## Performance notes

- `parserMany` and `parserMany1` are O(n) on a string of length `n` (one call per character).
- `parserOr(a, b)` runs `a` and only runs `b` if `a` fails — O(a + b) worst case.
- `parserBind` is constant overhead per step.
- The total time for a combinator parser on a string of length `n` is O(n · g) where `g` is the grammar size — this is the standard combinator bound. For most stdlib use cases (config files, expressions, tiny DSLs), `g` is small and `n` is small, so this is fine.

## When to reach for this module

- **Parse a config file**: a list of `key = value` lines — `parserSepBy(kvPair, parserChar("\n"))`.
- **Parse a tiny DSL**: combinator parsers are the fastest way to get a working parser for a small grammar.
- **Parse a single expression**: shunting-yard is overkill for simple cases — `parserMany1(parserOr(digit, operator))` may be enough.
- **Validate a string format**: `parserResult(p, input).ok` as a one-liner.

The whole module is 18 functions, ~300 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
