# template_engine.ae

A tiny `{{var}}` template engine. Given a template string with
`{{name}}` placeholders and a map from name to value, render the
template by replacing each placeholder with the corresponding
value. Unknown placeholders are left as-is (or replaced with an
empty string via a flag).

## What it does

1. **`lookup(keys, vals, key)`** — linear search for `key` in the
   parallel arrays `(keys, vals)`. Returns `""` if not found.
2. **`render(template, keys, vals, drop_unknown)`** — single-pass
   scan:
   - At each position, check for `{{`. If found, find the
     matching `}}` and extract the name in between.
   - Look up the name; if found, substitute the value.
   - If not found and `drop_unknown` is true, drop the placeholder
     (output nothing). If `drop_unknown` is false, leave the
     placeholder as-is (`{{name}}`).
   - Advance past the closing `}}`.
   - If no `{{` is found at this position, copy the current
     character and advance.
3. **`trim(s)`** — strip leading/trailing whitespace (so
   `{{ name }}` and `{{name}}` work the same).
4. **`slice(s, lo, hi)`** — slice `s` from `lo` (inclusive) to
   `hi` (exclusive).
5. **Driver** — renders a 3-line template with three known
   placeholders, then a 1-line template with one unknown
   placeholder (with and without `drop_unknown`), then a template
   with extra whitespace inside the braces.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/template_engine.ae
```

## Key language features

- **Parallel-array representation** for the variable map —
  Aether has a `map` literal type, but its behavior differs
  across evaluator versions, so we use the safer
  `(keys: [string], vals: [string])` representation.
- **`str(template[i])`** — extract a single character as a string
  for comparison.
- **`slice(s, lo, hi)`** helper — Aether has no built-in string
  slicing; we implement it by walking the index range and
  concatenating chars.
- **`while i < n`** main loop — sidesteps the for-loop-scope
  quirk.
- **`if/else` with `;`** before another statement — required by
  the parser.

## Expected output

```
== Template engine ==

template:
Hello, {{name}}!
You have {{count}} new messages.
Your last login was on {{date}}.

rendered:
Hello, Alice!
You have 5 new messages.
Your last login was on 2024-01-15.

with unknown placeholder (keep):
Hi Alice, your friend {{friend}} says hi.

with unknown placeholder (drop):
Hi Alice, your friend  says hi.

with extra whitespace inside braces:
x=42; y=hello

All assertions passed.
```

## Design notes

- The `{{ ... }}` syntax is common in template engines
  (Mustache, Handlebars, Jinja2-ish). The closing `}}` lookup is
  linear scan; for very long templates you could pre-tokenize.
- The `drop_unknown` flag controls what happens to undefined
  placeholders. `false` (the default in most engines) leaves them
  as-is, which is useful for debugging — you can see what
  variables you forgot to provide. `true` strips them silently.
- We use `trim` on the extracted name so `{{ name }}` and
  `{{name}}` are equivalent. This is more lenient than some
  engines but matches the typical user expectation.
- The parallel-array map is `O(n)` per lookup, but for small
  variable sets (the typical template use case) this is fine.
  For thousands of variables you'd want a real hash map.
