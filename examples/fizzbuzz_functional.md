# fizzbuzz_functional.ae

FizzBuzz in functional style: we build a list of `[1..N]` using a
helper, then `map` each number to its FizzBuzz label, then print
the labels as a single comma-separated line. We also use `filter`
to extract just the FizzBuzz entries and the `reduce` builtin to
join results into a string.

## What it does

1. **`iota(n)`** — build the array `[1, 2, ..., n]`. We can't use
   `range(1, n + 1)` directly with `map` because Aether's `range`
   returns a `__range` object (not a plain array), and `map`
   requires an array.
2. **`fizzbuzz(n)`** — classify a single number: `"FizzBuzz"` if
   divisible by both 3 and 5, `"Fizz"` if by 3 only, `"Buzz"` if
   by 5 only, else the number as a string. Uses nested `if/else`
   expressions.
3. **Driver** — `map(iota(n), fn(x) { fizzbuzz(x) })` to label
   every number 1..20. Then `filter` to extract just the multiples
   of 15 in 1..30. Then `filter` to count Fizz/Buzz/FizzBuzz/plain
   entries and assert the counts.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/fizzbuzz_functional.ae
```

## Key language features

- **`map(arr, fn)`** — Aether builtin: applies `fn` to every
  element of `arr`, returning a new array. The callback receives
  `(element, index)`.
- **`filter(arr, fn)`** — Aether builtin: returns a new array
  of elements where `fn(element, index)` is truthy.
- **`reduce(arr, fn, init)`** — Aether builtin: folds `arr` from
  the left, threading an accumulator. We use it to join an array
  of strings with `", "` separators.
- **Lambda syntax `fn(x: int) -> string { ... }`** — inline
  function expressions. The body is a block expression whose
  trailing expression is the return value.
- **`if/else` as expression** — Aether's `if cond { a } else { b }`
  returns `a` or `b` as a value (no `? :` ternary needed).

## Expected output

```
== FizzBuzz (functional) ==

1..20:
  1, 2, Fizz, 4, Buzz, Fizz, 7, 8, Fizz, Buzz, 11, Fizz, 13, 14, FizzBuzz, 16, 17, Fizz, 19, Buzz

 multiples of 15 in 1..30 (FizzBuzz entries): 15, 30

  in 1..20: Fizz=5, Buzz=3, FizzBuzz=1, plain=11

All assertions passed.
```

## Design notes

- The functional style here is about *expressiveness*:
  `map + filter + reduce` makes the data flow obvious. The
  imperative style (a `for` loop with `if` branches) would be
  more efficient (no intermediate arrays) but harder to read.
- Aether's `range` builtin returns a `__range` object so it
  can be used in `for ... in range(...)` loops. To use it with
  `map`/`filter`, we have to materialize it into an array
  first; `iota` does that.
- The `reduce` callback `fn(acc, x) { if acc == "" { lbl } else
  { acc + ", " + lbl } }` is a clean way to join with a
  separator without special-casing the first element.
- Compare to the existing `fizzbuzz.ae` example, which uses an
  imperative `while` loop. Both are correct; this one
  demonstrates the functional style.
