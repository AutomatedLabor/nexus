# number_guessing.ae

A "guess the number" simulation: the computer picks a hardcoded
target (42) and we walk through a fixed list of guesses, printing a
hint for each. Then we run a textbook binary search from scratch and
compare.

## What it does

The program has two halves.

**Hardcoded session** — a `for g in guesses` loop walks through
`[50, 25, 37, 43, 41, 42]`, printing each guess and a hint (`"too
high"`, `"too low"`, or `"correct!"`). When the guess matches the
target, the loop calls `break` to stop early. This is a tiny demo of:

- `for v in arr` iteration with a `print` inside the body (printing
  inside the loop is fine — the known v1 scoping quirk is only about
  referencing a `let X` bound BEFORE the loop, AFTER the loop ends;
  nothing here does that).
- `break` for early loop termination.
- string interpolation `f"  guess #{count}: {g}  ->  {hint}"`.
- a small `report_guess(target, guess)` helper returning a hint
  string, used by both halves.

**Optimal binary search** — a `while !done && low <= high` loop
implements the textbook algorithm: track `low` and `high`, probe the
midpoint, narrow the range. The midpoint is computed with
`int((low + high) / 2)` — Aether's `/` is float division, so we
explicitly truncate to int via the inline `int(x)` builtin. We print
each probe along with the current `[low, high]` window and the hint.
The loop ends when `mid == target` (sets `done = true`) or when
`low > high` (the window is empty — shouldn't happen for a target in
range, but the loop guard is defensive).

After running both halves, the program runs a few extra trials for
targets `1, 100, 50, 75, 13, 42, 64, 99` to confirm the binary search
finds every value in `[1, 100]` and reports a sensible probe count
(`1` for `target=50`, `2` for `target=75`, `7` for `target=42` etc.).

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /home/z/my-project/verify_one.ts /home/z/my-project/examples/number_guessing.ae
```

## Key language features

- **`for v in arr`** with `break` for early exit.
- **`while cond && cond`** compound loop conditions (uses `&&`).
- **`let mut` locals** updated inside the loop body (`count`,
  `probes`, `low`, `high`, `done`).
- **`int(x)`** — the inline builtin that truncates a float to int.
  Necessary because Aether's `/` is float division and we need an
  integer midpoint.
- **String interpolation** with `f"..."` for the per-guess and
  per-probe report lines.
- **Tuples in for-in**: `for t in targets { ... }` works directly on
  an array of ints.
- **`assert_eq`** checks: the hardcoded session uses 6 guesses, the
  textbook binary search uses 7 (because int division rounds down —
  see the design notes below).

## Expected output

```
== Number guessing: hardcoded session ==

target = 42

simulated guesses:
  guess #1: 50  ->  too high
  guess #2: 25  ->  too low
  guess #3: 37  ->  too low
  guess #4: 43  ->  too high
  guess #5: 41  ->  too low
  guess #6: 42  ->  correct!
  solved in 6 guesses.
session returned: 6

== Number guessing: optimal binary search ==

target = 42, range = [1, 100]
optimal binary search trace:
  probe #1: [1, 100]  mid=50  ->  too high
  ...
  probe #7: [42, 42]  mid=42  ->  correct!
  solved in 7 probes.
binary_search returned: 7

extra trials:
  target = 1:   -> 6 probes
  target = 100:  -> 7 probes
  ...

All assertions passed.
```

## Design notes

- The hardcoded list `[50, 25, 37, 43, 41, 42]` reflects a slightly
  *better* strategy than textbook binary search: after probing 43
  (too high) the player jumps to 41 instead of mid=40, because the
  player knows the answer must be either 41 or 42 — they pick the
  boundary. The textbook algorithm with integer midpoints takes one
  extra probe. Both find the answer in O(log n).
- **Why `int((low + high) / 2)` and not `(low + high) / 2`**: Aether's
  `/` is float division, so `(38 + 42) / 2 = 40.0`. That happens to
  be a whole number, but `(38 + 43) / 2 = 40.5` would print as
  `mid=40.5` and the comparisons would still work (because the int
  target is compared with `==` and `<`). However, the printed output
  looks wrong, and the loop's narrowing logic (`low = mid + 1` /
  `high = mid - 1`) only makes sense for integer midpoints. Using
  `int()` truncates to an int so the algorithm behaves as expected.
- **Aether's `/` is float division, not integer division** — this is
  documented in the v1 evaluator. Use `int(a / b)` when you want
  truncated integer division, or `a - (a % b)` / `a / b` with the
  understanding that the result is a float.
- The program ends with `assert_eq(n, 6)` and `assert_eq(p, 7)` to
  lock in the probe-count contract.
