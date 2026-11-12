# aether-text

> Prose-level text utilities for Aether — 17 pure functions covering line/word splitting, indentation, wrapping, alignment, case conversion, truncation, and word/char counting, written in Aether itself.

`aether-string` is the package you reach for when you need string *primitives* — `split`, `replace`, `indexOf`, `levenshtein`. `aether-text` is the package you reach for when you need *prose formatting* — `indent`, `dedent`, `wrap`, `center`, `left`, `right`, `titleCase`, `truncate`. The two packages overlap in a few places (`lines`, `words`, `unlines`, `unwords`, the case converters) but their focus is different: `aether-string` is a low-level string library; `aether-text` is a high-level prose library.

Every function in `aether-text` is implemented in pure Aether on top of the four character primitives (`charCode`, `fromCharCode`, `strSlice`, `len`). No host calls, no regex, no Unicode tables. The case conversions are ASCII-only — non-letters pass through unchanged — and the wrap algorithm is greedy (first-fit). Both choices are deliberate: they keep the package readable end-to-end and portable across every Aether runtime (tree-walker, VM, WASM, x86), including the eventual self-hosted bootstrap.

## Why a prose package?

Aether's core ships with three string primitives and `len`. That's enough to build any string library, but it's not enough to *use* the language for real prose work: there's no `wrap`, no `indent`, no `truncate`, no `wordCount`. Adding these to the core would bloat the language's primitive surface and force every runtime to re-implement them in TypeScript. Pushing them into user-space keeps the core small and lets the prose library evolve at its own pace.

`aether-text` is the reference prose library. It demonstrates:

- That the four character primitives are sufficient for a real prose library.
- That greedy word wrap, common-prefix dedent, and fixed-width alignment are all expressible in idiomatic Aether (`while` + `push` + `strSlice`).
- That a small package can have a coherent API (17 functions, all on strings) without growing into a kitchen sink.

## API

All 17 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they return new strings/arrays and never mutate their inputs.

### Line / word splitting

| Function | Signature | Description |
| --- | --- | --- |
| `lines(s)` | `(string) -> [string]` | Split on `\n`. Trailing newline does not yield an empty line. |
| `words(s)` | `(string) -> [string]` | Split on whitespace runs, dropping empty tokens. |
| `unlines(arr)` | `([string]) -> string` | Join with `\n`. Inverse of `lines`. |
| `unwords(arr)` | `([string]) -> string` | Join with `" "`. Inverse of `words`. |

### Indentation / wrapping

| Function | Signature | Description |
| --- | --- | --- |
| `indent(s, n)` | `(string, int) -> string` | Indent every line by `n` spaces. |
| `dedent(s)` | `(string) -> string` | Remove the common leading whitespace from all non-blank lines. |
| `wrap(s, width)` | `(string, int) -> string` | Greedy word wrap to `width` columns. |

### Alignment

| Function | Signature | Description |
| --- | --- | --- |
| `center(s, width)` | `(string, int) -> string` | Center `s` in a string of `width` spaces. |
| `left(s, width)` | `(string, int) -> string` | Left-align (pad right with spaces) to `width`. |
| `right(s, width)` | `(string, int) -> string` | Right-align (pad left with spaces) to `width`. |

### Case conversion

| Function | Signature | Description |
| --- | --- | --- |
| `titleCase(s)` | `(string) -> string` | Capitalize the first letter of each word. |
| `camelCase(s)` | `(string) -> string` | Convert from snake/kebab/space to camelCase. |
| `snake_case(s)` | `(string) -> string` | Convert from camel/kebab/space to snake_case. |
| `kebabCase(s)` | `(string) -> string` | Convert from camel/snake/space to kebab-case. |

### Truncation / counting

| Function | Signature | Description |
| --- | --- | --- |
| `truncate(s, maxLen)` | `(string, int) -> string` | Truncate to `maxLen` chars, appending `"..."` if shortened. |
| `wordCount(s)` | `(string) -> int` | Number of whitespace-separated words. |
| `charCount(s)` | `(string) -> int` | Number of UTF-16 code units (alias of `len(s)`). |

## How to use

### As a dependency

Add `aether-text` to your project's `aether.toml`:

```toml
[dependencies]
aether-text = "0.1.0"
```

Then in your Aether source:

```aether
import { wrap, indent, titleCase, wordCount } from "aether-text";

let para = "the quick brown fox jumps over the lazy dog";
print(wrap(para, 20));
print("");
print(titleCase(para));
print("words: " + str(wordCount(para)));
```

