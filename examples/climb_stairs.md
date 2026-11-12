# climb_stairs.ae

Count the distinct ways to climb a staircase of n steps, taking
1 or 2 steps at a time. This is the Fibonacci recurrence in
disguise: `f(n) = f(n-1) + f(n-2)`, `f(0) = f(1) = 1`.

## What it does

1. **`climb_rec(n)`** — naive recursion. Exponential time; only
   used for small n (≤25).
2. **`climb_iter(n)`** — iterative two-variable accumulator.
   O(n) time, O(1) space. The production answer.
3. **`climb_memo(n)` + `build_memo(n)`** — bottom-up memoized
   DP that builds the full table up to n. The table builder
   `build_memo` has a `[int]` return type annotation so the
   type-checker infers the array element type from the literal
   `[]` initializer correctly.
4. **Driver** — runs all three on n ∈ {1, 2, 3, 4, 5, 10, 20}
   and asserts agreement among them.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/climb_stairs.ae
```

## Key language features

- **`while i <= n`** — sidesteps the for-loop-scope quirk.
- **Two-variable accumulator** for the iterative version: the
  classic Fibonacci "rolling pair" pattern, with `let next = a + b`
  to avoid a temp-swap bug.
- **Array builder function `build_memo(n) -> [int]`** — the
  `-> [int]` return type lets the type-checker unify the empty
  array literal `[]` with `[int]`, avoiding the "expected [int],
  found [E9]" warning that plain `let mut memo: [int] = []` would
  trigger in the v1 evaluator.

## Expected output

```
== Climbing stairs ==

  n=1  ->  iter=1, memo=1
  n=2  ->  iter=2, memo=2
  n=3  ->  iter=3, memo=3
  n=4  ->  iter=5, memo=5
  n=5  ->  iter=8, memo=8
  n=10  ->  iter=89, memo=89
  n=20  ->  iter=10946, memo=10946

Headline: climb_stairs(5) = 8

All assertions passed.
```

## Design notes

- The recursive version is included for pedagogical parity with
  the canonical `fib` example. For n=25 it would take ~242785
  calls; we don't go above 20 to keep the runtime snappy.
- `f(20) = 10946` matches the standard Fibonacci sequence
  (with our shift by one — `climb(5) = fib(6) = 8`).
- This is one of the workhorses for JIT benchmarking: the
  recursive version benefits enormously from inlining and the
  iterative version is the gold-standard "JIT should match
  hand-written JS" target.
- Fully clean compile (`ok = true`).
