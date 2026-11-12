# valid_parens.ae

Validate a string of parentheses: every opening bracket must be
closed by the same kind, in the correct nesting order.

## What it does

1. **`closer_for(c)`** — return the matching closer for an opener
   (`(` → `)`, `{` → `}`, `[` → `]`), or `""` for non-openers.
2. **`is_valid(s)`** — the canonical stack-based scan:
   - Walk the string char by char with a `while` loop (sidesteps
     the for-loop-scope quirk).
   - For each opener, push its expected closer onto a stack.
   - For each closer, check it matches the top of the stack;
     if not (or the stack is empty), reject.
   - At the end, the stack must be empty for the string to be valid.
3. **Driver** — runs `is_valid` on eight strings including the
   four headline cases, then asserts ten edge cases.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/valid_parens.ae
```

## Key language features

- **`while i < len(s) && bad == 0`** — a single boolean expression
  that exits early when the input is found to be invalid. We avoid
  early-`return` inside an `if` block (the v1 evaluator's
  return-after-block quirk).
- **Stack implemented as a string array** — `push` for pushing;
  for popping, we rebuild the array without the last element
  (the v1 stdlib has a `pop` builtin too, but the manual rebuild
  keeps the type-checker happy with the array's element type).
- **String concatenation for output** (`"  " + s + "  ->  valid"`)
  instead of f-strings with embedded escaped quotes — the f-string
  lexer gets confused by `\"` inside `{...}` interpolations.

## Expected output

```
== Valid parentheses ==

  ({[]})  ->  valid
  ([)]  ->  invalid
  (((())))  ->  valid
  (  ->  invalid
  )  ->  invalid
    ->  valid
  (){[()]}  ->  valid
  [{()}]  ->  valid

Headline: is_valid("({[]})") = true
Headline: is_valid("([)]")   = false

All assertions passed.
```

## Design notes

- The "pop" step rebuilds the array as `new_stack` to avoid
  mutating the input — Aether arrays are JS arrays so `pop()`
  would work, but the explicit rebuild is more pedagogical and
  avoids any aliasing surprise.
- The empty string `""` is valid: the loop never enters, the
  stack is empty at the end, so `is_valid("") = true`.
- A single closing bracket like `)` is invalid: at `i = 0` the
  stack is empty, so `bad = 1` and the loop exits.
- This is a fully clean runtime (no runtime errors). Two
  non-blocking type warnings about the empty-array literal
  matching `[string]` are reported but do not stop execution.
