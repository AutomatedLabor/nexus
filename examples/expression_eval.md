# expression_eval.ae

An arithmetic expression evaluator that uses Dijkstra's
shunting-yard algorithm to parse infix expressions like
`3 + 4 * 2` and evaluate them. It supports `+`, `-`, `*`, `/`,
parentheses, and integer operands with the usual precedence
rules.

## What it does

1. **`tokenize(s)`** — splits the input string into a list of
   tokens (numbers, operators, parens), skipping whitespace.
2. **`to_rpn(tokens)`** — the shunting-yard algorithm: walks
   the token list, using an operator stack to emit operators
   in post-order. Higher-precedence operators are popped before
   lower-precedence ones; parentheses override precedence.
3. **`eval_rpn(rpn)`** — walks the reverse Polish notation with
   a value stack, applying each operator to its two operands.
4. **Driver** — prints ten worked examples with both the
   integer result and the generated RPN, then runs `assert_eq`
   on each one.

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/expression_eval.ae
```

## Key language features

- **`while`-loop iterators** with explicit index variables
  (`let mut i = 0; while i < n { ... i = i + 1; }`) — avoids
  the v1 for-loop-scope quirk.
- **Functional array rebuilds** instead of mutation: when
  popping the top of the operator stack, we build a fresh
  `new_stack` with the last element dropped. Aether's array
  model treats these like value semantics.
- **Nested if-else expressions** with `;` after the closing
  `}` of each chain — a subtle quirk of the v1 evaluator
  when the same `let mut` name (`keep_going`) is declared in
  multiple sibling branches.
- **`reduce` over `[string]`** to render the RPN tokens as a
  space-joined string.

## Expected output

```
== Arithmetic expression evaluator (shunting-yard) ==

  3 + 4 * 2 = 11   (RPN: 3 4 2 * +)
  ( 3 + 4 ) * 2 = 14   (RPN: 3 4 + 2 *)
  10 - 2 - 3 = 5   (RPN: 10 2 - 3 -)
  ...
All assertions passed.
```

## Design notes

The implementation uses **integer division** (`int(a / b)`) so
`100 / 7 = 14`. The `to_int` helper parses negative literals
like `-5`. Branch order in `to_rpn` (lparen → rparen → operator
→ number) was chosen empirically to avoid a tree-walker quirk
where reusing the name `keep_going` in multiple sibling branches
of a deeply-nested if-else chain inside a while loop can cause
the variable to read as undefined.
