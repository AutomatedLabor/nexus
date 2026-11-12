# csv_to_json.ae

Parse a CSV string into rows of fields, then emit a JSON-ish
string. Quoted fields with embedded commas are supported
(CSV escaping: `""` inside a quoted field is a literal `"`).
The first row of the CSV is treated as the header (column
names).

## What it does

1. **`strip_cr(s)`** — trim a single trailing `\r` (Windows
   CRLF support).
2. **`split_lines(s)`** — split a multi-line CSV string on
   `\n`, leaving `\r` behind trimmed.
3. **`parse_csv_line(line)`** — parse one CSV line into a
   list of fields. Handles quoted fields with embedded commas
   and the `""` escape.
4. **`parse_csv(s)`** — parse a whole CSV into a list of
   field lists (skip empty lines).
5. **`json_escape(s)`** — escape `"` and `\` for JSON output.
6. **`to_json(rows)`** — convert parsed rows to a JSON-ish
   string. Row 0 is the header; subsequent rows become
   objects keyed by the header.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/csv_to_json.ae
```

## Key language features

- **Two-state scan** in `parse_csv_line` — `in_quote` flips
  when we see a `"`, and inside a quoted field we look ahead
  for `""` (escaped quote) before treating a `"` as close.
- **`while` loops with `mut i`** — sidesteps the for-loop-scope
  quirk.
- **Nested `if/else`** with `;` before the next statement.
- **`strSlice`** to extract substrings during the scan.

## Output format

The output is a JSON array of objects:

```
[{"name":"Ada", "age":"36", "city":"London"}, {"name":"Linus", "age":"54", "city":"Helsinki"}, ...]
```

All values are emitted as strings — the parser doesn't try
to guess whether a field is a number or a boolean. A real
converter would offer a "loose typing" mode that detects
ints / floats / nulls.

## Expected output

```
== CSV -> JSON converter ==

input CSV:
name,age,city
Ada,36,London
Linus,54,Helsinki
Grace,85,"New York, NY"

JSON output:
[{"name":"Ada", "age":"36", "city":"London"}, {"name":"Linus", "age":"54", "city":"Helsinki"}, {"name":"Grace", "age":"85", "city":"New York, NY"}]

--- Edge cases ---
simple: [{"a":"1", "b":"2"}]
header only: []
empty: []
quoted comma: [{"k1":"v1", "k2":"hello, world"}]
escaped quote: [{"k":"she said \"hi\""}]
All assertions passed.
```

## Design notes

- The CSV parser is single-pass and handles all the common
  cases (RFC 4180 subset: quoted fields, escaped quotes,
  embedded commas, CRLF line endings).
- The JSON output is hand-rolled. A production version would
  reuse a JSON serializer (the stdlib has one — see the
  `json_parser.ae` example for the inverse direction).
- Empty lines are skipped — some CSV dialects treat empty
  lines as empty rows; we treat them as record separators.
