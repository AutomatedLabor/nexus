# jump_search.ae

A demo of jump search — find a target in a sorted array by jumping ahead in fixed-size steps, then doing a linear scan within the identified block. The demo searches for 23 in a sorted array of 25 elements.

## What it does

Jump search works in two phases:

1. **Jump phase.** Starting from index 0, jump forward by `step = ceil(sqrt(n))` positions at a time, comparing `arr[cur]` with `target`. As long as `arr[cur] < target`, advance `prev = cur; cur = cur + step`. Stop when either `arr[cur] >= target` (the target lies in the block we just jumped over) or `cur >= n` (we ran off the end of the array).
2. **Linear scan phase.** Walk forward from `prev` to `min(cur, n - 1)` looking for `arr[i] == target`. Return `i` if found, -1 otherwise.

For the demo array of 25 elements, `step = 5`. To find 23:
- Jump 1: `arr[5] = 17 < 23`, advance to `cur = 10`.
- Jump 2: `arr[10] = 32 >= 23`, stop. `prev = 5`, `cur = 10`.
- Linear scan `arr[5..10]`: 17, 20, **23** → found at index 7.

## Complexity

- **Time:** O(sqrt(n)) — the jump phase does at most `sqrt(n)` jumps, and the linear scan does at most `sqrt(n)` comparisons. The total is bounded by `2 * sqrt(n)`.
- **Space:** O(1).

## Why it's interesting

Jump search is the answer to the question "what's the best we can do on a sorted array if we can only afford sequential reads?" Binary search makes random accesses (jumping to the middle of the array), which is cheap on RAM but expensive on paged storage (e.g. disk, where each random access is a page fault). Jump search makes `sqrt(n)` sequential block reads plus `sqrt(n)` comparisons within one block — the optimal balance.

In practice, jump search is rarely used directly (binary search is almost always faster on modern hardware), but the *pattern* (jump in fixed strides, then scan) shows up everywhere: bloom filters, hash table probing, page-table walks.

## Output

```
== Jump search demo ==

arr has 25 elements (sorted, arithmetic)
target = 23
index = 7

more searches:
  target 2 -> index 0
  target 74 -> index 24
  target 100 (missing) -> -1

Jump search complete.
```

## Notes

- The `end_idx = min(cur, n - 1)` clamp handles the case where the final jump goes past the end of the array.
- The `cont` flag pattern is the standard "early-exit from a while loop" idiom in Aether (defensive against the v1 evaluator's for-loop-scope quirk).
- For the production-grade version, see `aether-algorithms.jumpSearch`.
