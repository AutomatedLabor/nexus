# aether-string

> Extended string operations for Aether — 30 pure functions covering splitting/joining, trimming, case conversion, alignment, reversal, and edit distances, written in Aether itself.

Aether's core builtins include just three character-level string primitives — `charCode(s, i)`, `fromCharCode(n)`, and `strSlice(s, start, end)` — plus `len`, `+` (concat), and string interpolation `f"..."`. The language ships without `split`, `replace`, `trim`, `toUpper`, `padLeft`, `levenshtein`, or any of the other operations every program eventually needs. `aether-string` is the canonical user-installable package that fills the gap, providing a small but complete string library that lives entirely in user-space: no compiler hooks, no host primitives beyond the three character builtins.

If you can read Aether, you can read the source of `lib.ae` — it's heavily commented and intended to be read end-to-end. The package is the second target of the Aether package registry (RFC-005, draft) and the reference implementation for how string libraries should compose with the core language.

## Why a string package?

The core builtins (`charCode`/`fromCharCode`/`strSlice`) are intentionally low-level: they expose exactly the operations a self-hosted lexer or parser needs (Unicode code-point access and substring extraction) and nothing more. Every higher-level string operation — `split`, `replace`, `trim`, `toUpper`, `levenshtein` — can be implemented in terms of these three primitives plus `len` and `+`. Pushing those operations into user-space keeps the language core small and forces the design to be compositional (you build string libraries by combining primitives, not by adding new builtins).

`aether-string` is the reference implementation of that philosophy. It demonstrates:

- That the three character primitives are sufficient for a complete string library.
- That the library is fast enough for the common cases (no quadratic blowups except where unavoidable, like `nub`-style deduplication).
- That idiomatic Aether — `while` loops, `push`, `reduce`, explicit indices — is expressive enough for real-world string manipulation.

## API

All 30 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they return new strings and never mutate their inputs. Iteration uses `while` with explicit indices (no `for in` loops), defensively avoiding the v1 evaluator's for-loop-scope quirk.

### Splitting / joining

| Function | Signature | Description |
| --- | --- | --- |
| `split(s, sep)` | `(string, string) -> [string]` | Split `s` on every non-overlapping occurrence of `sep`. Empty `sep` → char-by-char split. |
| `join(arr, sep)` | `([string], string) -> string` | Join array of strings with `sep`. Inverse of `split`. |

### Trimming

| Function | Signature | Description |
| --- | --- | --- |
| `trim(s)` | `(string) -> string` | Strip leading and trailing ASCII whitespace (space, tab, newline, CR). |

### Searching / replacing

| Function | Signature | Description |
| --- | --- | --- |
| `replace(s, from, to)` | `(string, string, string) -> string` | Replace the FIRST occurrence of `from` with `to`. |
| `replaceAll(s, from, to)` | `(string, string, string) -> string` | Replace every occurrence of `from` with `to`. |
| `startsWith(s, p)` | `(string, string) -> bool` | True if `s` starts with prefix `p`. |
| `endsWith(s, p)` | `(string, string) -> bool` | True if `s` ends with suffix `p`. |
| `contains(s, sub)` | `(string, string) -> bool` | True if `s` contains `sub`. Empty `sub` → true. |
| `indexOf(s, sub)` | `(string, string) -> int` | First index of `sub` in `s`, or -1. |
| `slice(s, start, end)` | `(string, int, int) -> string` | Substring `[start, end)`. Negative indices clamp to 0. |

### Padding / centering / repeat

| Function | Signature | Description |
| --- | --- | --- |
| `padLeft(s, n, ch)` | `(string, int, string) -> string` | Left-pad `s` with single-char `ch` to width `n`. |
| `padRight(s, n, ch)` | `(string, int, string) -> string` | Right-pad. |
| `center(s, n, ch)` | `(string, int, string) -> string` | Center `s` in a string of width `n`, padded with `ch` on both sides. |
| `repeat(s, n)` | `(string, int) -> string` | Concatenate `s` with itself `n` times. |

### Reversal / case conversion

