# string_tokenize.ae

A tiny tokenizer: split a string into a list of tokens, each
tagged with a kind (`"word"` | `"punct"` | `"ws"`). Whitespace
runs collapse into a single `ws` token. Punctuation is
single-char (`,`, `.`, `!`, `?`, `;`, `:` — and any other
non-ws non-word char). Words are maximal runs of letters /
digits / underscore.

## What it does

1. **`is_ws(c)`** — space, tab, newline, CR.
2. **`is_word_char(c)`** — `[a-zA-Z0-9_]` via `charCode` lookup.
3. **`mk_token(kind, text)`** — build a 2-element `[kind, text]`
   array (Aether doesn't have lightweight tuples; this is the
   idiomatic substitute).
4. **`tokenize(s)`** — scan with a `while` loop, dispatch on
   the current character to pick a token kind, consume the
   maximal run, push a token.
5. **`print_tokens(tokens)`** — pretty-print, skipping `ws`
   tokens.
6. **Driver** — tokenizes `"hello, world! foo"` and several
   edge cases.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/string_tokenize.ae
```

## Key language features

- **`charCode`** to inspect a character's ASCII value (faster
  than chained string equality for `is_word_char`).
- **`strSlice(s, i, j)`** for single-character extraction.
- **`while` loops** with `mut i` for the scan — sidesteps the
  for-loop-scope quirk.
- **Inner `while`** for the maximal-munch: advance `j` while
  the current char matches the token kind.

## Token kinds

- `"word"` — `[a-zA-Z0-9_]+` — identifiers like `foo123_bar`.
- `"punct"` — any single non-ws, non-word char (e.g., `,`,
  `.`, `!`, `?`).
- `"ws"` — runs of ` \t\n\r` collapsed into one token.

## Expected output

```
== Tiny tokenizer ==

input: hello, world! foo

tokens (excluding whitespace):
[word] hello
[punct] ,
[word] world
[punct] !
[word] foo
...
All assertions passed.
```

## Design notes

- A real lexer would attach source positions (line, column,
  offset) to each token. This tiny version skips that — the
  tokens themselves are sufficient for downstream parsing.
- The kind tag is a string (rather than an enum) because
  Aether's enum support is verbose. The 2-element array
  pattern (`["word", text]`) is a common idiom.
- Compare to `markdown_render.ae` which does a different kind
  of one-pass line-based scan.
