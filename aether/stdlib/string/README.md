# Aether stdlib — `string`

The `string` module gives Aether programs a compact, batteries-included toolkit for working with text.  Every function is a pure TypeScript implementation that operates on plain JavaScript strings (and the occasional `any[]` for `join`) — the Aether evaluator passes values straight through, so `string.split("a,b,c", ",")` in Aether becomes `split("a,b,c", ",")` in the host.  Throwing a plain `Error` from a builtin becomes an Aether panic, which is why the functions below panic (rather than silently return a sentinel) when given invalid arguments or out-of-bounds indices.

Conventions used throughout the module:

- Indices are zero-based UTF-16 units where the underlying JS engine uses them (e.g. `charAt`, `charCode`, `indexOf`).  When a function is conceptually Unicode-aware it counts code points instead (`reverse`, `len`).  This distinction matters for strings containing emoji or other astral-plane characters.
- Where a function takes a separator, an empty separator splits the string into its code points (`Array.from(s)`), mirroring the behaviour of `String.prototype.split` in modern JS engines.
- All argument-type checks panic with a clear message naming the function and the offending kind — this surfaces as a runtime panic in Aether so users learn immediately what they got wrong.
- The `format` function supports a useful subset of `printf`: conversions `%s`, `%d`, `%f`, `%x`, `%X`, `%o`, `%b`, `%%`, with optional width, precision (`.`), and the `-` flag for left alignment.  Arguments are consumed positionally in the order the specifiers appear.

## Functions

### `split(s: string, sep?: string) -> string[]`
Splits `s` on `sep`.  When `sep` is omitted, Aether splits on runs of whitespace and drops leading/trailing empty fields (so `split("  a b   c ")` is `["a", "b", "c"]`).  When `sep` is the empty string, `s` is broken into its code points.  Examples:

```aether
string.split("a,b,c", ",")          // ["a", "b", "c"]
string.split("  a b   c ")          // ["a", "b", "c"]
string.split("café", "")            // ["c", "a", "f", "é"]
```

### `join(arr: any[], sep?: string) -> string`
Glues the elements of `arr` into a single string with `sep` between them (`","` by default).  Non-string elements are stringified via `toDisplay` — numbers become their canonical decimal form, booleans become `"true"`/`"false"`, `null`/`undefined` become `"null"`/`"undefined"`, and objects are JSON-encoded.

```aether
string.join(["a", "b", "c"], "-")   // "a-b-c"
string.join([1, 2, 3])              // "1,2,3"
string.join([], "|")                // ""
```

### `trim(s: string) -> string`
Strips leading and trailing whitespace (spaces, tabs, newlines, Unicode whitespace).  See also `trimStart` and `trimEnd` for one-sided trimming.

```aether
string.trim("  hi  ")               // "hi"
string.trim("\tfoo\n")              // "foo"
```

### `trimStart(s: string) -> string`
Like `trim` but only the leading side.

```aether
string.trimStart("  hi  ")          // "hi  "
```

### `trimEnd(s: string) -> string`
Like `trim` but only the trailing side.

```aether
string.trimEnd("  hi  ")            // "  hi"
```

### `toUpper(s: string) -> string`
Uppercases the string using the default Unicode mapping (no locale-specific rules).  Useful for case-insensitive compares via `toUpper(a) == toUpper(b)`.

```aether
string.toUpper("aBc")               // "ABC"
string.toUpper("café")              // "CAFÉ"
```

### `toLower(s: string) -> string`
Lowercases the string.

```aether
string.toLower("aBc")               // "abc"
string.toLower("CAFÉ")              // "café"
```

### `replace(s: string, from: string, to: string) -> string`
Replaces the first occurrence of `from` with `to`.  If `from` does not occur in `s` the string is returned unchanged.  For replacing every occurrence use `replaceAll`.

```aether
string.replace("a-a-a", "-", "+")   // "a+a-a"
string.replace("abc", "z", "y")     // "abc"
```

### `replaceAll(s: string, from: string, to: string) -> string`
Replaces every occurrence of `from` with `to`.  An empty `from` is treated as a no-op to avoid an infinite loop and to match the intuition that "nothing" cannot be replaced.

```aether
string.replaceAll("a-a-a", "-", "+")  // "a+a+a"
string.replaceAll("abc", "", "X")     // "abc"
```

### `startsWith(s: string, prefix: string) -> bool`
Returns `true` when `s` begins with `prefix`, otherwise `false`.

```aether
string.startsWith("hello", "he")    // true
string.startsWith("hello", "lo")    // false
```

### `endsWith(s: string, suffix: string) -> bool`
Returns `true` when `s` ends with `suffix`, otherwise `false`.

```aether
string.endsWith("hello", "lo")      // true
string.endsWith("hello", "he")      // false
```

### `contains(s: string, sub: string) -> bool`
Returns `true` when `sub` occurs anywhere inside `s`, otherwise `false`.

```aether
string.contains("hello", "ell")     // true
string.contains("hello", "xyz")     // false
```

### `indexOf(s: string, sub: string) -> int`
Returns the index of the first occurrence of `sub` in `s`, or `-1` when not found.  Indices are UTF-16 code-unit offsets.

