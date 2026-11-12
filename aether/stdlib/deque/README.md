# Aether stdlib — `deque`

A **double-ended queue** ("deque", pronounced "deck"). Elements
can be added or removed at **both** ends in O(1) amortised time.
The deque generalises both stacks (one-end only) and queues
(in one end, out the other) — both can be built on top.

## Why a deque?

Any time you need O(1) operations at both ends, a deque is the
right structure. Real-world uses:

- **Sliding-window algorithms**: maximum/minimum of every
  subarray of size k uses a deque of indices. Each new element
  is pushed to the back; expired elements (outside the window)
  are popped from the front; the front always holds the
  extremum's index.
- **Work-stealing schedulers**: a deque of pending jobs; the
  owner pushes/pops at the back (LIFO, cache-friendly); idle
  workers steal from the front.
- **Undo/redo with bounded history**: push actions to the
  back; when the history exceeds N entries, drop the oldest
  (front pop).
- **Browser history with forward/back**: back stack + forward
  stack is really a deque where the boundary moves with each
  navigation.
- **Palindrome checking**: push every character to the back,
  then pop front and back simultaneously, comparing — equal
  pairs mean the input is a palindrome.
- **Text editor buffer**: gap buffer is essentially a deque
  with a "cursor" pointer.

A vector with `push_back`/`pop_back` is a stack; with
`push_back`/`pop_front` is a queue. A deque gives you all four
operations in O(1) amortised.

## Implementation

A circular buffer with a `head` index and a `size` count. The
backing array grows geometrically (doubles) when full.
`dqPushBack` writes into the slot just past the live range;
`dqPushFront` decrements `head` (with wrap-around) and writes.
`dqPopFront`/`dqPopBack` are the mirrors. The wrap-around is
handled by modular arithmetic — `% buf.length` on every index.

When the buffer grows, the elements are unwrapped into a flat
array (head reset to 0). This avoids the cost of a partial copy
during every grow.

## Construction

```typescript
import * as Dq from "aether/stdlib/deque";

const d = Dq.dqNew();
Dq.dqPushBack(d, 1);
Dq.dqPushBack(d, 2);
Dq.dqPushFront(d, 0);
// Now: front -> 0, 1, 2 <- back
Dq.dqPopFront(d);   // -> 0
Dq.dqPopBack(d);    // -> 2
Dq.dqPeekFront(d);  // -> 1
```

`dqNew` returns a fresh empty deque.

## Core operations

- `dqPushFront(d, x)` — prepend `x` to the front. O(1) amortised.
- `dqPushBack(d, x)` — append `x` to the back. O(1) amortised.
- `dqPopFront(d)` — remove and return the front element.
  Returns `undefined` if empty. O(1) amortised.
- `dqPopBack(d)` — remove and return the back element.
  Returns `undefined` if empty. O(1) amortised.
- `dqPeekFront(d)` — read the front without removing it. O(1).
- `dqPeekBack(d)` — read the back without removing it. O(1).
- `dqSize(d)` — number of elements. O(1).
- `dqEmpty(d)` — true when size is 0. O(1).
- `dqToArray(d)` — fresh snapshot, front to back. O(n).

`dqPop*` does NOT panic on an empty deque (it returns
`undefined`). If your domain treats `undefined` as a valid
element, check `dqEmpty` first.

## Stacks and queues on top of the deque

A deque can simulate a stack or a queue with no overhead:

- **Stack (LIFO)**: push to one end, pop from the same end.
  `dqPushBack`/`dqPopBack` is one valid form; `dqPushFront`/
  `dqPopFront` is the other.
- **Queue (FIFO)**: push to one end, pop from the other.
  `dqPushBack`/`dqPopFront` is the canonical form; `dqPushFront`/
  `dqPopBack` reverses the order.

The dedicated `stack` and `queue` modules remain useful when
the call site wants to express intent (FIFO vs LIFO), but the
deque is strictly more capable.

## Performance

| Operation | Amortised | Worst-case (single call) |
|-----------|-----------|--------------------------|
| `dqNew` | O(1) | O(1) |
| `dqPushFront` / `dqPushBack` | O(1) | O(n) when capacity doubles |
| `dqPopFront` / `dqPopBack` | O(1) | O(1) |
| `dqPeekFront` / `dqPeekBack` | O(1) | O(1) |
| `dqSize` / `dqEmpty` | O(1) | O(1) |
| `dqToArray` | O(n) | O(n) |

The geometric growth (initial capacity 4, double when full)
gives the standard amortised-O(1) bound.

## API

| Function | Signature | Description |
|----------|-----------|-------------|
| `dqNew` | `() -> Deque` | Create a fresh empty deque. |
| `dqPushFront` | `(d, x) -> Deque` | Push to front; chainable. |
| `dqPushBack` | `(d, x) -> Deque` | Push to back; chainable. |
| `dqPopFront` | `(d) -> any?` | Remove and return front, or `undefined`. |
| `dqPopBack` | `(d) -> any?` | Remove and return back, or `undefined`. |
| `dqPeekFront` | `(d) -> any?` | Read the front without removing. |
| `dqPeekBack` | `(d) -> any?` | Read the back without removing. |
| `dqSize` | `(d) -> int` | Number of elements. |
| `dqEmpty` | `(d) -> bool` | True when empty. |
| `dqToArray` | `(d) -> [any]` | Fresh snapshot, front to back. |

## Validation

All functions throw a plain `Error` on invalid input (non-deque
object, missing fields). The Aether evaluator converts thrown
errors into Aether panics.
