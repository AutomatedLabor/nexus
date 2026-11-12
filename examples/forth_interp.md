# forth_interp.ae

A tiny Forth interpreter. Forth is a stack-based language:
every operation either pushes a value onto the stack or pops
some values and pushes a result.

## Supported

- **Int literals** (pushed onto the stack)
- `+`, `-`, `*` — binary arithmetic (pop two, push result)
- `dup`, `drop`, `swap` — stack manipulation
- `.` — print top of stack and pop
- `emit` — print top of stack as a char and pop
- `;` — no-op separator (just visual)

Programs are space-separated token strings. Example:

```
"1 2 + ."        -> prints "3"
"3 4 * 5 + ."    -> prints "17"
"10 dup * ."     -> prints "100"  (square)
"65 emit"        -> prints "A"
```

## What it does

1. **`tokenize(s)`** — split a Forth source string into a
   list of tokens (split on whitespace runs).
2. **`is_int_tok(t)`** — return true if `t` is an integer
   literal (optional `-` sign followed by digits).
3. **`parse_int_tok(t)`** — convert an int literal token to
   an int.
4. **`run_forth(src)`** — the main loop: scan tokens, push
   ints, dispatch on operator symbols, mutate the stack
   in place. Returns `[stack, out]` (final stack + output
   string).
5. **Driver** — runs several demo programs and prints
   each one's output and final stack.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/forth_interp.ae
```

## Key language features

- **`push` / `pop`** to manipulate the stack — Aether's
   inline builtins; `pop` returns `undefined` on an empty
   stack but our programs never pop empty.
- **`fromCharCode(n)`** to render an ASCII code as a char
   for the `emit` operator.
- **`while` loops** for tokenization and the main
   interpreter loop.
- **Nested `if/else`** for the operator dispatch — Aether
   doesn't have a `match` or `switch` statement, so we use
   chained `if/else`.

## Why Forth?

Forth is the simplest non-trivial programming language to
implement: a stack, a token stream, and a dispatch table.
It was designed for embedded systems in the 1970s (Chuck
Moore's work at NRAO) — small memory, no OS, real-time
constraints. The "compile to threaded code" model maps
naturally to the stack-based interpreter pattern shown
here.

## Expected output (truncated)

```
== Tiny Forth interpreter ==

program: 1 2 + .
  output: 3
  final stack: []

program: 3 4 * 5 + .
  output: 17
  final stack: []

program: 10 dup * .
  output: 100
  final stack: []

program: 65 emit
  output: A
  final stack: []

program: 1 2 swap . .
  output: 1 2
  final stack: []

...
All assertions passed.
```

## Design notes

- No definitions (`: NAME ... ;` in real Forth) — every
  operator is built-in. Extending to user definitions
  would require a "word table" (parallel arrays of name
  → token list) and a recursion in `run_forth` to execute
  the definition's tokens.
- No control flow (`if ... then`, `do ... loop` in real
  Forth) — those are more complex because they require
  skipping forward / backward in the token stream.
- Compare to `lisp_eval.ae` (already in the repo) which
  implements a different minimal language (Lisp) using
  the same "tree-walk interpreter" pattern but with a
  different data model.
