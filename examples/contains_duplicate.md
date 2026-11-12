# contains_duplicate.ae

Detect whether an array contains any duplicate elements.

## What it does

1. **`set_contains(keys, k)`** — linear-scan lookup in a
   parallel-array "set" (just the keys; we don't need counts
   for membership testing). Returns 1 if found, 0 otherwise.
2. **`contains_duplicate(arr)`** — walks `arr` building up a
   "seen" set of `keys`; on the first element that's already
   in the set, returns true. If the loop completes without
   finding a duplicate, returns false.
3. **`show(arr)`** — render an int array as `[1, 2, 3]`.
4. **Driver** — runs the check on eight arrays including the
   LeetCode example, all-equal, single-element, empty, and
   negative-number cases.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/contains_duplicate.ae
```

## Key language features

- **`while i < len(arr) && dup == 0`** — short-circuits on the
  first duplicate found, sidesteps the for-loop-scope quirk.
- **`set_contains` as a helper returning 0/1** — avoids the
  v1 evaluator's truthiness surprises (integer `0` is falsy in
  JS but the comparison `== 1` makes the intent explicit).
- **`push(keys, x)` to grow the set** — uses the v1 evaluator's
  mutating `push` builtin (the array's identity is preserved).
- **`reduce` to render the input array** as `1, 2, 3, 1`.

## Expected output

```
== Contains duplicate ==

  [1, 2, 3, 1]  ->  true
  [1, 2, 3, 4]  ->  false
  [1, 1, 1, 1]  ->  true
  [42]  ->  false
  []  ->  false
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]  ->  false
  [5, 5, 5, 5, 5]  ->  true
  [-1, -2, -3, -1]  ->  true

Headline: contains_duplicate([1,2,3,1]) = true

All assertions passed.
```

## Design notes

- The naive O(n²) lookup is fine for small arrays; for very
  large arrays we'd want a real hash set (which the v1
  evaluator's `Map<int, int>` would provide). The
  parallel-array approach keeps the example self-contained
  and lets the JIT specialize the inner loop easily.
- The empty-array case returns false: no duplicates in an
  empty array.
- The all-distinct case `[1..10]` confirms the no-duplicate
  path works correctly (returns false).
- The negative-number case confirms the set works for any
  integer values.
- Fully clean compile (`ok = true`).
