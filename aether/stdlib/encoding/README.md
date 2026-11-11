# Aether stdlib — `encoding`

The `encoding` module bundles the everyday serialization formats Aether programs reach for: JSON, Base64, hex, UTF-8 bytes, URL-encoding, CSV, plus minimal YAML/TOML emitters and a tiny msgpack-style packer.  Everything is built on top of standard built-ins (`JSON`, `TextEncoder`/`TextDecoder`, `btoa`/`atob`, `encodeURIComponent`/`decodeURIComponent`) with a Node `Buffer` fallback for environments where the browser globals are missing.

The CSV parser and writer are implemented by hand to handle the full RFC 4180 subset — quoted fields, embedded commas, embedded newlines, and escaped double quotes — so a real-world CSV round-trips correctly.  The YAML, TOML, and msgpack helpers cover a deliberately smaller subset (see "Limitations" at the bottom of this README); they exist for the cases where you need to emit a human-readable or compact binary blob from JSON-shaped Aether values without pulling in a heavy dependency.

## JSON

### `jsonStringify(v) -> string`
Compact JSON encoding.  Use this for everything that needs to be machine-readable; for human-readable output use `jsonPretty`.

```aether
encoding.jsonStringify({a: 1, b: [2, 3]})  // '{"a":1,"b":[2,3]}'
```

### `jsonParse(s) -> any`
Parse JSON text into a value.  Panics with the underlying `SyntaxError` message when the input is not valid JSON.

```aether
encoding.jsonParse('{"a":1}')    // {a: 1}
encoding.jsonParse('{bad')         // panic
```

### `jsonPretty(v) -> string`
Indent JSON with two spaces per level.

```aether
encoding.jsonPretty({a: 1})
// '{
//   "a": 1
// }'
```

## Base64

### `base64Encode(s) -> string`
Encodes a UTF-8 string into Base64.  Multi-byte UTF-8 sequences are correctly handled — `base64Decode(base64Encode("héllo😀"))` round-trips.

```aether
encoding.base64Encode("foo")   // "Zm9v"
encoding.base64Encode("é")      // "w6k="
```

### `base64Decode(s) -> string`
Decodes Base64 back into a UTF-8 string.  The decode path uses the same UTF-8 machinery as `base64Encode`, so non-ASCII round-trips cleanly.

```aether
encoding.base64Decode("Zm9v")    // "foo"
encoding.base64Decode("w6k=")    // "é"
```

## Hex

### `hexEncode(s) -> string`
Hex-encodes the UTF-8 bytes of `s`.  Each byte becomes two lowercase hex digits.

```aether
encoding.hexEncode("Aether")   // "416574686572"
encoding.hexEncode("é")         // "c3a9"
```

### `hexDecode(s) -> string`
Decodes a hex string into a UTF-8 string.  Panics on odd-length input or on invalid hex digits (with the offending index).

```aether
encoding.hexDecode("416574686572")  // "Aether"
encoding.hexDecode("c3a9")          // "é"
encoding.hexDecode("abc")            // panic (odd length)
```

## UTF-8 / bytes

### `utf8Encode(s) -> int[]`
Returns the UTF-8 byte sequence of `s` as an array of integers (each 0–255).

```aether
encoding.utf8Encode("AB")    // [0x41, 0x42]
encoding.utf8Encode("é")     // [0xc3, 0xa9]
```

### `utf8Decode(bytes) -> string`
Decodes an array (or `Uint8Array`) of UTF-8 bytes back into a string.

```aether
encoding.utf8Decode([0x41, 0x42])   // "AB"
```

### `bytesToString(bytes) -> string`
Alias of `utf8Decode` for readability at call sites where you have raw bytes and want them as text.

## URL

### `urlEncode(s) -> string`
`encodeURIComponent(s)` — encodes a string for use as a single URL component.

```aether
encoding.urlEncode("a b?c=d")   // "a%20b%3Fc%3Dd"
```

### `urlDecode(s) -> string`
`decodeURIComponent(s)` — decodes a URL component.  Panics on malformed percent-escapes.

```aether
encoding.urlDecode("a%20b")   // "a b"
```

### `urlencode(v) -> string`
Form-encodes an object/map of key/value pairs into a query string.  When given a string it falls back to `encodeURIComponent`.

```aether
encoding.urlencode({a: 1, b: 2})   // "a=1&b=2"
encoding.urlencode("hello world")   // "hello%20world"
```

