# Aether stdlib — `regex`

The `regex` module is a thin, opinionated wrapper over the JavaScript `RegExp` engine.  Patterns are plain strings; the underlying engine supports the full JavaScript regex syntax (character classes, alternation, anchors, lookahead/lookbehind, named groups, Unicode property escapes, and the standard flags `g`, `i`, `m`, `s`, `u`, `y`).  Each helper accepts either a pre-compiled `RegExp` (built with `regex(pattern, flags)`) or a raw pattern string — both forms work in every entrypoint, which keeps call sites concise.

To keep the surface predictable the wrapper does **not** support the `"/pattern/flags"` literal syntax inside strings — if you need flags, build a `RegExp` with `regex("a", "i")` first.  The wrapper does, however, handle the global-flag nuance for you: `matchAll`, `replaceAll`, and `count` automatically promote a non-global pattern to a global one so you don't get bitten by the classic "the regex matched once and stuck at the lastIndex" surprise.

## Functions

### `regex(pattern, flags?) -> regex`
Compiles `pattern` into a JS `RegExp`.  Panics with a descriptive message when the pattern is invalid (e.g. unbalanced parentheses, malformed quantifiers).

```aether
let re = regex.regex("\\d+")
let re2 = regex.regex("a", "i")
```

### `match(s, pattern) -> string[]?`
Returns the first match as an array where element 0 is the whole match and the remaining elements are the capture groups (in order).  Returns `null` when there is no match.

```aether
regex.match("hello", "ell")                         // ["ell"]
regex.match("2024-06-15", "(\\d+)-(\\d+)-(\\d+)")    // ["2024-06-15", "2024", "06", "15"]
regex.match("abc", "z")                              // null
```

