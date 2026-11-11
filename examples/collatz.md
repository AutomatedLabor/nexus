# collatz.ae

Generates the Collatz conjecture sequence for `N = 27` (a famously
long trajectory: 112 steps, peaking at 9232), prints every step plus
the length, and runs sanity assertions on a handful of small cases.

## What it does

The Collatz function is:

```
f(n) = n / 2          if n is even
f(n) = 3 * n + 1      if n is odd
```

The conjecture: starting from any positive integer, repeatedly
applying `f` eventually reaches `1`. For `N = 27` the trajectory
visits 112 numbers (including the starting 27 and the ending 1).

1. **`collatz_seq(n)`** — builds the sequence as an int array using
   a `while` loop and `push`. Loop exits when `cur == 1`, then
   pushes the final `1`. The `while` loop (rather than recursion)
   avoids burning 112 stack frames and avoids the for-loop-scope
   quirk where pre-loop `let` bindings go undefined when referenced
   after the loop.
2. **`join_ints(arr)`** — renders an int array as a comma-separated
   string via `reduce`. This is the canonical pattern for building
   a string out of an array while avoiding the for-loop-scope quirk.
3. **Driver** — prints the full sequence, length, peak value (via
   `reduce` with `max`), and a small table of additional cases.
   Finishes with `assert_eq` checks on lengths and contents.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/collatz.ae
```

## Key language features

- **`while` loop** with a `mut` accumulator (`cur`, `out`).
- **`push` builtin** to append to an int array.
- **`reduce` with a `max`-style callback** to find the peak.
- **`% 2` integer modulo** to test even/odd (the same modulo that
  worked in `gcd_lcm.ae`).
- **`assert_eq`** on full array contents (the evaluator does deep
  array equality).

## Expected output

```
== Collatz conjecture ==

Collatz sequence starting at 27:
  27, 82, 41, 124, 62, 31, 94, 47, ... 8, 4, 2, 1
length: 112

peak value reached: 9232

Sequence lengths for small n:
  n = 1: length = 1, sequence = [1]
  n = 2: length = 2, sequence = [2, 1]
  ...
All assertions passed.
```

## Design notes

- The `while` loop is the right tool here: it's a stateful walk
  with a single mutable cursor and a dynamic termination condition
  (`cur != 1`). Recursion would also work but offer no readability
  advantage.
- The `peak` is computed by `reduce` with an explicit max callback
  rather than the builtin `max` — we want to walk the array, not
  take the max of two numbers, so a reduce is the natural shape.
- We deliberately pick `N = 27` because it's the smallest starting
  value that produces a long, well-known trajectory (length 112,
  peak 9232), which makes the output interesting without being too
  verbose to read.
