# json_minify.ae

A tiny JSON minifier. Given a JSON string with optional whitespace
(spaces, tabs, newlines), produce an equivalent JSON string with
all insignificant whitespace stripped. Whitespace inside strings
is preserved.

## What it does

1. **`is_ws(c)`** — true for `" "`, `"\t"`, `"\n"`, `"\r"`.
2. **`minify(s)`** — single-pass scan:
   - Track `in_str` (whether we're inside a string literal).
   - When inside a string, copy every char verbatim. Handle
     `\\` (escape) by copying the next char verbatim, too.
     Toggle `in_str` off when we see a closing `"`.
   - When outside a string, drop whitespace; copy everything
     else; toggle `in_str` on when we see `"`.
3. **`oneline(s)`** — render a string for printing by replacing
   `\n` with `\n` and `\t` with `\t` (escape form), so the output
   fits on one line.
4. **Driver** — runs `minify` on 6 sample JSON inputs (pretty
   object, array, nested, string with internal whitespace,
   empty, already-minified) and prints before/after.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/json_minify.ae
```

## Key language features

- **String indexing** `s[i]` returns a 1-char string in
  Aether. We wrap with `str(...)` to be explicit.
- **`if c == "\\"`** — backslash is a string escape; comparing
  to a single-backslash string requires the `"\\\\"` literal
  in source.
- **`out = out + c`** — string concatenation via `+`.
- **`if/else` blocks with `;`** before another statement —
  required by the parser when an if/else is followed by another
  statement in the same block.
- **`while` loop** for the scan — sidesteps the for-loop-scope
  quirk.

## Expected output

```
== JSON minifier ==

input  (51 chars):
  {\n  "name": "Alice",\n  "age": 30,\n  "city": "NYC"\n}
output (38 chars):
  {"name":"Alice","age":30,"city":"NYC"}

input  (17 chars):
  [ 1, 2, 3, 4, 5 ]
output (11 chars):
  [1,2,3,4,5]

input  (8 chars):
    {  }  
output (2 chars):
  {}

All assertions passed.
```

## Design notes

- The minifier is "JSON-aware" only in the sense that it tracks
  string literals. It doesn't validate the JSON — if the input
  is malformed, the output is whatever falls out of the scan.
- The escape handling is essential: inside a string, `\"` is an
  escaped quote (don't toggle `in_str` off); `\\` is an escaped
  backslash (don't treat the next char as an escape). We
  implement this by copying the char after `\` verbatim.
- We don't strip whitespace *between* tokens of an empty object
  (e.g., `{  }` becomes `{}`), but we do strip around the
  braces. This matches the behavior of common JSON minifiers.
- Compare to `json_parser.ae` (already in the repo) which
  actually parses JSON into values (and can minify as a side
  effect by re-serializing). This example is intentionally
  simpler — just the minify step, no parse.
