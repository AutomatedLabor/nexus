# knapsack.ae

0/1 knapsack via dynamic programming. Given `n` items, each with
a weight `w_i` and a value `v_i`, and a total capacity `W`, find
the maximum total value that fits within the capacity. Each
item may be taken at most once (the "0/1" rule — fractional items
aren't allowed).

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`imax(a, b)`** — binary integer max (avoids the varargs
   builtin `max`).
3. **`knapsack(weights, values, capacity)`** — the 1D DP:
   - Allocate `dp[0..capacity] = 0`.
   - For each item `i` with weight `wi` and value `vi`:
     update `dp[c] = max(dp[c], dp[c - wi] + vi)` from
     `c = capacity` down to `c = wi`. The descending sweep
     is the trick that makes the 1D formulation equivalent
     to the 2D one (each item is used at most once).
4. **`reconstruct(dp, weights, values, capacity)`** —
   recover the chosen items by walking `dp` backward: at each
   item, if `dp[c] == dp[c - w_i] + v_i`, the item was taken
   (decrement `c` and record it).
5. **Driver** — solves the headline case (capacity 5,
   optimal value 7, items 0 and 1) and prints the dp table.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/knapsack.ae
```

## Key language features

- **Indexed array assignment** `dp[c] = imax(dp[c], candidate)`
  on a `let mut dp` array — supported by the v1 evaluator's
  `assignTo` path.
- **`while` loops with a descending counter** for the inner
  reverse-sweep (the key 0/1-vs-unbounded distinction).
- **`reduce`** to render the int array as a pretty string.

## Expected output

```
== 0/1 Knapsack DP ==

weights:  [2, 3, 4, 5]
values:   [3, 4, 5, 6]
capacity: 5

dp table (capacity -> max value):
  cap=0: value=0
  cap=1: value=0
  cap=2: value=3
  cap=3: value=4
  cap=4: value=5
  cap=5: value=7

max value: 7
items taken (0-indexed): [0, 1]

All assertions passed.
```

## Design notes

- The optimal solution takes items 0 (`w=2, v=3`) and 1
  (`w=3, v=4`) for a total weight of 5 and value of 7. The
  other combinations either don't fit (`2+4=6 > 5`,
  `3+4=7 > 5`) or are suboptimal (`v=5` for item 2 alone).
- The descending inner sweep (`c = capacity down to wi`)
  ensures each item is considered exactly once: if we
  swept ascending, the same item could be added multiple
  times (which is the unbounded knapsack variant).
- The reconstruction walks items in reverse and tracks the
  remaining capacity. The `dp[c] == dp[c - w_i] + v_i`
  check is the "did we take this item?" predicate; we
  decrement `c` only when we did take it.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