### Locally (without the registry)

```aether
import { dedent, snake_case } from "./aether-packages/aether-text/src/lib.ae";

print(dedent("    line one\n    line two"));
print(snake_case("helloWorld"));
```

### Running the test suite

```sh
aether test aether-packages/aether-text/tests
# PASS aether-packages/aether-text/tests/tests.ae
# 1 passed, 0 failed
```

The test file has 40+ `assert_eq` cases covering every `pub fn`, including edge cases (empty strings, single words, negative widths, trailing newlines, double separators in case conversions).

### Running the example

```sh
aether run aether-packages/aether-text/examples/example.ae
```

The example exercises every function with a small input, producing a snapshot of expected outputs.

## Design notes

### Why greedy wrap (and not Knuth-Plass)?

Knuth-Plass (the LaTeX-style optimal-width wrap) is O(n²) and needs dynamic programming with badness penalties. Greedy first-fit is O(n) and the algorithm fits in 20 lines of Aether. For prose work where the input is already pre-broken into words, greedy is good enough; if you need Knuth-Plass, that's a separate `aether-text-justify` package.

### Why ASCII-only case conversion?

Same reason as `aether-string`: full Unicode case conversion requires the Unicode Character Database (a ~1MB JSON file), which doesn't belong in a prose-formatting package. ASCII case conversion handles 95% of real usage; the rest goes in `aether-unicode`.

### Why is `snake_case` written with an underscore?

The function `snake_case` produces snake_case strings. Naming the function `snake_case` (not `snakeCase`) makes the function name match its output style. The same convention would suggest `kebab-case` for the kebab converter, but hyphens aren't valid in Aether identifiers, so `kebabCase` is the closest legal spelling.

### Why does `dedent` skip blank lines when computing the common prefix?

A common pattern is:

```
    first line
                  <- blank line, no leading whitespace
    second line
```

If `dedent` counted the blank line, the common prefix would be 0 (because the blank line has 0 leading spaces) and `dedent` would do nothing. Skipping blank lines from the minimum-whitespace computation is the Python `textwrap.dedent` behavior and the only sensible choice for prose.

### Why does `truncate` use `"..."` instead of a configurable ellipsis?

Keeping the API surface small. If you need a configurable ellipsis, the pattern is `slice(s, 0, n) + yourEllipsis`. The fixed `"..."` matches the common case and keeps the function signature two-argument.

### Why expose `charCount` when it's just `len`?

Symmetry with `wordCount`. If you're calling `wordCount(s)`, you'll often want `charCount(s)` right next to it; reaching for the bare `len` builtin in that context is a small but real readability loss. The cost is one extra `pub fn` that's a one-liner; the benefit is a coherent API.

## Implementation patterns

### Pattern 1: char-by-char walk with state

`titleCase`, `camelCase`, `snake_case`, `kebabCase` all use the same skeleton: a `while` loop over `charCode(s, i)`, building the output with `out = out + fromCharCode(...)`, and a `cap_next` or `need_sep` flag for state across iterations.

### Pattern 2: line-by-line transform with `lines`/`unlines`

`indent` and `dedent` both decompose with `lines`, transform each line, and rejoin with `\n`. The pattern is:

```aether
let ls = lines(s);
let mut out = "";
let mut i = 0;
while i < len(ls) {
  let transformed = ...ls[i]...;
  if i == 0 { out = transformed } else { out = out + "\n" + transformed };
  i = i + 1;
}
out
```

### Pattern 3: greedy fill

`wrap` is the canonical greedy-fill algorithm:

```aether
let ws = words(s);
let mut line = ws[0];
let mut i = 1;
while i < len(ws) {
  if len(line) + 1 + len(ws[i]) <= width { line = line + " " + ws[i] }
  else { out = out + "\n" + line; line = ws[i] };
  i = i + 1;
}
out + "\n" + line
```

This is O(n) in the input length, no backtracking, no penalty computation.

## Future work

- **Knuth-Plass wrap.** A `wrapOptimal(s, width)` that minimises the sum of squared trailing-space penalties. Lives in `aether-text-justify`.
- **Unicode case conversion.** Requires the Unicode Character Database; lives in `aether-unicode`.
- **Sentence splitting.** `sentences(s)` that splits on `. ! ?` followed by whitespace, with abbreviations handled. Tricky to get right; probably belongs in `aether-nlp`.
- **Column alignment.** `alignColumns(rows)` that takes a 2D array of strings and pads each column to the max width. Useful for table formatting.

## License

MIT — same as the Aether language.