### `queryParse(s) -> object`
Parses a query string (with or without a leading `?`) into an object.  Empty values become empty strings; the order of keys is preserved.

```aether
encoding.queryParse("a=1&b=2")     // {a: "1", b: "2"}
encoding.queryParse("?a=1")          // {a: "1"}
encoding.queryParse("")              // {}
```

### `queryStringify(obj) -> string`
Stringifies an object into a query string (without a leading `?`).

```aether
encoding.queryStringify({a: "1", b: "two"})   // "a=1&b=two"
```

## CSV

### `csvParse(s) -> string[][]`
Parses RFC 4180 CSV into an array of rows.  Quoted fields, embedded commas, embedded newlines (inside quotes), and `""`-escaped quotes are all handled.

```aether
encoding.csvParse("a,b,c\n1,2,3")
// [["a","b","c"], ["1","2","3"]]

encoding.csvParse('"a,b",c')                 // [["a,b","c"]]
encoding.csvParse('"line1\nline2",b')         // [["line1\nline2","b"]]
encoding.csvParse('"She said ""hi""",b')      // [['She said "hi"', "b"]]
```

### `csvStringify(rows) -> string`
Serialises a 2-D array into RFC 4180 CSV.  Fields containing a comma, quote, newline, or carriage return are auto-quoted and inner quotes are escaped as `""`.

```aether
encoding.csvStringify([["a,b", "c"]])             // '"a,b",c'
encoding.csvStringify([['He said "hi"', "x"]])     // '"He said ""hi""",x'
```

## YAML (subset)

### `yamlStringify(v) -> string`
A minimal YAML emitter.  Scalars (string/number/boolean/null), arrays, and objects/maps are emitted recursively.  Strings that contain YAML metacharacters (e.g. `:`, `[`, `{`, newlines, leading/trailing whitespace) are JSON-quoted so the output is unambiguous.

```aether
encoding.yamlStringify({a: 1, b: "two"})
// a: 1
// b: two
```

**Limitations.**  No anchors/aliases, no flow style, no multi-line literal block scalars, no tags, no typed scalars (everything is plain).  Suitable for round-tripping JSON-shaped values; not a full YAML implementation.

## TOML (subset)

### `tomlStringify(v) -> string`
A minimal TOML emitter.  Top-level scalar keys are emitted inline; nested objects become `[table]` sections.  Arrays and primitives are supported.  Panics when given `null` (TOML has no null) or when the top-level value is not an object/map.

```aether
encoding.tomlStringify({
  name: "Aether",
  version: 1,
  server: { port: 8080, host: "127.0.0.1" }
})
// name = "Aether"
// version = 1
//
// [server]
// port = 8080
// host = "127.0.0.1"
```

**Limitations.**  No array-of-tables, no multi-line strings, no inline tables, no datetimes, no comments.  Like the YAML emitter, this is for JSON-shaped values, not a full TOML implementation.

## msgpack (subset)

### `msgpackPack(v) -> int[]`
A tiny msgpack-style binary packer.  It follows the real msgpack spec for the most common cases so the output is interoperable with a real msgpack decoder for those cases:

- `null` → `0xc0`
- `false`/`true` → `0xc2`/`0xc3`
- Positive int in `0..127` → 1-byte inline
- Negative int in `-32..-1` → 1-byte inline
- Other numbers → `0xcb` + 8-byte big-endian `float64`
- String length `< 32` → `0xa0 | len`; length `< 256` → `0xd9 + len`; otherwise `0xda + 2-byte len`
- Array length `< 16` → `0x90 | len`; otherwise `0xdc + 2-byte len`
- Map length `< 16` → `0x80 | len`; otherwise `0xde + 2-byte len`

There is no `msgpackUnpack` in this module — pair with a real msgpack library on the receiving side, or pair with the host's `msgpackUnpack` once the runtime grows one.  For the playground demo this helper is enough to show that Aether values can be turned into compact binary without depending on an external library.

## Notes on runtime detection

`utf8ToBytes`, `bytesToUtf8`, `base64Encode`, and `base64Decode` try the browser globals first (`TextEncoder`, `btoa`, `atob`) and fall back to Node's `Buffer` when those are missing.  This means the same code path produces correct output in a browser playground, a Node CLI, and a Bun test runner without per-environment shims.

The CSV parser is a single-pass character scanner.  It is fast enough for typical "import this CSV" use cases; for multi-gigabyte files you would want a streaming parser (out of scope for the stdlib).
