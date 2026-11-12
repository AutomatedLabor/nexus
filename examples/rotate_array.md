# rotate_array.ae

Rotate an array to the right by `k` positions, in place.

## What it does

1. **`reverse_range(arr, lo, hi)`** — reverse `arr[lo..hi]`
   (inclusive) in place using index-swap.
2. **`rotate(arr, k)`** — the three-reverse trick:
   - Normalize `k` modulo `len(arr)` (handle negative `k` too).
   - Reverse the whole array.
   - Reverse the first `k` elements.
   - Reverse the remaining `n - k` elements.
   - The composition is a right-rotation by `k`.
3. **`show(arr)`** — render an int array as `[1, 2, 3]`.
4. **Driver** — runs the rotation on eight cases including the
   LeetCode headline, `k=0`, `k=n`, `k > n`, single-element,
   and empty-array edge cases.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/rotate_array.ae
```

## Key language features

- **Index-swap with `tmp`** — `let tmp = arr[a]; arr[a] = arr[b]; arr[b] = tmp;`
  works in the v1 evaluator (arrays are JS arrays, index-assign is supported).
- **`k % n`** — Python-style positive modulo. The v1 evaluator's `%`
  returns a non-negative result for positive `n`, so `k % n` is
  always in `[0, n)`.
- **`while a < b`** for the reverse loop — sidesteps the
  for-loop-scope quirk.
- **Empty-array guard** — `if n == 0 { 0 } else { ... }` returns
  early before the modulo would divide by zero.

## Expected output

```
== Rotate array ==

  [1, 2, 3, 4, 5, 6, 7] rotated by 3  ->  [5, 6, 7, 1, 2, 3, 4]
  [-1, -100, 3, 99] rotated by 2  ->  [3, 99, -1, -100]
  [1, 2, 3, 4, 5] rotated by 0  ->  [1, 2, 3, 4, 5]
  [1, 2, 3, 4, 5] rotated by 5  ->  [1, 2, 3, 4, 5]
  [1, 2, 3, 4, 5] rotated by 7  ->  [4, 5, 1, 2, 3]
  [1, 2, 3] rotated by 1  ->  [3, 1, 2]
  [42] rotated by 5  ->  [42]
  [1, 2, 3, 4, 5, 6] rotated by 4  ->  [3, 4, 5, 6, 1, 2]

Headline: [1..7] rotated by 3 = [5, 6, 7, 1, 2, 3, 4]

All assertions passed.
```

## Design notes

- The three-reverse trick is the canonical O(n)-time, O(1)-space
  array rotation algorithm.
- `k = 0` and `k = n` are identity operations (verified by
  assertions).
- `k > n` (e.g., `k = 7` on a 5-element array) is normalized to
  `k % n = 2`, producing a 2-step rotation.
- Single-element and empty arrays are no-ops.
- The negative-number case `[-1, -100, 3, 99]` confirms the
  algorithm doesn't depend on positive-only inputs.
- Fully clean runtime (no runtime errors); one non-blocking
  type warning about the empty-array literal matching `[int]`.
