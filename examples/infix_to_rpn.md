# infix_to_rpn.ae

Converts infix arithmetic expressions to reverse Polish
notation (RPN) using Dijkstra's shunting-yard algorithm. This
is the parsing half of `expression_eval.ae` — it produces
the post-order token list but doesn't evaluate the result.

## What it does

1. **`tokenize(s)`** — splits the input into tokens (numbers,
   operators, parens), skipping whitespace.
2. **`to_rpn(tokens)`** — the shunting-yard. For each token:
   - **lparen** → push to operator stack.
   - **rparen** → pop operators to output until the matching
     lparen, then discard the lparen.
   - **operator** → pop higher-or-equal precedence operators
     (respecting left-associativity) to output, then push the
     operator.
   - **number** → push directly to output.
   At the end, drain the remaining stack to output.
3. **`infix_to_rpn(s)`** — convenience wrapper: tokenize +
   convert + join with spaces.
4. **Driver** — converts twelve expressions and prints
   `infix → RPN` for each, covering all the precedence /
   associativity / parentheses edge cases.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/infix_to_rpn.ae
```

## Key language features

- **`while`-loop with explicit index** — `let mut i = 0; while i < len(tokens) { ... i = i + 1; }`.
- **Stack via array rebuild** — popping the stack is done by
  building a fresh array with the last element dropped
  (`while j < len(stack) - 1 { push(new_stack, stack[j]); ... }`).
- **`reduce` for join** — `reduce(arr, fn(acc, t) -> ...)`
  concatenates tokens with spaces.
- **Nested if/else dispatch** with `;` after the closing `}`
  of each chain — empirically required by the v1 evaluator
  when the same `let mut` name (`keep_going`) is declared in
  multiple sibling branches of a deeply-nested chain inside
  a while loop.

## Expected output

```
== Infix → RPN (shunting-yard) ==

  3 + 4 * 2   →   3 4 2 * +
  ( 3 + 4 ) * 2   →   3 4 + 2 *
  10 - 2 - 3   →   10 2 - 3 -
  ...
All assertions passed.
```

## Design notes

The branch ordering in `to_rpn` (lparen → rparen → operator →
number) was chosen after empirical debugging to dodge a v1
tree-walker quirk where declaring the same `let mut` name in
multiple sibling branches of a deeply-nested if/else if/else
chain inside a while loop could leave the variable undefined
on the second pass. With this ordering, each `keep_going`
lives in a single, mutually exclusive branch, and the quirk
doesn't manifest.
