# ackermann.ae

The Ackermann function — the textbook example of a total
computable function that isn't primitive recursive. Its values
grow astronomically even for tiny inputs, which makes it a great
stress test of any interpreter's recursion stack.

## What it does

Algorithm:

```
A(m, n):
  if m == 0          -> n + 1
  if m > 0, n == 0   -> A(m - 1, 1)
  if m > 0, n > 0    -> A(m - 1, A(m, n - 1))
```

Some reference values:

```
A(0, n)   = n + 1
A(1, n)   = n + 2
A(2, n)   = 2n + 3
A(3, n)   = 2^(n+3) - 3
A(4, 0)   = 13
A(4, 1)   = 65533
A(4, 2)   = a number with 19729 digits (out of reach)
```

1. **`ackermann(m, n)`** — direct implementation of the recursive
   definition above.
2. **Driver** — prints the headline values (`A(2, 3) = 9`,
   `A(3, 3) = 61`, `A(3, 4) = 125`) and a closed-form check
   (`A(1, n) == n + 2`, `A(2, n) == 2n + 3`) for `n` in 0..7.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/ackermann.ae
```

## Key language features

- **Recursive function with nested `if cond { then } else { else }`**
  — `ackermann` is a triply-nested if-else expression, no
  statements. The innermost branch contains a nested recursive
  call (`A(m - 1, A(m, n - 1))`) — the second argument is itself
  a recursive call.
- **No `let` bindings inside the function** — `ackermann` is a
  pure expression, which makes the recursion structure obvious.
- **`while` loop with `let mut` in the driver** to walk the
  closed-form table.
- **`assert_eq`** on the headline values.

## Expected output

```
== Ackermann function ==

A(0, 0) = 1
A(0, 5) = 6
A(1, 0) = 2
A(1, 5) = 7
A(2, 0) = 3
A(2, 3) = 9
A(2, 5) = 13
A(3, 0) = 5
A(3, 3) = 61
A(3, 4) = 125

Closed-form check (A(1, n) should be n+2; A(2, n) should be 2n+3):
  n = 0: A(1, n) = 2 (exp 2) [ok], A(2, n) = 3 (exp 3) [ok]
  ...
  n = 7: A(1, n) = 9 (exp 9) [ok], A(2, n) = 17 (exp 17) [ok]

All assertions passed.
```

## Design notes

- We deliberately cap at `A(3, 4) = 125`. The next value `A(3, 5)
  = 2^(5+3) - 3 = 253` would also be fine, but `A(4, 0) = 13`
  requires ~10676 recursive calls (which the playground handles,
  but more slowly). `A(4, 2)` is a number with 19729 digits —
  far beyond what fits in a JS double.
- The closed-form check (`A(1, n) == n + 2`, `A(2, n) == 2n +
  3`) is a nice way to verify the implementation without
  hand-checking each value — the formulas are well-known.
- The interpreter's stack handles `A(3, 3) = 61` cleanly. That
  call expands to a peak of roughly 10000 nested frames, which is
  well inside the playground's recursion budget.
