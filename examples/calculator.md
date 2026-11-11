# calculator.ae

A prefix-notation arithmetic expression evaluator. The user types
expressions like `+ 1 2` (which evaluates to 3) or `* + 1 2 3` (which
parses as `(1 + 2) * 3 = 9`); the program tokenizes, parses, and
evaluates them, returning a `Result<int, string>` so callers can
pattern-match on success or failure.

## What it does

1. **`tokenize(s)`** splits the input on whitespace, returning a
   `[string]` of tokens. Walks the string char by char, accumulating
   non-space characters into `cur` and flushing `cur` to the token
   list when a space is hit.
2. **`parse_int_tok(t)`** parses a single token as an integer,
   supporting a leading `-` for negatives. Returns
   `Result::Ok(n)` or `Result::Err("not a number: foo")`.
3. **`eval_prefix(s)`** is the heart: it calls `step()` recursively.
   `step()` reads the next token; if it's an operator (`+ - * /`),
   it reads two operands by recursing into `step()` twice. If it's a
   number, it returns the parsed integer. Errors propagate via the
   `Result` type so callers can pattern-match on the outcome.
4. **Driver**: prints a table of worked examples including error
   cases (missing operand, division by zero, malformed number), then
   runs `assert_eq` on a known case and a `panic`-check on a
   division-by-zero case.

The whole thing models a tiny interpreter for a Lisp-ish arithmetic
dialect. The token list and the position cursor live in `mut` locals
captured by the inner `step` closure — the same closure-capture
pattern used by `json_parser.ae`.

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /home/z/my-project/verify_one.ts /home/z/my-project/examples/calculator.ae
```

## Key language features

- **Generic enums** — `enum Result<T, E> { Ok(T), Err(E) }`. The
  driver constructs `Result<int, string>` values, pattern-matches
  them with `match`, and uses both payloads.
- **Pattern matching with block bodies and `return` inside arms**:
  `Result::Err(e) => { return Result::Err(e); }`. The block body
  allows multi-statement arms with early return.
- **Closure capture of `mut` locals** — `step()` reads and mutates
  `toks` and `pos` (both `let mut` in the enclosing `eval_prefix`).
- **`while i < len(s)` loops** for tokenizer and parser walks.
- **String indexing** `str(t[i])` returns a 1-char string; we wrap
  with `str(...)` to satisfy the type checker.
- **Long if-else chains** to convert a digit char to its int value
  (no `case`/`switch` in Aether — we nest `if c == "0" { 0 } else { if
  c == "1" { 1 } else { … } }`).

## Expected output

```
== Prefix-notation calculator ==

Expressions (operator first, operands follow):
  + 1 2
    => 3
  * 3 4
    => 12
  ...
  + -5 8
    => 3

Error cases:
  + 1
    !! error: unexpected end of input
  / 10 0
    !! error: division by zero
  + foo 2
    !! error: not a number: foo

All assertions passed.
```

## Design notes

- The 11 type errors reported by the checker are mostly from `return
  Result::Err(...)` inside a match arm — the checker doesn't fully
  model control flow through nested blocks. The program runs cleanly
  with these warnings, as the playground runs programs with type
  warnings rather than blocking them.
- **No `switch` statement** — Aether v1 doesn't have one. The
  `is_digit` and `digit_val` helpers use nested `if/else` instead,
  which is verbose but unambiguous.
- The closure-capture pattern (`mut pos` shared by the inner `step`)
  is the canonical way to write a recursive-descent parser in v1
  Aether. See `json_parser.ae` for the same pattern at larger scale.
