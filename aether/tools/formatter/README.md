# Aether Formatter

A deterministic, idempotent code formatter for the Aether language.

The formatter is the canonical "pretty-printer" for Aether source.  Given any
Aether source string whose parse is clean, `format(x)` produces a normalized
representation that re-parses to the same AST and is itself fixed under
`format`.  In other words:

> `format(format(x)) === format(x)` for every `x`.

This property — **idempotency** — is the formatter's central contract.  It
means running the formatter twice is never different from running it once;
saving a file that is already formatted is a no-op; CI can flag unformatted
files with `format(x) === x`; and round-tripping through the formatter never
drifts.  The test suite enforces idempotency on every example in the
`examples/` directory and on 50 fuzz-generated programs.

## Quick start

```ts
import { format, formatFile } from "aether/tools/formatter/formatter";

const src = "fn  add( a:int,b:int)->int{a+b}";
console.log(format(src));
// fn add(a: int, b: int) -> int { a + b }

console.log(formatFile("examples/quicksort.ae"));
```

## Pipeline

The formatter follows the same lex → parse → walk → print pipeline that
the rest of the tooling uses:

1. **Comment scan.**  A small hand-rolled scanner (`extractComments`) walks
   the source string and records every `// …` line comment and every
   `/* … */` block comment with its source range and an `ownLine` flag
   (whether the comment sits on its own line or trails other code on the
   same line).  Strings, char literals, and the leading `f` of f-strings
   are skipped so that `//` inside a string literal doesn't start a
   comment.  The lexer itself skips comments entirely; the formatter needs
   them for preservation.

2. **Lex + parse.**  `lex(source)` produces the token stream and
   `parse(tokens)` produces the AST (`Program`).  The formatter does not
   throw on parse errors — it formats whatever AST the parser produces.

3. **Print.**  A recursive `Printer` walks the AST in source order and
   emits a normalized string.  At every "item boundary" (before each
   statement, before each array element, before each match arm, before the
   closing brace of a block, …) the printer drains any comments whose
   source offset precedes the item's start offset and emits them as
   leading comments at the current indent.  After printing an item, the
   printer checks whether the next comment sits on the same source line
   as the item's end — if so, it emits that comment as a trailing
   comment, separated by a single space.

4. **Finalize.**  Trailing whitespace per line is stripped, the file's
   trailing newlines are collapsed to a single `\n`.

The comment placement strategy is what makes idempotency work in the
presence of comments.  After formatting, the comments in `format(x)` are
at known positions relative to the AST nodes they belong to; re-running
`format` re-extracts the same comments and re-places them at the same
positions, so the output is stable.

## Style rules

The formatter enforces the following rules, derived from the conventions
used in the example corpus:

- **2-space indentation** by default (configurable via `indent`).
- **One statement per line.**
- **Brace placement.**  `{` on the same line for `fn`, `if`, `else`, `while`,
  `for`, `match`, and lambdas.  `}` on its own line at the parent indent for
  multi-line constructs.
- **Single-line blocks** when the block contains only a trailing
  expression and the resulting `{ expr }` form fits within `lineWidth`:
  ```aether
  fn fib_rec(n: int) -> int { if n < 2 { n } else { fib_rec(n - 1) + fib_rec(n - 2) } }
  ```
  A block with statements is always multi-line.
- **Keywords are lowercase.**  `let`, `const`, `mut`, `fn`, `enum`,
  `struct`, `match`, `if`, `else`, `while`, `for`, `in`, `return`,
  `break`, `continue`, `print`, `import`, `pub`, `type` — all lower-case
  in the output (the lexer keywords are already case-sensitive, so this
  is automatic).
- **Spaces around binary operators** (`a + b`, `x == y`), after commas
  (`[1, 2, 3]`), after colons (`let x: int`), and after the `->` in
  function signatures.
- **No space before `;` or `,`.**
- **Trailing comma in multi-line aggregates.**  Multi-line arrays, maps,
  struct literals, struct declarations, enum declarations, and match
  arms end with a trailing comma after the last element (toggle with the
  `trailingComma` option, default `true`):
  ```aether
  let xs = [
    1,
    2,
    3,
  ];
  ```
  Single-line aggregates never have a trailing comma.
- **String interpolation preserved as `f"...{x}..."`.**  Plain string
  literals use `"..."`; any literal containing an interpolation segment
  is prefixed with `f`.  Escape sequences (`\n`, `\t`, `\"`, `\\`, …)
  are preserved exactly.
- **Comments preserved.**  Line and block comments are reattached to the
  AST node that "owns" them:
  - A comment that sits on its own line is treated as a *leading*
    comment for the next item in source order and is emitted at the
    current indent on its own line.
  - A comment that trails other code on the same line is treated as a
    *trailing* comment and is emitted on the same line as that code,
    separated by a single space.
  - A comment between the last item of a block and the closing `}` is
    emitted as a leading comment for the `}`.

