# fizzbuzz.ae

The classic FizzBuzz interview question, written in Aether.

## What it does

For each integer `i` from 1 to 100, the program prints:

- `"FizzBuzz"` if `i` is divisible by both 3 and 5,
- `"Fizz"` if `i` is divisible by 3 only,
- `"Buzz"` if `i` is divisible by 5 only,
- the number itself (`f"{i}"`) otherwise.

The order of checks matters: the `3 && 5` test is evaluated first so that
multiples of 15 print `FizzBuzz` rather than just `Fizz` or `Buzz`.

## How to run

```bash
bun /tmp/verify_examples.ts   # verifies all 12 examples at once
```

## Key language features

- `for i in range(1, 101, 1)` — the 3-argument `range(start, end, step)` form.
  Aether's `range` returns a `__range` value; the `for in` loop materializes
  it lazily into items `[1, 2, …, 100]`.
- Boolean short-circuit operators `&&` and `||`.
- `let by3 = i % 3 == 0` — modulo and equality in one expression.
- Nested `if / else if / else` written as a chain of `else { if … }` blocks
  (Aether does not have `else if` as a single keyword, so we use `else { if … }`).
- Each `if cond { print(...) } else { ... }` block is followed by a `;`
  because it is a non-trailing expression statement inside the `for` body.
- `f"{i}"` — string interpolation. The body of the `{...}` is an Aether
  expression; here it's just the loop variable, but it could be any expr.

## Expected output (excerpt)

```
1
2
Fizz
4
Buzz
Fizz
7
8
Fizz
Buzz
11
Fizz
13
14
FizzBuzz
16
...
97
98
Fizz
Buzz
```

(100 lines total;FizzBuzz appears at 15, 30, 45, 60, 75, 90.)

## Design notes

- The `if` chain is written with explicit nested `else { if … }` rather than
  `else if`. Aether's grammar treats `if` as an expression and accepts
  `else if <cond> { … }` directly, but nesting is clearer for teaching
  the language's block rules.
- Each top-level `if/else` statement inside the `for` loop ends with `;`
  because Aether requires non-trailing block expressions inside a block to
  be terminated by `;` (an `if` that produces a value but is followed by
  more statements needs the separator).
- The boolean tests `by3` and `by5` are precomputed and reused, which
  keeps the conditional chain clean and avoids redundant modulo work.
