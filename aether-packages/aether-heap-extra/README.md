# aether-heap-extra

> Priority queue extensions for the Aether language — 8 pub functions covering a richer priority-queue API than the stdlib `heap` module: `pqNew`, `pqPush`, `pqPop`, `pqPeek`, `pqSize`, `pqMerge`, `pqUpdateKey`, `pqDelete`.

`aether-heap-extra` is the priority-queue complement to the stdlib's `heap` module. The stdlib `heap` provides basic push/pop/peek on a binary heap; this package adds `pqUpdateKey` (change a value's priority in-place) and `pqDelete` (remove a value), plus `pqMerge` (combine two heaps). These are the operations you need for Dijkstra's shortest path, A* search, event simulation, and other "I need to update a queued item's priority" algorithms.

## Representation

A priority queue is a mutable array of `[priority, value]` pairs in binary-min-heap order. The min-priority pair is at index 0. `pqPop` removes and returns it, then re-heapifies.

`pqUpdateKey` and `pqDelete` use a linear scan to find the value (O(n)) — the v3.0 implementation favors simplicity over performance. The v3.1 plan is a position map (a side Map from value to index) for O(log n) update/delete.

## API

All 8 functions are `pub fn` declarations in `src/lib.ae`.

| Function | Signature | Description |
| --- | --- | --- |
| `pqNew()` | `() -> [any]` | Create an empty priority queue. |
| `pqPush(pq, priority, value)` | `([any], int, int) -> [any]` | Insert a `(priority, value)` pair. Returns `pq` (mutated). |
| `pqPop(pq)` | `([any]) -> [int]` | Remove and return the min-priority pair. Returns `[-1, -1]` if empty. |
| `pqPeek(pq)` | `([any]) -> [int]` | Return the min-priority pair without removing. |
| `pqSize(pq)` | `([any]) -> int` | Number of pairs. |
| `pqMerge(a, b)` | `([any], [any]) -> [any]` | Combine two heaps into a new one. |
| `pqUpdateKey(pq, value, new_priority)` | `([any], int, int) -> bool` | Find the pair with `value`, update its priority, re-heapify. Returns true if found. |
| `pqDelete(pq, value)` | `([any], int) -> bool` | Find and remove the pair with `value`. Returns true if found. |

## How to use

### As a dependency

```toml
[dependencies]
aether-heap-extra = "0.1.0"
```

```aether
import { pqNew, pqPush, pqPop, pqUpdateKey } from "aether-heap-extra";

let pq = pqNew();
pqPush(pq, 5, "low");
pqPush(pq, 1, "high");
pqPush(pq, 3, "med");

// Change "low" to top priority
pqUpdateKey(pq, "low", 0);

print(pqPop(pq));  // [0, "low"]
print(pqPop(pq));  // [1, "high"]
```

### Running the test suite

```sh
aether test aether-packages/aether-heap-extra/tests
# PASS aether-packages/aether-heap-extra/tests/tests.ae
# 1 passed, 0 failed
```

## Design notes

### Why distinct from the stdlib `heap`?

The stdlib `heap` is a generic binary heap with `push`/`pop`/`peek`. This package is a *priority queue* — a specific use case (key-value pairs ordered by key) with the operations you need for graph algorithms (`UpdateKey`, `Delete`, `Merge`). The stdlib doesn't have these; this package adds them in user space.

### Why O(n) `UpdateKey` and `Delete`?

The v3.0 implementation uses a linear scan to find the value. For large heaps, this is O(n) — slow. The v3.1 plan is a position map (a side Map from value to index) maintained on every push/pop, giving O(log n) update/delete. For Dijkstra on small graphs, O(n) is fine; for production, upgrade to v3.1.

### Why min-heap (not max-heap)?

Min-heaps are the natural choice for Dijkstra, A*, event simulation, and "smallest-first" scheduling. Max-heap is `pqPush(pq, -priority, value)` — a one-liner. The stdlib `heap` is also min-first, so this matches.

## Future work

- **Position map for O(log n) update/delete.** A side Map<value, index> maintained on every push/pop.
- **Pairing heaps / Fibonacci heaps.** A separate `aether-pq-fib` package for the theoretical-better-but-practically-same asymptotics.
- **Indexed priority queue.** A type-safe wrapper that guarantees values are unique.

## License

MIT — same as the Aether language.
