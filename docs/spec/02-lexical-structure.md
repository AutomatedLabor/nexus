# 02 — Lexical Structure

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/core/lexer`
> **Spec version:** 0.1

This section defines the lowest level of the language: how a sequence
of Unicode code points is grouped into a stream of tokens. The lexer is
the only part of the compiler that deals with raw text; everything
upstream operates on tokens.

## 1. Source representation

- Aether source files are UTF-8 encoded.
- A code point is the unit of lexing. A byte-order mark (`U+FEFF`) at
  the start of a file is permitted and skipped.
- A **newline** is `U+000A` (`\n`). `U+000D` (`\r`) is normalized to
  `U+000A` before lexing. `U+000D U+000A` (`\r\n`) is normalized to a
  single `U+000A`.
- The lexer records, for each token, a **span** of the form
  `(file_id, start_byte, end_byte, start_line, start_col, end_line,
  end_col)`. Spans are used by every downstream stage for diagnostics
  and source maps.

## 2. Whitespace and line continuation

```
Whitespace ::= U+0009 | U+000B | U+000C | U+0020 | U+00A0
Newline    ::= U+000A
```

Whitespace and newlines are not semantically significant except that:

- They separate tokens that would otherwise merge (`let x` vs `letx`).
- They terminate line comments.
- A backslash `\` followed by a newline is a **line continuation**: it
  is removed from the token stream and joins the two lines. Line
  continuations are allowed only between tokens; they are a parser
  error if they appear inside a string literal (use string
  concatenation instead).

## 3. Comments

```
Comment     ::= LineComment | BlockComment | DocComment
LineComment ::= "//" [^Newline]*
BlockComment ::= "/*" (BlockComment | [^"*"])* "*/"   // nestable
DocComment  ::= ("///" | "/**") ... "*/"
```

- Line comments begin with `//` and continue to end of line.
- Block comments begin with `/*` and end with `*/`. They **nest**:
  `/* a /* b */ c */` is a single comment. An unterminated block
  comment is a lexer error.
- Doc comments begin with `///` (line) or `/**` (block) and are
  attached to the *next* declaration in source order. They are
  captured into the AST as `DocComment` nodes and consumed by
  `aether docgen` (see [§13 Tooling](./13-tooling.md)). A doc comment
  with no following declaration is a warning, not an error.

Comments are not tokens; they are dropped by the lexer, but their
spans are preserved for tooling (e.g. `aether formatter` is required
to round-trip them).

## 4. Identifiers

```
Identifier ::= IdentifierStart IdentifierContinue*
IdentifierStart    ::= "A".."Z" | "a".."z" | "_" | U+00A0..U+D7FF ... (XID_Start)
IdentifierContinue ::= IdentifierStart | "0".."9" | U+200C | U+200D ... (XID_Continue)
```

- Aether follows the Unicode Standard Annex #31 `XID_Start` /
  `XID_Continue` profiles for identifiers, with one restriction: the
  underscore `_` alone is a valid identifier and is treated as a
  wildcard pattern inside `match` arms.
- Identifiers are case-sensitive: `Foo` and `foo` are distinct.
- Two identifiers are the same iff they are composed of the same
  sequence of code points.

### 4.1 Reserved identifiers

The following identifiers are **keywords** and cannot be used as
ordinary identifiers. They may be used as field names or module paths
when escaped with the `r#` prefix (e.g. `r#type`), mirroring Rust's
raw-identifier convention.

```
as async await break catch const continue dyn else enum extern fn for
if impl in is let loop match mod mut pub raise ref return self Self
spawn struct super trait try type use where while yield

false true none some ok err
```

> `none`, `some`, `ok`, `err` are reserved as variant constructors of
> `Option` and `Result`; the lexer treats them as ordinary keywords for
> error-reporting purposes. `Self` refers to the implementing type
> inside an `impl` block. `self` refers to the receiver.

### 4.2 Lifetime / type-variable identifiers

A type variable is an identifier prefixed with `'` (apostrophe):

```
TypeVar ::= "'" Identifier
```

`'a`, `'b`, `'T`, `'Elem` are valid type variables. They appear in
generic declarations and in `where` clauses. They are *not* lifetimes
in the Rust sense; Aether has no lifetime parameters. The apostrophe
is part of the token and not a separator.

## 5. Literals

### 5.1 Integer literals

```
IntLit     ::= DecInt | BinInt | OctInt | HexInt
DecInt     ::= [1-9] [0-9_]* | "0"
BinInt     ::= "0b" [01_]+
OctInt     ::= "0o" [0-7_]+
HexInt     ::= "0x" [0-9a-fA-F_]+
IntSuffix  ::= "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32" | "u64" | "usize"
```

- Underscores `_` are ignored between digits, except that two
  consecutive underscores or a leading/trailing underscore in a digit
  run is a lexer error.
- The default integer type is `Int` (== `i64`). A suffix selects a
  specific width: `42u8`, `-1i32` (the `-` is a unary operator, not
  part of the literal).
- `0x`/`0b`/`0o` are case-insensitive in both prefix and digits.
- A literal that overflows its target type is a lexer error.

### 5.2 Float literals

```
FloatLit   ::= [0-9][0-9_]* "." [0-9][0-9_]* Exponent? FloatSuffix?
            | [0-9][0-9_]* Exponent FloatSuffix?
Exponent   ::= ("e" | "E") ["+" | "-"] [0-9][0-9_]*
FloatSuffix ::= "f32" | "f64"
```

