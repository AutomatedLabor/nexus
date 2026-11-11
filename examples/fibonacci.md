# fibonacci.ae

A small Aether program that computes Fibonacci numbers three different ways
and prints a side-by-side comparison for `n = 15, 20, 30`.

## What it does

The program defines three implementations of the Fibonacci function:

1. **`fib_rec`** — the classic naive recursion `fib(n-1) + fib(n-2)`. Clean and
   declarative, but exponential time complexity (`O(2^n)`).
2. **`fib_iter`** — a rolling two-variable loop, `O(n)` time and `O(1)` space.
   Demonstrates `let mut` plus a `while` loop.
3. **`fib_memo`** — top-down recursion with an array cache. The cache is a
   closure-captured `mut` array; the inner `helper` looks up `k` in the cache
   before recursing and writes the result back with `push`.

After printing a small table header, the driver iterates over `ns = [15, 20, 30]`
and prints a row for each `n` showing the three results side by side. For
`n = 30` the naive recursion is skipped (it would make ~2.7M recursive calls,
well over the playground's 1M step budget); the row reports `skip (O(2^n))`
instead. Finally it asserts all implementations agree where computed.

## How to run

```bash
bun /tmp/verify_examples.ts   # verifies all 12 examples
# or run just this one:
#   ts snippet that calls compileAndRun on fibonacci.ae
```

## Key language features

- Recursive functions with `if`-expression-as-value bodies.
- `let mut` for mutable variables; immutable `let` for intermediate bindings.
- `while` loops with `<=` comparisons.
- Closure capturing a mutable outer array (`helper` mutates `cache`).
- The `push` builtin for appending to arrays.
- `len(array)` and array indexing.
- `for x in array` iteration over an array of ints.
- String interpolation `f"{n}  |  {a}  ..."`.
- Final `if ok { ... } else { ... }` expression as a statement block.

## Expected output

```
== Fibonacci implementations ==

  n  |  recursive  |  iterative  |  memoized
-----+-------------+-------------+-------------
  15  |  610        |  610        |  610
  20  |  6765        |  6765        |  6765
  30  |  skip (O(2^n))        |  832040        |  832040

== Sanity check: iter == memo for all n, rec == iter for n <= 20 ==
ALL OK — all implementations agree where computed.
```

## Design notes

- The three implementations are written in **increasing efficiency** so the
  reader can compare them directly. The memoized version reuses the closure-
  captured cache across calls — note that calling `fib_memo(30)` first will
  precompute every value up to 30, but in this program each call starts fresh
  because the cache is created inside `fib_memo` itself.
- We chose an **array cache** instead of a `Map` because integer keys map
  naturally to array indices and the inline `len`/index builtins are simplest.
- `if n < 2 { n } else { ... }` is used as a **value expression** — Aether's
  `if` is an expression, not a statement.
