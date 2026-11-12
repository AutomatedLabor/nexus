# template_render.ae

A tiny `{{var}}` template engine. Given a template string with
`{{name}}` placeholders and a parallel-arrays map (keys, vals),
render the template by replacing each placeholder with the
corresponding value. Unknown placeholders are left as-is (or
replaced with an empty string via the `drop_unknown` flag).

## What it does

1. **`lookup(keys, vals, key)`** — linear search the parallel
   arrays for `key`; return the value or `""`.
2. **`trim(s)`** — strip whitespace around placeholder names
   (so `{{ name }}` works just like `{{name}}`).
3. **`render(template, keys, vals, drop_unknown)`** — scan
   the template; when we hit `{{`, find the closing `}}`,
   look up the name, and substitute.
4. **Driver** — renders a small template with three
   variables, then exercises edge cases (unknown
   placeholder, drop vs keep, whitespace inside braces).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/template_render.ae
```

## Key language features

- **Parallel arrays** as a poor man's hash map — the v1
  evaluator's `compileAndRun` only wires inline builtins, so
  `mapNew`/`mapSet` (from stdlib) are unavailable. Compare to
  `template_engine.ae` (already in the repo) which uses the
  same pattern.
- **`while` loops with `mut i`** for the scan.
- **Nested `if/else`** with `;` before the next statement.

## Edge cases

- **Unknown placeholder** — when `drop_unknown` is false,
  the placeholder is left as `{{name}}`; when true, it's
  removed entirely (leaving a blank in the output).
- **Whitespace inside braces** — `{{ name }}` is trimmed to
  `name` before lookup.
- **No closing `}}`** — the parser copies the `{{` literally
  and continues; this is the "tolerant" interpretation.
- **Empty template / no placeholders** — return as-is.

## Expected output

```
== Template renderer ==

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

- The "parallel arrays" approach is O(n) lookup, fine for
  small template variable sets (a few dozen). For larger
  sets, switch to the stdlib `map` (`mapNew`/`mapGet`) when
  running in a stdlib-wired environment.
- The placeholder syntax `{{ }}` is borrowed from
  Mustache / Handlebars / Jinja2 — the most common choice in
  web frameworks. A real engine would also support
  conditionals, loops, and partials.
- Compare to `template_engine.ae` (already in the repo)
  which is essentially the same program; this version adds
  the whitespace-inside-braces handling.