| Function | Signature | Description |
| --- | --- | --- |
| `reverse(s)` | `(string) -> string` | Reverse the string character by character. |
| `toUpper(s)` | `(string) -> string` | ASCII uppercase. Non-letters pass through unchanged. |
| `toLower(s)` | `(string) -> string` | ASCII lowercase. |
| `capitalize(s)` | `(string) -> string` | Uppercase the first char, lowercase the rest. |
| `camelCase(s)` | `(string) -> string` | Convert from snake/kebab/space to camelCase. |
| `snake_case(s)` | `(string) -> string` | Convert from camelCase/kebab/space to snake_case. |
| `kebabCase(s)` | `(string) -> string` | Convert from camel/snake/space to kebab-case. |
| `titleCase(s)` | `(string) -> string` | Capitalize the first letter of each word. |

### Word / line splitting

| Function | Signature | Description |
| --- | --- | --- |
| `words(s)` | `(string) -> [string]` | Split on whitespace, dropping empty tokens. |
| `lines(s)` | `(string) -> [string]` | Split on newlines, dropping the trailing empty if `s` ends with `\n`. |
| `unlines(arr)` | `([string]) -> string` | Join with `\n`. Inverse of `lines`. |
| `unwords(arr)` | `([string]) -> string` | Join with `" "`. Inverse of `words`. |

### Edit distances

| Function | Signature | Description |
| --- | --- | --- |
| `levenshtein(a, b)` | `(string, string) -> int` | Levenshtein edit distance (insert/delete/substitute). O(m*n). |
| `hamming(a, b)` | `(string, string) -> int` | Hamming distance. Panics if `len(a) != len(b)`. |

## How to use

### As a dependency

Add `aether-string` to your project's `aether.toml`:

```toml
[dependencies]
aether-string = "0.1.0"
```

Then in your Aether source, import the functions you need:

```aether
import { split, join, camelCase, levenshtein } from "aether-string";

let parts = split("hello,world,again", ",");
let camel = camelCase("hello world again");
let dist = levenshtein("kitten", "sitting");

print(parts);   // [hello, world, again]
print(camel);    // helloWorldAgain
print(dist);     // 3
```

### Locally (without the registry)

The package is a directory with `src/lib.ae`. You can import it directly by relative path:

```aether
import { toUpper, snake_case } from "./aether-packages/aether-string/src/lib.ae";

print(toUpper("hello"));         // HELLO
print(snake_case("helloWorld")); // hello_world
```

### Running the test suite

```sh
aether test aether-packages/aether-string/tests
# PASS aether-packages/aether-string/tests/tests.ae
# 1 passed, 0 failed
```

The test file (`tests/tests.ae`) contains 30+ `assert_eq` cases covering every `pub fn` in the library.

### Running the example

```sh
aether run aether-packages/aether-string/examples/example.ae
```

The example exercises every function with a small input, producing a snapshot of expected outputs.

## Design notes

### Why character-by-character iteration?

The three primitives `charCode`, `fromCharCode`, and `strSlice` are the only character-level string operations Aether's core provides. This means every character-level operation (uppercase, lowercase, reverse, contains, etc.) must be implemented as a `while` loop walking `charCode(s, i)` and building the output string with `+`. This is asymptotically quadratic in the string length (because string concatenation is O(n) in Aether, since strings are immutable), but for the typical string sizes in application code (a few hundred to a few thousand characters) it's fast enough.

If you need O(n) string building for very long strings, the pattern is to push characters into an array with `push` and `join` at the end:

```aether
let mut chars = [];
let mut i = 0;
while i < len(s) {
  push(chars, fromCharCode(charCode(s, i) + 32));
  i = i + 1;
}
join(chars, "")
```

`aether-string` uses the simpler `out = out + fromCharCode(...)` form for readability; the array+join optimization is left as a follow-up for `aether-string-extra`.

### Why ASCII-only case conversion?

