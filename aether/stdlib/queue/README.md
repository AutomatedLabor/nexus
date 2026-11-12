# Aether stdlib — `queue`

A simple **FIFO queue** backed by a dynamic array. Elements enter at
the back and leave at the front in insertion order — the canonical
"first in, first out" data structure.

## Why a queue?

Queues are the workhorse of buffering: any time a producer and a
consumer run at different rates, you want a queue between them.
Real-world uses:

- **Breadth-first search** (BFS): the queue holds the "frontier" of
  nodes not yet explored; each `qPop` is the next node to visit,
  and its unvisited neighbours are `qPush`-ed to the back.
- **Level-order tree traversal**: same shape as BFS — pop a node,
  push its children.
- **Work scheduling**: enqueue jobs, workers dequeue them.
- **Stream processing / message queues**: append-only buffer with
  FIFO fairness.
- **Sliding-window algorithms**: push new items to the back, pop
  old items from the front when the window moves.
- **Producer/consumer coordination**: a thread-safe queue (this
  one isn't thread-safe, but the shape is the same).

A naïve array-based queue that uses `Array.shift()` for `pop` pays
an O(n) copy on every removal — fine for tiny queues, painful
above a few thousand elements. This implementation uses a **head
index pointer**: `qPop` simply advances the pointer and reads the
element at the new position. When the dead space in front of the
pointer exceeds the live element count, the backing array is
compacted in one O(n) pass. That keeps every operation amortised
O(1).

## Construction

```typescript
import * as Q from "aether/stdlib/queue";

const q = Q.qNew();
Q.qPush(q, "a");
Q.qPush(q, "b");
Q.qPush(q, "c");
// Now: front -> a, b, c <- back
Q.qPop(q);   // -> "a"
Q.qPeek(q);  // -> "b"
```

`qNew` returns a fresh empty queue. `qPush(q, x)` adds `x` to the
back and returns the queue (chainable). `qFromArr(xs)` builds a
queue from an array, copying the input (so caller mutations don't
leak in). The first element of the input array becomes the front
of the queue.

## Core operations

- `qPush(q, x)` — append `x` to the back. O(1) amortised.
- `qPop(q)` — remove and return the front. Returns `undefined`
  if the queue is empty. O(1) amortised.
- `qPeek(q)` — read the front without removing it. O(1).
- `qSize(q)` — number of elements. O(1).
- `qEmpty(q)` — true when size is 0. O(1).
- `qClear(q)` — empty the queue; chainable. O(1).

`qPop` does NOT panic on an empty queue (it returns `undefined`).
If your domain treats `undefined` as a valid queue element, check
`qEmpty` first.

## Conversion and inspection

- `qToArray(q)` — a fresh array snapshot of the queue's contents,
  front to back. Does not mutate the queue.
- `qToString(q)` — a human-readable dump, e.g. `Queue[1, 2, 3]`.
  Elements are JSON-stringified so nested objects render safely.

## Compaction: why and when

Each `qPop` advances `head` and writes `undefined` into the slot
it just vacated (so the GC can reclaim the reference). When `head`
grows to the point where the dead space is at least as large as
the live element count, the backing array is sliced to drop the
dead space, and `head` resets to 0. This bounds the dead space at
2x the live element count — keeping memory usage within a constant
factor of the queue's actual size.

A pathological workload (alternating push/pop forever, never
draining) will trigger a compaction every few operations. The
amortised cost is still O(1) per operation; only the worst-case
single operation gets the O(n) compaction. For latency-sensitive
use, a ring-buffer implementation would smooth this further, at
the cost of a more complex internal representation.

## Performance

| Operation | Amortised | Worst-case (single call) |
|-----------|-----------|--------------------------|
| `qNew` | O(1) | O(1) |
| `qPush` | O(1) | O(1) amortised; rare O(n) resize |
| `qPop` | O(1) | O(n) when compaction triggers |
| `qPeek` | O(1) | O(1) |
| `qSize` / `qEmpty` | O(1) | O(1) |
| `qClear` | O(1) | O(1) |
| `qToArray` | O(n) | O(n) |
| `qFromArr` | O(n) | O(n) |
| `qToString` | O(n) | O(n) |

## API

| Function | Signature | Description |
|----------|-----------|-------------|
| `qNew` | `() -> Queue` | Create a fresh empty FIFO queue. |
| `qPush` | `(q, x) -> Queue` | Push `x` to the back; chainable. |
| `qPop` | `(q) -> any?` | Remove and return the front element, or `undefined` if empty. |
| `qPeek` | `(q) -> any?` | Read the front element without removing. |
| `qSize` | `(q) -> int` | Number of elements. |
| `qEmpty` | `(q) -> bool` | True when empty. |
| `qClear` | `(q) -> Queue` | Empty the queue; chainable. |
| `qToArray` | `(q) -> [any]` | Fresh snapshot, front to back. |
| `qFromArr` | `(xs) -> Queue` | Build from an array (first becomes front). |
| `qToString` | `(q) -> string` | Human-readable rendering. |

## Validation

All functions throw a plain `Error` on invalid input (non-queue
object, missing fields). The Aether evaluator converts thrown
errors into Aether panics, so callers see a clean failure rather
than a silent corruption.
