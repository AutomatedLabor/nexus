# json_parser.ae

A small recursive-descent JSON parser written in pure Aether. Parses
a subset of JSON — objects, arrays, strings (with `\n` and `\t`
escapes), integers, booleans, and null — into a tagged enum tree,
then pretty-prints and reads back selected fields.

## What it does

1. **`enum JV`** defines the JSON value type:
   ```aether
   enum JV {
     Nul,
     Bool(bool),
     Int(int),
     Str(string),
     Arr([JV]),
     Obj([(string, JV)]),
   }
   ```
   Objects are stored as an array of `(string, JV)` tuples (insertion
   order preserved). Aether's parser doesn't accept map-typed enum
   payloads, but tuples do.
2. **`parse_json(s)`** is a single recursive function with nested
   closure helpers (`parse_string`, `parse_number`, `parse_array`,
   `parse_object`, `parse_literal`, `dispatch_value`) all sharing a
   `mut pos` index captured by closure. To avoid forward-reference
   issues, the value-dispatch closure is stored in a `mut` slot and
   assigned after the per-type parsers are defined.
3. **`obj_get(o, key)`** looks up a key in a parsed object by linear
   scan of the entries array; returns `JV::Nul` if missing.
4. **`json_string(v)`** pretty-prints a `JV` back to JSON-ish text —
   the round-trip renderer.
5. **Driver**: parses two sample JSON strings (a tiny one and a
   nested one with arrays, booleans, and a sub-object), prints the
   parsed form, walks several fields via `obj_get`, and runs
   `assert_eq` checks on the read-back values.

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /home/z/my-project/verify_one.ts /home/z/my-project/examples/json_parser.ae
```

## Key language features

- **Recursive enums with array/tuple payloads** — `Arr([JV])` and
  `Obj([(string, JV)])` make the AST a tree.
- **`match` with `_ =>` wildcard arms** for the default branch.
- **`for kv in entries { let k = kv.0; let v = kv.1; … }`** — tuple
  destructuring by index inside a for-loop.
- **`mut` closure slot for forward references**: `let mut dispatch_value
  = fn() -> JV { JV::Nul }; dispatch_value = fn() -> JV { … };` — the
  parser references `dispatch_value` from inside the per-type
  parsers, which are defined *before* `dispatch_value`'s real body.
  The mut slot breaks the cycle.
- **`while !done` loops** with multi-arm `if/else` chains for the
  next-character dispatch in `parse_array` / `parse_object`.
- **String escapes** — `parse_string` recognizes `\n` and `\t`,
  passing through any other escaped char verbatim.

## Expected output

```
== Tiny JSON parser in Aether ==

Input:    {"name":"Aether","year":2026}
Parsed:   {"name": "Aether", "year": 2026}
  .name = "Aether"
  .year = 2026

Input:    {"user":"ada","age":36,...}
Parsed:   {"user": "ada", "age": 36, ...}
...
  .address.city = "London"

All assertions passed.
```

## Design notes

- **4 type errors are expected** — the checker doesn't fully model
  the recursive enum payloads or the `mut` closure slot's reassignment.
  The program runs cleanly with these warnings.
- **Why tuples, not maps?** Aether's parser doesn't accept
  `{string: JV}` as an enum payload — only `[(string, JV)]` arrays of
  tuples work. This is a documented v1 limitation. A v2 with proper
  map types would let us use `Obj<{string: JV}>` directly.
- **The `mut dispatch_value` trick** is the standard way to break
  forward references in a recursive-descent parser written in Aether
  v1. The alternative — declaring all helpers as top-level `fn`s
  with `pos` and `s` passed as parameters — is more verbose.
- The parser handles a JSON subset; floats, unicode escapes, and
  nested quoting aren't supported. Adding them is mostly mechanical:
  extend `parse_number` to read a fractional part, extend
  `parse_string` to handle `\uXXXX`, etc.
