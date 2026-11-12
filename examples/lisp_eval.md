# lisp_eval.ae

A tiny Lisp evaluator. Supports:

- **Int literals**: `42`, `-7`
- **Symbols**: `+`, `-`, `*`, `=`, `<`, `>`, `if`, `quote`,
  `list`, `head`, `tail`
- **Lists**: `(a b c)` — represented as Aether arrays
- **Special forms**: `(if cond then else)`, `(quote x)`,
  `(list a b c)`

Examples:

```
(eval (+ 1 2))              -> 3
(eval (* (+ 1 2) 4))        -> 12
(eval (if (= 1 1) 42 0))    -> 42
(eval (head (list 1 2 3)))  -> 1
(eval (tail (list 1 2 3)))  -> [2, 3]
```

The interpreter is a single `eval` function with a tag
switch on the head symbol. No environment, no user-defined
functions — just the built-in arithmetic and list
operations.

## What it does

1. **`apply_arith(op, args)`** — dispatch on the operator
   string and apply it to the (already-evaluated) arguments.
2. **`eval_int(e)`** — evaluate and assert the result is an
   int (used by arithmetic operators).
3. **`eval(e)`** — the evaluator. If `e` is an int, return
   it. If `e` is a list, dispatch on the head symbol —
   `quote`, `if`, `list`, `head`, `tail`, `=`, `<`, `>`,
   or fall through to arithmetic.
4. **`render(v)`** — render a Lisp value as a string (for
   printing).
5. **Driver** — evaluates a list of test cases and prints
   each result.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/lisp_eval.ae
```

## Key language features

- **Tagged-union values**: ints are `int`; lists are `array`.
  The `type_of` builtin dispatches on the runtime kind.
- **Recursion** in `eval` — the `(if cond then else)` and
   arithmetic cases both recurse on their arguments.
- **`panic`** for type errors (e.g. evaluating an empty list).
- **`while` loops** for the variadic arithmetic operators
   (`+`, `-`, `*` accept any number of args).

## Lisp-as-data

Lisp's "code is data" property is on full display here: every
test case is an Aether array literal that represents a Lisp
expression. `["+", 1, 2]` is both a piece of data (an array
of three elements) and a piece of code (the application of
`+` to `1` and `2`). The evaluator just walks the array.

## Expected output (truncated)

```
== Tiny Lisp evaluator ==

eval([+, 1, 2]) = 3
eval([*, [+, 1, 2], 4]) = 12
eval([-, 10, 3]) = 7
eval([-, 5]) = -5
eval([if, [=, 1, 1], 42, 0]) = 42
eval([if, [=, 1, 2], 42, 0]) = 0
eval([head, [list, 1, 2, 3]]) = 1
eval([tail, [list, 1, 2, 3]]) = [2, 3]
...
All assertions passed.
```

## Design notes

- No environment means no user-defined functions — every
  symbol is built-in. Extending to user definitions would
  require adding an environment (e.g. a parallel-arrays map
  of name → closure), making `eval` recursive over the
  environment.
- The `(if cond then else)` is a "special form" because it
  must NOT evaluate its arguments eagerly — only the
  chosen branch is evaluated. The arithmetic operators are
  "applicative order" — they evaluate all arguments first.
- Compare to `expression_eval.ae` (already in the repo)
  which evaluates arithmetic expressions in a non-Lisp
  syntax (infix).
