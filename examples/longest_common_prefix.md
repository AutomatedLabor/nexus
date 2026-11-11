# longest_common_prefix.ae

Longest common prefix of a list of strings: the longest string
`p` such that every input string starts with `p`. If the input
list is empty, the prefix is the empty string.

## What it does

1. **`starts_with(s, prefix)`** — return `1` if `s` begins
   with `prefix`, `0` otherwise. We compare char-by-char
   since Aether v1 has no `startswith` builtin. We use an
   if/else expression (rather than early-`return false`)
   to avoid the `return`-after-block quirk.
2. **`lcp(arr)`** — the algorithm:
   - Start with the first string as the candidate prefix.
   - For each subsequent string, truncate the candidate from
     the right as long as the next string doesn't begin with
     it. Stop early if the candidate becomes empty.
3. **Driver** — runs `lcp` on a set of samples, printing the
   array and the resulting prefix.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/longest_common_prefix.ae
```

## Key language features

- **`starts_with` written as an if/else expression** to
  avoid the early-`return` after a block quirk. (Early
  returns inside `if` blocks sometimes fail in the v1
  evaluator; the expression form is safe.)
- **`while` loops** for both the outer array walk and the
  inner truncation loop — sidesteps the for-loop-scope
  quirk.
- **`reduce` to render the input array as `["a", "b", "c"]`**
  for the output formatting.

## Expected output

```
== Longest common prefix ==

  ["flower", "flow", "flight"]  ->  "fl"
  ["abc", "abc", "abc"]  ->  "abc"
  ["dog", "cat", "fish"]  ->  ""
  ["interspecies", "interstellar", "interstate"]  ->  "inters"
  ["a"]  ->  "a"
  ["", "abc"]  ->  ""
  ["abc", ""]  ->  ""
  ["prefix", "pref", "pre", "pr"]  ->  "pr"

Headline: lcp(...) = "fl"

All assertions passed.
```

## Design notes

- The "truncate candidate from the right as long as the
  next string doesn't begin with it" is the canonical LCP
  algorithm — `O(total input length)` in the worst case.
- The empty-string edge cases: `lcp(["", "abc"]) = ""`
  (the candidate starts as `""` and the outer loop exits
  immediately), and `lcp(["abc", ""]) = ""` (the candidate
  starts as `"abc"`, then truncates all the way to `""`
  because `starts_with("", "abc")` is false).
- We avoid embedding string literals with escaped quotes
  inside f-strings (the f-string lexer can get confused by
  the `\"` sequences inside `{...}` interpolations). The
  headline print just uses `lcp(...)` as text.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
