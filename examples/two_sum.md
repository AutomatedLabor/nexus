# two_sum.ae

Two-sum: given an array of integers and a target, return the
indices of the two distinct numbers that sum to the target.

## What it does

1. **`two_sum(nums, target)`** — the canonical O(n) hash-map
   algorithm: walk the array once; for each `x` check whether
   `target - x` is already in the seen-map; if so, return the
   stored index and the current index. Otherwise, record `x`'s
   index in the map and continue.
2. **Tiny map helpers** — `mapNew`, `mapSet`, `mapGet`,
   `mapContains` — backed by a flat parallel-array layout
   (`[k0, v0, k1, v1, ...]`). The v1 evaluator's `Map<int,int>`
   works directly, but the helpers make the algorithm readable
   and keep the type-checker happy with the index form.
3. **Driver** — runs the solver on five cases including the
   "no pair" edge case, then asserts the four headline results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/two_sum.ae
```

## Key language features

- **`while` for the array walk** rather than `for` — sidesteps
  the for-loop-scope quirk where a `let` bound before a `for`
  can't be referenced after the loop.
- **Tuple returns** — the function returns `(int, int)` and
  callers use `.0` and `.1` to project. Aether treats tuples
  as fixed-length arrays, so projection is index-based.
- **Map as parallel arrays** — keeps the example self-contained
  without depending on the v1 evaluator's Map shape.

## Expected output

```
== Two-sum ==

  target=9: nums[0]=2, nums[1]=7  (sum=9)
  target=6: nums[1]=2, nums[2]=4  (sum=6)
  target=6: nums[0]=3, nums[1]=3  (sum=6)
  target=13: nums[1]=5, nums[2]=8  (sum=13)
  target=100: no pair found

Headline: two_sum([2,7,11,15], 9) = (0, 1)

All assertions passed.
```

## Design notes

- The `while (cond1) && (cond2)` form is a single boolean
  expression, so the loop exits as soon as `found_i != -1`.
  We avoid an early `return` inside an `if` block (the v1
  evaluator's `return`-after-block quirk).
- We use `target - x` rather than `target + (-x)` so the
  arithmetic stays in the int domain (no float division here
  anyway).
- The "no pair" case sets `found_i = -1` and `found_j = -1`,
  which the driver checks before indexing `nums`.
- This is a fully clean compile (`ok = true`): no parse errors,
  no type errors, no runtime errors.