`toUpper` and `toLower` only handle ASCII letters (A-Z, a-z). Non-ASCII characters (e.g. é, ñ, Ω) pass through unchanged. This matches Python's `str.upper()` for the ASCII range and is the simplest correct implementation. Full Unicode case conversion would require a Unicode character database, which is a much larger undertaking and probably belongs in a separate `aether-unicode` package.

### Why `snake_case` and not `snakeCase` for the function name?

`snake_case` and `kebabCase` are *functions* that produce snake_case and kebab-case strings respectively. Naming the snake_case converter `snake_case` is the convention in JS/Python string libraries (`snake_case`, `kebabCase`, `camelCase`). The function-name case matches the target case (mostly): `snake_case` is snake-cased, `kebabCase` is camelCased (because hyphens aren't valid in identifiers), and `camelCase` is camelCased. `titleCase` follows the same convention.

### Why are pad chars `string` and not `char`?

Aether doesn't have a distinct `char` type at runtime (chars are 1-char strings). The pad functions take a `string` argument and use its first character; if the argument is empty, they default to a single space. This makes the API forgiving:

```aether
padLeft("42", 5, "0")   // "00042" — uses '0'
padLeft("42", 5, "")    // "   42" — defaults to ' '
padLeft("42", 5, "XY")  // "XXX42" — uses 'X' (first char)
```

### Why panic on `hamming` with unequal lengths?

Hamming distance is mathematically undefined for strings of different lengths. Two options:

1. **Panic** (chosen). Matches the mathematical definition and forces the caller to handle the precondition explicitly.
2. **Return -1** (silent error). Bugs from accidentally passing different-length strings would be hard to track down.

The panic message is descriptive (`"hamming: strings must be equal length"`) so the error is easy to find.

### Why Levenshtein with rolling rows?

The classic Levenshtein DP uses an O(m*n) matrix. We use two rolling rows (`prev` and `curr`), reducing space from O(m*n) to O(n). Time is still O(m*n). The implementation is short enough to fit on one screen, which is the priority for a teaching codebase.

## Implementation patterns

The codebase uses a small set of recurring patterns. Recognizing them makes the source easier to read.

### Pattern 1: charCode walk

The most common pattern: iterate with `charCode(s, i)`, build output with `out = out + fromCharCode(...)`.

```aether
pub fn toUpper(s: string) -> string {
  let mut out = "";
  let mut i = 0;
  while i < len(s) {
    let c = charCode(s, i);
    if c >= 97 && c <= 122 {
      out = out + fromCharCode(c - 32);
    } else {
      out = out + fromCharCode(c);
    };
    i = i + 1;
  }
  out
}
```

### Pattern 2: substring search

`contains`, `indexOf`, `replace`, `replaceAll`, `split`, `startsWith`, `endsWith` all rely on the `slice_eq_at(s, pos, sub)` helper, which checks whether the substring of `s` starting at `pos` equals `sub`. This is the "needle in a haystack" primitive — implemented once, reused everywhere.

### Pattern 3: stateful iteration

`words`, `camelCase`, `snake_case`, `titleCase` use a `start` index or a `cap_next` flag to track state across iterations. This is the canonical "tokenizer" pattern.

### Pattern 4: DP with rolling rows

`levenshtein` is the only DP in the package. The pattern is:

```aether
let mut prev = [...initial row...];
let mut i = 1;
while i <= m {
  let mut curr = [i];
  // ... fill curr ...
  prev = curr;
  i = i + 1;
}
prev[n]
```

This keeps space at O(n) (one row at a time) instead of O(m*n) (full matrix).

## Future work

- **O(n) string building.** Replace `out = out + fromCharCode(...)` with `push(out, fromCharCode(...))` + `join` for very long strings. Tradeoff: code is slightly less readable.
- **Full Unicode case conversion.** Requires a Unicode character database; probably belongs in `aether-unicode`.
- **Regex support.** A `replaceRegex` / `splitRegex` would require a regex engine, which is a separate package (`aether-regex`).
- **String builders.** A mutable `StringBuilder` type would amortize concatenation cost; could live in `aether-string-extra`.

## License

MIT — same as the Aether language.
