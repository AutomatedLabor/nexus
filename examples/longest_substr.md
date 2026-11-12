# longest_substr.ae

Longest substring without repeating characters: given a
string, find the length of the longest substring containing no
duplicate characters.

## What it does

1. **`in_window(s, start, end, c)`** — linear scan to test
   whether `c` appears in `s[start..end)`. Returns true/false.
2. **`longest_substr(s)`** — the sliding-window algorithm:
   - Maintain a window `[start, end)` (initially `[0, 1)`).
   - For each new `end` position, check whether `s[end]` is
     already in the window.
   - If yes, advance `start` by one (the algorithm naturally
     converges because the next iteration will check again).
   - If no, extend `end` and update `best = max(best, end - start + 1)`.
   - Empty string returns 0; single char returns 1.
3. **Driver** — runs the solver on nine strings including the
   classic LeetCode trio, then asserts nine sub-results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/longest_substr.ae
```

## Key language features

- **`while end < len(s)`** outer loop with `start = start + 1` to
  shrink the window — sidesteps the for-loop-scope quirk and
  avoids needing a `for ... in range(...)` construct.
- **`str(s[i])`** to extract a single-char string from the
  Aether string (which is a JS string under the hood).
- **`in_window` as a helper** rather than a nested loop inline —
  the helper-returns-bool pattern is cleaner than `break`-based
  early exit and avoids the for-loop-scope quirk.

## Expected output

```
== Longest substring without repeats ==

  "abcabcbb"  ->  3
  "bbbbb"  ->  1
  "pwwkew"  ->  3
  ""  ->  0
  "abcdef"  ->  6
  "abccba"  ->  3
  "a"  ->  1
  "aab"  ->  2
  "dvdf"  ->  3

Headline: longest_substr("abcabcbb") = 3

All assertions passed.
```

## Design notes

- The "advance `start` by one" form is a slight optimization
  tradeoff: the standard algorithm jumps `start` to `dup_index + 1`
  in one step, but iterating one-by-one keeps the code simpler
  and is still O(n) amortized (each `start`/`end` only moves
  forward).
- The edge case `len(s) == 0` returns 0 — a defensible default.
- `in_window` returns `0` or `1` internally and we compare with
  `== 1` to avoid the v1 evaluator's truthiness on integer 0
  being falsy.
- Fully clean compile (`ok = true`).
