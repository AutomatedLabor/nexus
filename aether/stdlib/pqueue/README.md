# Aether stdlib — `pqueue`

A binary min-heap priority queue with a custom comparator (or
"smaller comes out first" by default).  Supports insertion,
peek/pop, arbitrary key updates (for Dijkstra-style
decrement-key), merge, and conversion to a sorted array.

## When to use this?

Priority queues are the workhorse behind:

* **Dijkstra / A\*** shortest-path — pop the closest unvisited
  node, decrement-key its neighbours.
* **Huffman coding** — repeatedly pop the two lowest-frequency
  trees.
* **Event simulation** — schedule events by absolute time.
* **Hill-climbing / branch-and-bound** — explore the most
  promising state first.
* **Top-K selection** — keep the K largest by pushing all N items
  and popping the K top.

## Data model

```ts
interface PQItem<T> {
  item: T;
  seq: number;   // insertion sequence number for FIFO tie-breaking
}

interface PriorityQueue<T> {
  heap: PQItem<T>[];                                  // 0-indexed binary heap
  less: (a: T, b: T) => boolean;                       // true if a pops before b
  nextSeq: number;                                     // monotonic counter
}
```

The comparator `less` returns `true` if `a` should pop *before*
`b`.  The default is `a < b` (min-heap).  Pass
`(a, b) => a > b` for a max-heap, or a custom predicate over
objects (e.g. tasks with priorities).

Each element is wrapped in `{ item, seq }`.  The `seq` field
breaks ties: when two items compare equal, the one inserted first
pops first (FIFO).  This is essential for stable behaviour in
event simulations.

## Functions

| Function | Signature | Notes |
|---|---|---|
| `pqNew` | `(less?) -> PriorityQueue` | Fresh min-heap (or use custom comparator). |
| `pqPush` | `(q, item) -> PriorityQueue` | Insert; chainable. |
| `pqPop` | `(q) -> any?` | Remove & return the top; `undefined` if empty. |
| `pqPeek` | `(q) -> any?` | Look at the top without removing it. |
| `pqSize` | `(q) -> int` | Number of elements. |
| `pqEmpty` | `(q) -> bool` | True if empty. |
| `pqMerge` | `(dst, src) -> PriorityQueue` | Move all elements from `src` into `dst`; empties `src`. |
| `pqUpdateKey` | `(q, oldItem, newItem) -> bool` | Replace an item by identity; re-sift. |
| `pqDelete` | `(q, item) -> bool` | Remove an item by identity. |
| `pqToSorted` | `(q) -> any[]` | Snapshot in pop order; queue unchanged. |

## Examples

### Min-heap basics

```aether
let q = pqNew();
pqPush(q, 3);
pqPush(q, 1);
pqPush(q, 2);
print(pqPop(q));  // 1
print(pqPop(q));  // 2
print(pqPop(q));  // 3
```

### Custom comparator (max-heap)

```aether
let q = pqNew(fn (a: int, b: int) -> bool { a > b });
pqPush(q, 1);
pqPush(q, 3);
pqPush(q, 2);
print(pqPop(q));  // 3
```

### Object priorities (Dijkstra-style)

```aether
type Task = { name: string; prio: int };
let q = pqNew(fn (a: Task, b: Task) -> bool { a.prio < b.prio });
pqPush(q, { name: "low",  prio: 10 });
pqPush(q, { name: "high", prio: 1 });
pqPush(q, { name: "med",  prio: 5 });
print(pqPop(q).name);  // high
```

### Decrement-key (re-prioritisation)

```aether
let q = pqNew();
pqPush(q, 5);
pqPush(q, 3);
pqPush(q, 8);
pqUpdateKey(q, 5, 1);  // 5 → 1, becomes the new min
print(pqPop(q));  // 1
```

### Merge two queues

```aether
let a = pqNew();
pqPush(a, 5);
pqPush(a, 1);
let b = pqNew();
pqPush(b, 3);
pqPush(b, 2);
pqMerge(a, b);
print(pqSize(b));   // 0  (b is now empty)
print(pqPop(a));    // 1
print(pqPop(a));    // 2
print(pqPop(a));    // 3
print(pqPop(a));    // 5
```

## Semantics

* **Identity lookup** for `pqUpdateKey` and `pqDelete`.  These
  find the entry by `===` against the original `item` reference,
  which means they only work on object/primitive identity.  For
  primitives, you must keep the exact reference you pushed.
* **Stable order** for equal priorities via the `seq` field —
  earlier inserts come out first.
* **Merge preserves seq numbers**, so the post-merge tie-break is
  by the *original* insertion time across both queues.
* **`pqToSorted` is non-destructive** — it copies the heap and
  pops from the copy.

## Performance

| Operation | Complexity |
|---|---|
| `pqNew` | O(1) |
| `pqPush` | O(log n) |
| `pqPop` | O(log n) |
| `pqPeek`, `pqSize`, `pqEmpty` | O(1) |
| `pqMerge(dst, src)` | O(m log(n+m)) where m = size(src) |
| `pqUpdateKey`, `pqDelete` | O(n) lookup + O(log n) sift |
| `pqToSorted` | O(n log n) (copy + n pops) |

The O(n) lookup for `pqUpdateKey` is the price of the simple
array-based heap.  A production-grade indexed heap would maintain
a `Map<item, index>` for O(1) lookup, but that adds identity
tracking overhead on every push and pop.  For most use cases
(moderate queue size, infrequent updates) this is the right
trade-off.

## Errors

* Bad queue object → `Error: pqX: expected PriorityQueue, got …`.
* All functions validate their input; mutation-style functions
  also validate intermediate state.

## Tests

25 tests in `index.test.ts` cover construction, push/pop order,
peek, size, empty, merge (including chainability and the
empty-src no-op), `pqUpdateKey` (decrement, increment, and
missing-item), `pqDelete` (top, middle, missing), `pqToSorted`
(including non-mutating and custom-comparator variants), object
priorities, validators, and a large random-sort smoke test.  Run
them with:

```
bunx vitest run aether/stdlib/pqueue
```

## Future work

* An indexed priority queue variant — `pqNewIndexed()` returns a
  queue with an internal `Map<item, index>` so `pqUpdateKey` and
  `pqDelete` are O(log n) instead of O(n).  This is the right
  shape for Dijkstra with millions of vertices.
* A `pqFrom(items[], less?)` constructor that heapifies an
  existing array in O(n) — useful for bulk-loading.