### `matchAll(s, pattern) -> string[][]`
Returns every match as an array of arrays (each inner array shaped like `match`'s return).  The pattern is automatically promoted to global if it isn't already, so callers don't need to remember the `g` flag.

```aether
regex.matchAll("a1 b2 c3", "(\\w)(\\d)")
// [["a1","a","1"], ["b2","b","2"], ["c3","c","3"]]
```

### `replace(s, pattern, repl) -> string`
Replaces the **first** match of `pattern` with `repl`.  `repl` may contain `$&` (whole match) and `$1`, `$2`, … capture-group references, following the JS convention.

```aether
regex.replace("a-a-a", "-", "+")         // "a+a-a"
regex.replace("Phone: 555-1234", "(\\d+)", "X")   // "Phone: X-1234"
```

### `replaceAll(s, pattern, repl) -> string`
Replaces **every** match of `pattern` with `repl`.  Same `$&`/`$N` semantics as `replace`.

```aether
regex.replaceAll("a-a-a", "-", "+")       // "a+a+a"
regex.replaceAll("hello", "l", "L")         // "heLLo"
```

### `split(s, pattern) -> string[]`
Splits `s` at each match of `pattern`.  An empty pattern splits the string into characters.

```aether
regex.split("a,b;c", /[,;]/)   // ["a", "b", "c"]
regex.split("abc", "")          // ["a", "b", "c"]
```

### `test(s, pattern) -> bool`
Returns `true` when the pattern matches anywhere in `s`, `false` otherwise.

```aether
regex.test("abc123", "\\d+")   // true
regex.test("abc", "\\d+")       // false
```

### `extract(s, pattern, group?) -> string?`
Returns capture group `group` of the first match (default `0`, the whole match).  Returns `null` when there is no match.  Panics when `group` is out of range.

```aether
regex.extract("Phone: 555-1234", "(\\d{3})-(\\d{4})", 0)  // "555-1234"
regex.extract("Phone: 555-1234", "(\\d{3})-(\\d{4})", 1)  // "555"
regex.extract("abc", "z", 0)                              // null
```

### `groups(s, pattern) -> string[]?`
Returns just the capture groups of the first match (i.e. `match`'s array without its element 0).  Returns `null` when there is no match.

```aether
regex.groups("2024-06-15", "(\\d+)-(\\d+)-(\\d+)")  // ["2024", "06", "15"]
regex.groups("abc", "z")                            // null
```

### `firstMatch(s, pattern) -> string?`
Returns the whole match string of the first match, or `null`.

```aether
regex.firstMatch("hello world", "\\w+")   // "hello"
```

### `count(s, pattern) -> int`
Number of matches of `pattern` in `s`.  The pattern is automatically promoted to global.

```aether
regex.count("foo bar foo baz foo", "foo")   // 3
regex.count("abc", "z")                      // 0
```

### `startsWithMatch(s, pattern) -> bool`
Returns `true` when the pattern matches at the start of `s`.  Implemented by anchoring the pattern with `^(?:...)` so alternations behave correctly.

```aether
regex.startsWithMatch("hello world", "hello")  // true
regex.startsWithMatch("hello world", "world")  // false
```

### `endsWithMatch(s, pattern) -> bool`
Returns `true` when the pattern matches at the end of `s`.  Anchored with `(?:...)$`.

```aether
regex.endsWithMatch("hello world", "world")  // true
regex.endsWithMatch("hello world", "hello")  // false
```

### `escape(s) -> string`
Returns a string where every regex metacharacter in `s` is backslash-escaped.  Useful when building a pattern from user input that should be matched literally.

```aether
regex.escape("a.b*c")   // "a\\.b\\*c"
regex.escape("abc")     // "abc" (no metacharacters)
```

### `flags(pattern) -> string`
Returns the flag string of a `RegExp` instance.  Returns `""` when called with a pattern string (which has no flags).

```aether
regex.flags(regex.regex("a", "gi"))   // "gi"
regex.flags("a")                       // ""
```

## Patterns and what to know about JS regex

The wrapper delegates to the JavaScript `RegExp` engine, which is powerful but has a few quirks worth flagging for Aether users coming from other languages:

- **Greedy by default.**  Quantifiers (`*`, `+`, `?`, `{n,m}`) are greedy; append `?` for lazy matching (e.g. `.*?`).
- **`.` does not match newlines unless the `s` flag is set.**  Use `regex("pattern", "s")` for "dotall" mode.
- **`^`/`$` match at line boundaries with the `m` flag**, otherwise only at string boundaries.
- **Lookbehind** (`(?<=...)` and `(?<!...)`) is supported in modern JS engines; if you are running in a very old runtime it may not be.
- **Unicode property escapes** (`\p{L}` for letters, `\p{N}` for numbers, …) require the `u` flag: `regex("pattern", "u")`.
- **Named groups** are accessible via `groups(s, pattern)` (positional form).  A future module may add a `namedGroups` helper that returns a `{name: value}` record.

## Why no literal `/.../ ` syntax in strings

Many regex libraries accept `"/foo/gi"` as a way to embed flags in a string.  This wrapper deliberately does **not** parse that form, for two reasons:

1. Patterns frequently contain slashes (URLs, paths, JSON-like fragments); parsing `"/.../"` ambiguously would require escape rules that surprise users.
2. The `regex(pattern, flags)` constructor is unambiguous and self-documenting.

If you have a pattern with flags, build a `RegExp` once at module scope and pass it into helpers — this is also faster, since the pattern is compiled once rather than re-parsed on every call.

## Performance notes

`matchAll`, `count`, and `replaceAll` automatically promote the pattern to global.  Re-anchoring in `startsWithMatch`/`endsWithMatch` allocates a fresh `RegExp` each call, which is fine for one-off use but inefficient in tight loops; for those cases build the anchored `RegExp` once with `regex(...)` and pass it in.

The wrapper does not cache compiled patterns across calls.  If you call `test(s, "\\d+")` thousands of times in a hot loop, hoist the pattern: `const re = regex.regex("\\d+"); ... regex.test(s, re)`.  Pre-compiled patterns are passed straight through to the JS engine with no extra work.
