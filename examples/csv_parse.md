# csv_parse.ae

A small CSV parser. Given a string of CSV text, parse each line
into a row of fields. We support quoted fields (containing commas,
escaped quotes via `""`). The parser is single-pass: we walk the
input, accumulating the current field, the current row, and the
list of rows.

## What it does

1. **State ids** — three states for the state machine:
   - `S_FIELD` — inside an unquoted field.
   - `S_QUOTED` — inside a quoted field.
   - `S_QUOTE_SEEN` — just saw a `"` inside a quoted field
     (might be the closing quote, or an escaped `""`).
2. **`parse_csv(text)`** — single-pass scan:
   - Walk the input char by char.
   - In `S_FIELD`: `,` ends the field, `\n` ends the row,
     `"` enters a quoted field, anything else appends to the
     current field.
   - In `S_QUOTED`: `"` enters `S_QUOTE_SEEN`, anything else
     appends to the field.
   - In `S_QUOTE_SEEN`: another `"` is an escaped quote (append
     one `"` and return to `S_QUOTED`); `,` ends the field; `\n`
     ends the row; anything else ends the quoted section and
     appends.
   - At EOF, flush the last field and row if non-empty.
3. **`show_row(row)`** — pretty-print a row as `f1 | f2 | f3`.
4. **Driver** — parses a 5-row CSV with quoted fields and
   prints each row, then asserts the parsed structure.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/csv_parse.ae
```

## Key language features

- **Nested `if/else` with `;`** — required by the parser when
  an if/else is followed by another statement.
- **`while i < n`** main loop — sidesteps the for-loop-scope
  quirk.
- **`let _ = flush()`** — discards the return value of the
  helper (which returns `0`). The helper mutates `row` and
  `field` as a side effect.
- **`str(text[i])`** — extract a single character as a string
  for comparison. Aether has no char type.

## Expected output

```
== CSV parser ==

input:
name,age,city
Alice,30,NYC
Bob,25,LA
"Carol, Jr.",40,SF
"D, E",50,"Boston, MA"

parsed 5 rows:
  row 0: name | age | city
  row 1: Alice | 30 | NYC
  row 2: Bob | 25 | LA
  row 3: Carol, Jr. | 40 | SF
  row 4: D, E | 50 | Boston, MA

All assertions passed.
```

## Design notes

- The "Carol, Jr." row demonstrates that commas inside quoted
  fields are preserved (not treated as separators). The `"D, E"`
  field is similar.
- The `"Boston, MA"` field is at the *end* of a row, so it
  shows that quoted-field handling works at the row boundary.
- We use a simple state machine with 3 states. A more rigorous
  CSV parser (e.g., RFC 4180) handles edge cases like BOM,
  different line endings, and quoted fields that contain
  newlines — for a tiny demo this is out of scope.
- The `let _ = flush();` pattern is a workaround: Aether's
  `push` returns `unit`, and the parser may complain about
  "unused expression" if you just write `flush()`. Wrapping
  in `let _ = ...` makes it explicit that we discard the
  return.
- The driver's input is 5 lines including a trailing `\n`,
  which produces exactly 5 rows (no spurious empty 6th row).