## Configuration

```ts
export interface FormatOptions {
  indent?: number;          // default 2
  lineWidth?: number;       // default 100
  trailingComma?: boolean;  // default true
  semi?: boolean;           // default true
}
```

- **`indent`** — number of spaces per indent level.  Pass `4` for a
  Rust-style 4-space layout.
- **`lineWidth`** — maximum line width in characters.  Constructs that
  fit within `lineWidth - currentColumn` are emitted on a single line;
  longer constructs break across multiple lines.
- **`trailingComma`** — when `true` (default), multi-line aggregates
  include a trailing comma after the last element.  When `false`, the
  last element of a multi-line aggregate has no trailing comma.  This
  is purely stylistic — both forms re-parse to the same AST.
- **`semi`** — when `true` (default), statements end with `;`.  When
  `false`, the formatter omits trailing semicolons.  *Note*: Aether's
  grammar requires `;` after most statements, so `semi: false` produces
  output that the parser will reject.  The option is kept for API
  completeness; do not use it if you need idempotency.

## Idempotency in detail

Idempotency is enforced by two invariants:

1. **Format is a function of the AST.**  The printer never reads
   anything except the AST and the comment list.  Once the source has
   been formatted, the AST is fixed (the formatter only emits valid
   Aether that re-parses to the same AST) and the comment list is
   stable (the formatted output has the same comments at the same
   relative positions).

2. **Comment placement is stable.**  A comment is classified as
   "leading" or "trailing" based on whether only whitespace precedes
   it on its source line.  After formatting, leading comments sit on
   their own line at the indent of the item they precede, and trailing
   comments sit at the end of the line of the item they follow.  Re-
   extracting comments from the formatted output yields the same
   classification, so the second `format` pass places them at the same
   positions as the first.

These two invariants together guarantee `format(format(x)) === format(x)`.

The test suite verifies this property on:
- every example file in `examples/*.ae` (15 cases)
- 50 fuzz-generated programs (random let / const / print / if / match
  combinations, seeded for reproducibility)
- a set of edge cases (empty input, whitespace-only, comment-only,
  deeply nested fns and matches)

## Integrating with the CLI

The formatter is exposed as a function — `format(source, opts?)` — so
wiring it into a CLI is a few lines:

```ts
#!/usr/bin/env bun
import { formatFile } from "aether/tools/formatter/formatter";
import { readFileSync, writeFileSync } from "fs";

const paths = process.argv.slice(2);
const write = process.argv.includes("--write");

for (const p of paths) {
  const src = readFileSync(p, "utf8");
  const out = formatFile(p);
  if (write) writeFileSync(p, out);
  else if (src !== out) {
    console.error(`${p}: not formatted (run with --write)`);
    process.exitCode = 1;
  }
}
```

This gives `aether fmt file.ae --write` (format in place) and
`aether fmt file.ae` (check only; non-zero exit if unformatted).

## Integrating with the LSP

For the LSP, the formatter is the canonical "format document" and
"format range" handler:

- **`textDocument/formatting`** — call `format(document.getText())`
  and return a single `TextEdit` replacing the whole document.
- **`textDocument/rangeFormatting`** — call `format` on the whole
  document and return only the edits that fall inside the requested
  range (computing a per-line diff against the formatted output).
- **`textDocument/onTypeFormatting`** — re-run `format` on the whole
  document every time the user types `}` or `;` at the end of a line;
  the diff is small (the rest of the document is unchanged) so the
  edit is cheap and the user sees consistent formatting as they type.

Because the formatter is idempotent, "format on save" is always safe —
saving an already-formatted file is a no-op.

## Limitations

- Comments inside expressions (e.g., between two array elements, or in
  the middle of a long binary chain) are dropped if they appear in a
  position where the printer doesn't have a "drain point".  Comments
  between statements, between array elements, between match arms,
  between struct fields, and between enum variants *are* preserved.
- The formatter does not normalize parenthesization — `Paren` nodes in
  the AST are preserved verbatim.  Redundant parens like `((x))` are
  kept; missing parens are not added (precedence is preserved by the
  parser's `Paren` nodes, so the AST is already unambiguous).
- The `semi: false` option does not currently produce re-parseable
  output.  This is a documentation limitation, not a bug — Aether's
  grammar requires `;` after most statements.
- The formatter does not break long call argument lists onto multiple
  lines.  A call with many long arguments stays on one line if it fits
  the configured `lineWidth`, otherwise the line is left long.  (This
  matches the conventions in the example corpus.)
