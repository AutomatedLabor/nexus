# json_path.ae

A tiny JSONPath evaluator. Given a "JSON-like" data structure
(represented as nested parallel arrays — keys and values are
kept in parallel arrays to mimic objects — and arrays of such
"objects"), evaluate a path like `$.store.book[0].title` and
print the matched value.

## The data model

- An "object" is a 2-element array: `["obj", [[key, value], ...]]`.
- An "array"  is a 2-element array: `["arr", [v, v, ...]]`.
- A "string" is `["str", "text"]`.
- An "int"   is `["int", 42]`.

This tagged-union approach works around Aether's lack of a
generic `map<string, any>` type — every value carries its own
type tag.

## The path syntax

- `$`         — the root.
- `.name`     — descend into an object's `name` field.
- `[i]`       — index into an array.

Anywhere we can't descend (wrong tag, missing key, out-of-range
index), we return `()` (Aether's unit value).

## What it does

1. **`obj_get(o, key)`** — linear search an object's entries
   for `key`; return the value or `()`.
2. **`arr_get(a, i)`** — index into an array value, bounds-checked.
3. **`parse_path(p)`** — scan a path string into a list of steps:
   `["root"]`, `["key", name]`, `["index", i]`.
4. **`eval_path(root, steps)`** — walk the steps, descending
   into the value at each step.
5. **Driver** — sets up a small "store" with two books and a
   bicycle, then evaluates several paths.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/json_path.ae
```

## Key language features

- **`type_of(v)`** to dispatch on a value's kind.
- **Tagged-union arrays** (`["obj", ...]`, `["arr", ...]`)
  as the universal value representation.
- **`int(s)`** to parse the index inside `[i]`.
- **`return ()`** as the "no match" sentinel — Aether treats
  `()` as a unit value distinct from `0` and `false`.

## Expected output

```
== Tiny JSONPath evaluator ==

path: $.store.book[0].title
parsed steps: [[root], [key, store], [key, book], [index, 0], [key, title]]
value: "Sayings of the Century"

path: $.store.book[1].author
value: "Evelyn Waugh"

path: $.store.bicycle.color
value: "red"

path: $.store.book[0].price
value: 895

missing path: ()
All assertions passed.
```

## Design notes

- The parser is a single `while` loop with character dispatch
  — `.` for keys, `[` for indices. It's small but extensible.
- A real JSONPath (`$..*`, `$.store..price`, `$[?@.price < 10]`)
  needs a proper recursive-descent parser. The version here
  covers only the most common shapes.
- The data model mirrors how a JSON parser would represent
  its AST — see `json_parser.ae` for a full recursive-descent
  JSON parser in Aether.
