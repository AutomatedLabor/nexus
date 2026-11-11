# Aether stdlib — `heap`

The `heap` module is a binary heap / priority queue. A heap is `{ arr, cmp }` where `arr` is the backing array (0-indexed, no dummy slot) and `cmp(a, b)` returns true when `a` should bubble up over `b` (i.e., `a` is "higher priority" than `b`). The default comparator is a min-heap: `(a, b) => a < b`, so the smallest value sits at the top. The module ships 19 functions: constructors, the four core operations (push / pop / peek / size), heap-sort, merge, key update, delete, sift helpers, and the parent / left / right index formulas. All functions are pure TypeScript; throwing an `Error` from a builtin surfaces as an Aether panic.

## Why 0-indexed?

We chose 0-indexing over the more textbook 1-indexed layout because it works directly with JavaScript arrays (which start at 0). The formulas become:

```
parent(i)  = (i - 1) >> 1
left(i)   = 2 * i + 1
right(i)  = 2 * i + 2
```

These are exposed via `heapParent`, `heapLeft`, `heapRight` for teaching and debugging.

## Construction

`heapNew(cmp?)` returns a fresh empty heap. The default `cmp` is a min-heap comparator (`a < b`); pass `(a, b) => a > b` for a max-heap. `heapFromArray(arr, cmp?)` (alias: `heapify(arr, cmp?)`) builds a heap from an existing array in O(n) time using Floyd's algorithm — sifting down from the middle of the array to the root.

```aether
let h = heap.heapNew()                 // empty min-heap
let h2 = heap.heapNew((a, b) => a > b) // empty max-heap
let h3 = heap.heapFromArray([5, 1, 9, 3])
heap.heapPeek(h3)                       // 1
```

## Core operations

`heapPush(h, v)` inserts `v` and sifts it up — O(log n). `heapPop(h)` removes and returns the top element — swaps with the last, pops the last, sifts the new root down — O(log n). Panics on empty. `heapPeek(h)` returns the top element without removing it. `heapSize(h)` returns the count. `heapIsEmpty(h)` is the obvious predicate.

```aether
heap.heapPush(h, 5)
heap.heapPush(h, 2)
heap.heapPush(h, 8)
heap.heapPeek(h)   // 2 (min at top)
heap.heapPop(h)    // 2
heap.heapPop(h)    // 5
```

## Heap-sort

`heapSort(arr, cmp?)` returns a new sorted array. It builds a heap with `heapFromArray`, then repeatedly pops into an output array. The input is not mutated. With the default min-heap comparator, the result is ascending; with `(a, b) => a > b`, the result is descending.

```aether
heap.heapSort([5, 1, 9, 3, 7])  // [1, 3, 5, 7, 9]
heap.heapSort([5, 1, 9, 3], (a, b) => a > b)  // [9, 5, 3, 1]
```

## Heap operations

`heapReplace(h, v)` pops the top and pushes `v` in one step (more efficient than `pop` + `push` — one sift instead of two). `heapMerge(a, b)` combines two heaps into a new heap (assuming they share the same comparator). `heapUpdateKey(h, i, key)` updates the priority of the element at index `i` to a "more urgent" `key` and sifts it up — panics when the new key is not higher priority (a heap can only support a "decrease-key" operation in this direction; the opposite is more complex). `heapDelete(h, i)` removes the element at index `i`, restoring the heap property by sifting either up or down depending on which side the last element violated.

```aether
heap.heapReplace(h, 4)  // returns the old top, h now contains 4
heap.heapUpdateKey(h, 3, 0)  // element at index 3 is now 0 (must be smaller)
heap.heapDelete(h, 1)        // remove the element at index 1
```

## Sift helpers

`heapSiftUp(h, i)` and `heapSiftDown(h, i)` are the building blocks of the above operations. They're exposed publicly because they're occasionally useful for restoring the heap property after a manual mutation (e.g., you set `h.arr[3] = 7` directly and want to fix the heap). Both work by swapping along the path to the root (or to the leaves) until the heap property is restored.

## Display

`heapToSortedArray(h)` drains the heap by repeatedly popping. **This empties the heap** — the heap is left with size 0. If you want a sorted copy without destroying the heap, copy first: `let copy = heap.heapFromArray(h.arr, h.cmp); let sorted = heap.heapToSortedArray(copy);`.

## Common patterns

- **Priority queue**: `heapNew()` then `heapPush` for each item; `heapPop` to serve the most urgent. The classic scheduler pattern.
- **Top-K**: maintain a max-heap of size K; for every new value, push and pop once. The top K survive.
- **Sort a large array with bounded memory**: `heapSort` allocates a new array (so O(n) auxiliary space) but the heap itself is in-place. If you want a true in-place heap-sort, build a heap in-place (call `heapSiftDown` from the middle down), then repeatedly swap root with last and sift.
- **Merge K sorted lists**: push the head of each list into a min-heap, pop the smallest, advance that list, repeat. (Beware: this module is untyped; the elements can be `{ value, listIdx }` tuples and the comparator reads `.value`.)

## Comparator pitfalls

The comparator is a "should `a` bubble up over `b`?" predicate. For min-heaps, that's `a < b`. For max-heaps, that's `a > b`. **Don't pass a comparator that returns true for equal elements** — it can cause infinite loops in `heapSiftDown`. We rely on `cmp` being a strict order. If you want a tie-breaker, return `false` on equality and use a secondary field.

## What's NOT in here

We deliberately omitted: pairing heaps, Fibonacci heaps (asymptotically better merge but the constant factors make them slower in practice for any reasonable n), indexed heaps (where the heap also tracks an external index for O(log n) `update_key` of an arbitrary element by its identifier — you can simulate this with a side `Map<id, idx>` and `heapUpdateKey`). These are good candidates for an `advanced-heap` companion module.

## Performance notes

- Push/pop are O(log n) — guaranteed by the sift operations walking at most `log2(n)` levels.
- `heapFromArray` is O(n) — Floyd's algorithm. This is the trick that makes `heapSort` O(n log n) total (the build is O(n), the n pops are O(log n) each).
- `heapMerge` is O(n + m) — concatenates and rebuilds with Floyd's algorithm.
- `heapUpdateKey` is O(log n) — one sift-up walk.
- `heapDelete` is O(log n) — one sift up or down.

## When to reach for a heap

A heap is the right data structure when:
- You need the "minimum" (or "maximum") of a changing collection — `peek` is O(1), `pop` is O(log n).
- You want a sorted output but the input arrives incrementally — `push` is O(log n) and `toSortedArray` is O(n log n).
- You want a top-K, k-smallest, or k-largest computation — bounded by `k log k`, not `n log n`.

A heap is NOT the right data structure when:
- You need fast lookup by key (use a `map` instead).
- You need a fully sorted sequence at all times (use a sorted array or a balanced BST).
- You need to insert in the middle (use a `list`).

The whole module is 19 functions, ~250 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
