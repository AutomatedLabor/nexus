# priority_queue_demo.ae

A binary min-heap priority queue in Aether. We store entries as `(priority, value)` 2-tuples; `push_entry(h, p, v)` appends and sifts up, `pop_entry(h)` swaps the root with the last element, removes it, and sifts the new root down. Lower priority value = higher urgency (popped first).

## What it does

1. **`make_heap()`** — returns an empty heap `[]`.
2. **`size(h)`** — number of entries (`len(h)`).
3. **`sift_up(h, i)`** — bubble the entry at index `i` toward the root while it is smaller than its parent. Parent index is `int((i - 1) / 2)`.
4. **`sift_down(h, i)`** — sink the entry at index `i` toward the leaves while it is bigger than its smallest child. Children indices are `2i + 1` and `2i + 2`.
5. **`push_entry(h, p, v)`** — append `[p, v]`, then `sift_up` from the end.
6. **`peek(h)`** — return `h[0]` without removing it.
7. **`pop_entry(h)`** — extract the smallest-priority entry: swap root with last, drop the tail via the builtin `pop`, then `sift_down(0)`.
8. **Driver** — builds a heap of 5 tasks with priorities `[5, 1, 3, 2, 4]` and values `[100, 200, 300, 400, 500]`, then pops all 5 to confirm they come out in priority order.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/priority_queue_demo.ae
```

## Key language features

- **Tuple access** `entry.0`, `entry.1` — Aether supports `.0`/`.1` on tuples (and on int arrays here, treated as 2-tuples at runtime).
- **`int((idx - 1) / 2)`** — integer division via `int()` cast after float division `/`.
- **Mutation via index assignment** `h[idx] = ...` — Aether arrays support in-place index assignment (the evaluator handles it; the type checker warns but doesn't block).
- **`while` with explicit `keep_going` flag** — avoids the for-loop-scope quirk; lets us exit cleanly when the sift finishes.
- **Builtin `push`/`pop`** — `push(arr, v)` appends and returns the array; `pop(arr)` removes and returns the last element.
- **`panic` for the empty-heap case** — Aether has no exceptions, only panics that surface as runtime errors.

## Expected output

```
== Priority queue demo (binary min-heap) ==

inserted 5 tasks with priorities [5, 1, 3, 2, 4] (values 100..500)
heap size after inserts: 5

pop order (priority, value):
  pop #1: priority = 1, value = 200
  pop #2: priority = 2, value = 400
  pop #3: priority = 3, value = 300
  pop #4: priority = 4, value = 500
  pop #5: priority = 5, value = 100

All assertions passed.
```

## Design notes

- **Min-heap, not max-heap**: lower priority value = popped first. To make a max-heap, negate priorities on insert (or compare with `>` instead of `<` in the sifts).
- **0-based indexing**: parent of `i` is `int((i - 1) / 2)`; children of `i` are `2i + 1` and `2i + 2`. The root is index 0.
- **In-place mutation**: `sift_up` and `sift_down` mutate `h` via index assignment and return the same array reference, so the caller doesn't need to rebind. This is fine because we always re-assign `h[idx] = ...` not `h = ...`.
- **O(log n) operations**: `push_entry` and `pop_entry` are both O(log n) — the sift walks at most one root-to-leaf path. `peek` is O(1). `size` is O(1) (just `len`).
- **Avoids for-loop-scope quirk**: uses `while` with explicit `keep_going` flags throughout. Recursive implementations would also work but `while` keeps the stack shallow on large heaps.
- **Type-checker caveat**: `h` is declared as `[[int]]` (array of int-arrays), so `entry.0` produces a non-blocking "cannot access tuple field on [int]" warning — the evaluator still runs and produces correct output, because at runtime the entry is a 2-element array and `.0` works.