```aether
string.indexOf("hello", "l")        // 2
string.indexOf("hello", "z")        // -1
```

### `slice(s: string, start: int, end?: int) -> string`
Returns the substring from `start` (inclusive) to `end` (exclusive).  Negative indices count from the end.  If `end` is omitted the substring runs to the end of the string.

```aether
string.slice("hello", 1)            // "ello"
string.slice("hello", 1, 3)         // "el"
string.slice("hello", -2)           // "lo"
```

### `charAt(s: string, i: int) -> string`
Returns the single character at index `i`.  Panics if `i` is out of range.

```aether
string.charAt("abc", 1)             // "b"
string.charAt("abc", 5)             // panic
```

### `charCode(s: string, i: int) -> int`
Returns the UTF-16 code unit at index `i`.  Panics if `i` is out of range.

```aether
string.charCode("A", 0)             // 65
string.charCode("A", 1)             // panic
```

### `fromCharCode(n: int) -> string`
Builds a single-character string from a code point.  Code points above the BMP (`U+10000` and up) are emitted as a UTF-16 surrogate pair so the resulting string contains one logical character.  Panics for code points outside the range `0..0x10ffff`.

```aether
string.fromCharCode(65)             // "A"
string.fromCharCode(0x1f600)        // "😀"
string.fromCharCode(-1)             // panic
```

### `repeat(s: string, n: int) -> string`
Returns `s` concatenated with itself `n` times.  Panics for negative `n`.

```aether
string.repeat("ab", 3)              // "ababab"
string.repeat("ab", 0)              // ""
string.repeat("ab", -1)             // panic
```

### `padStart(s: string, n: int, ch?: string) -> string`
Left-pads `s` with the character `ch` (default space) until it is `n` characters long.  If `s` is already at least `n` long it is returned unchanged.  `ch` must be exactly one character; the function panics otherwise.

```aether
string.padStart("5", 3)             // "  5"
string.padStart("5", 3, "0")        // "005"
```

### `padEnd(s: string, n: int, ch?: string) -> string`
Right-pads `s` with `ch` (default space) to length `n`.

```aether
string.padEnd("5", 3)               // "5  "
string.padEnd("5", 3, ".")          // "5.."
```

### `reverse(s: string) -> string`
Returns the string with its code points in reverse order.  This is Unicode-aware: `"a😀b".reverse()` returns `"b😀a"` rather than mangling the surrogate pair.

```aether
string.reverse("abc")              // "cba"
string.reverse("a😀b")             // "b😀a"
```

### `len(s: string) -> int`
Returns the number of code points in `s`.  Use `charCode`-style `s.length` (i.e. UTF-16 length) only when you specifically need to count surrogate pairs as two units; `len` is the right answer for almost all "how long is this string" questions.

```aether
string.len("abc")                  // 3
string.len("a😀b")                 // 3
```

### `isEmpty(s: string) -> bool`
Returns `true` when `s` has length 0, otherwise `false`.  A common idiom for guard clauses.

```aether
string.isEmpty("")                 // true
string.isEmpty("x")                // false
```

### `toInt(s: string) -> int`
Parses `s` as a number and truncates to an integer.  The string is first trimmed; an empty (or whitespace-only) string panics.  Inputs that do not form a finite number panic as well.  Inputs like `"3.9"` are accepted and truncated to `3` — use the `float` module's `parse` if you want the floating-point value.

```aether
string.toInt("42")                 // 42
string.toInt("  -7 ")              // -7
string.toInt("3.9")                // 3
string.toInt("nope")               // panic
```

### `format(fmt: string, ...args: any) -> string`
A `printf`-style formatter.  Recognised conversions are `%s` (string), `%d` (integer), `%f` (float, default 6 decimal places), `%x`/`%X` (hex), `%o` (octal), `%b` (binary), and `%%` (literal percent).  Width, precision (`.`), and the `-` (left-align) flag are supported, e.g. `"%5.2f"` produces a 5-wide right-aligned number with 2 decimals.  Unknown conversions panic.

```aether
string.format("%s=%d", "x", 7)              // "x=7"
string.format("pi=%f", 3.14159)             // "pi=3.141590"
string.format("%5.2f", 3.14159)             // " 3.14"
string.format("%-5.2f|", 3.1)               // "3.10 |"
string.format("%x", 255)                    // "ff"
string.format("%o", 8)                      // "10"
string.format("100%%")                      // "100%"
string.format("%.2s", "hello")              // "he"
```

## Notes on behaviour

The module is intentionally small and predictable.  It does not perform locale-aware case mapping, grapheme-aware slicing, or regular-expression substitution — those concerns are handled by the `text` and `regex` modules respectively.  When you need to interoperate with the underlying JS engine semantics for advanced work (e.g. raw UTF-16 indices) prefer `indexOf`, `charCode`, and `slice`; when you need a user-facing notion of "character" or "length", prefer `len`, `reverse`, and `charAt` plus the helpers in `text`.

All functions panic on type mismatch rather than coercing silently — this matches Aether's static-typing philosophy where a type error during evaluation is a bug, not an implicit conversion.