- The default float type is `Float` (== `f64`).
- A decimal point with no fractional digits (`1.`) is a lexer error;
  write `1.0`.
- `1_000_000.5e10f32` is a valid literal.

### 5.3 Character literals

```
CharLit    ::= "'" (CharEscape | <any char except "'", "\\", or newline>) "'"
CharEscape ::= SimpleEscape | UnicodeEscape
SimpleEscape ::= "\\" ("n" | "r" | "t" | "\\" | "'" | "\"" | "0")
UnicodeEscape ::= "\\u{" HexDigit{1..6} "}"
```

- A character literal denotes a single Unicode scalar value and has
  type `Char`.
- `'\n'`, `'\t'`, `'\u{1F600}'` are valid. `''` is an error.
- A multi-code-point grapheme cluster in a `Char` literal is an
  error; use a `String` instead.

### 5.4 String literals

```
StrLit     ::= StringStart (StrChar | StrEscape | StrInterp)* StringEnd
StringStart ::= "\"" | "r\"" RawLevel? | "b\"" | "rb\"" RawLevel?
StringEnd  ::= "\"" | "##\""   // # count must match RawLevel
StrChar    ::= <any char except "\"", newline, or "{">
StrEscape  ::= "\\" (SimpleEscape | UnicodeEscape)
StrInterp  ::= "{" ExprSeq "}"     // only inside non-raw strings
RawLevel   ::= "#"+
```

- `"hello"` is an ordinary UTF-8 `String`.
- `"a = {x}, b = {y + 1}"` is an interpolated string. The contents of
  each `{...}` are parsed as an expression sequence; the result is
  converted to `String` via the `Display` trait (see
  [§03 6.2 Display](./03-type-system.md#builtin-traits)). A literal
  `{` is written `{{`; a literal `}` is `}}`.
- `r"raw\nstring"` is a **raw string**: backslashes have no
  significance. `r#"..."#` allows embedding `"` in the string.
- `b"..."` is a **byte string** of type `Bytes` (`[u8]`). Its
  interpolation expressions must evaluate to types with `Display`
  or be `u8`/`Char`.
- `rb"..."` and `rb#"..."#` are raw byte strings.

### 5.5 Boolean and unit literals

- `true` and `false` are boolean literals of type `Bool`.
- `()` is the unit literal and the unit type. It is the only value of
  the `Unit` type.

## 6. Punctuation and operators

```
Punct ::= "(" | ")" | "[" | "]" | "{" | "}"
        | "," | ";" | ":" | "::" | "->" | "=>" | "." | ".." | "..="
        | "=" | "==" | "!=" | "<" | "<=" | ">" | ">="
        | "+" | "-" | "*" | "/" | "%" | "**"
        | "&" | "|" | "^" | "~" | "<<" | ">>"
        | "&&" | "||" | "!"
        | "?" | "@" | "$" | "#" | "_" | "??" | "?."
```

The lexer uses the **maximal munch** rule: at each point, it produces
the longest punctuation token that matches. So `..=` is a single
token, `..` is a single token, and `.` is a single token. `->>` is
two tokens (`->` then `>`); if the grammar requires `->>`, that is a
parser error.

When two adjacent punctuation characters could form two distinct
valid tokens (e.g. `>>` inside a generic-argument list), the parser
is permitted to ask the lexer to re-lex the `>>` as two `>` tokens.
This is the **generics-friendly re-lex** rule and is the only case in
which the lexer is not stateless. See
[§04 2.1 Generics vs. shifts](./04-expressions.md#generics-vs-shifts)
for the rule that triggers it.

## 7. Tokens — summary

```
Token       ::= Identifier | TypeVar | IntLit | FloatLit
              | CharLit | StrLit | "true" | "false"
              | Punct | Newline          // Newline token only in layout-sensitive mode (Q-LAYOUT-1)
```

## 8. Layout sensitivity

Aether is **not** layout-sensitive in the style of Python or Haskell.
Newlines are whitespace. Braces `{` `}` are required for blocks and
struct literals. This is a deliberate trade-off: it costs some visual
weight but removes a class of grammar ambiguities that interact badly
with automatic formatting.

> **Q-LAYOUT-1:** Should the language gain an optional
> layout-sensitive `do`/`end` form for short closures? Open; see
> [`docs/decisions/`](../decisions/).

## 9. Errors

The lexer produces a token stream plus a list of diagnostics. A
diagnostic has:

- a severity (`error`, `warning`, `info`),
- a span,
- a code (`E0xxx` for errors, `W0xxx` for warnings),
- a message,
- optional notes and suggestions.

Lexer errors include:

- `E0001` unterminated string / char / block comment
- `E0002` invalid escape sequence
- `E0003` invalid digit in numeric literal
- `E0004` invalid Unicode code point in `\u{...}`
- `E0005` integer literal out of range for its suffix
- `E0006` stray `\` outside a line continuation

The lexer is **error-recovering**: when it encounters an error, it
emits a diagnostic, advances one code point, and continues. This
makes it possible for downstream stages to produce useful
multi-error diagnostics instead of bailing on the first problem.

## 10. Conformance

A conformant lexer MUST produce, for a given input file, a token
stream that matches this section's grammar, and MUST emit an error
for any input that does not match. The lexer MAY produce additional
warnings (e.g. for confusable identifier characters per UAX #39).
