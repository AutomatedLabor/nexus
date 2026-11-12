# Aether stdlib — `interval`

An **interval tree**: a sorted, search-optimised collection of
half-open intervals `[low, high)` with an associated value. The
tree supports fast queries of the form:

- "Does any interval contain this point?"
- "Does any interval overlap this range?"
- "Give me every interval overlapping this range."

## Why an interval tree?

Interval trees come up wherever you have to reason about *ranges*
rather than discrete keys. Examples:

- **Calendar scheduling**: each event is an interval `[start, end)`.
  Before booking a new event, you want to know if any existing
  event overlaps the requested slot. `intervalSearchRange` answers
  that in O(log n) average time.
- **Memory allocators**: free regions are intervals `[address,
  address+size)`. An allocation request for `n` bytes is a search
  for any interval of length ≥ n; a write to address `p` is a
  search for the interval containing `p` (`intervalSearchPoint`).
- **Network firewalls / ACLs**: rules cover port ranges
  `[low, high)`. A packet on port `p` is matched by
  `intervalSearchPoint`; a new rule overlapping an existing one is
  flagged by `intervalSearchRange`.
- **Genomics**: gene annotations are intervals on a chromosome.
  "Find all genes overlapping this region" is exactly
  `intervalSearchAll`.
- **CPU scheduling**: each process holds a time slice
  `[start, end)`. The scheduler walks an interval tree to find
  expired slices.

Without an interval tree, each of these queries degenerates to an
O(n) linear scan. With one, queries are O(log n + k) where k is
the number of overlapping results.

## Construction

```typescript
import * as Iv from "aether/stdlib/interval";

const t = Iv.intervalNew();
Iv.intervalInsert(t, 10, 20, "work meeting");
Iv.intervalInsert(t, 12, 15, "lunch");
Iv.intervalInsert(t, 30, 45, "interview");
```

`intervalNew()` returns a fresh empty tree. `intervalInsert(t,
low, high, value?)` adds a new interval. The optional `value`
parameter is associated with the interval and returned by the
search functions. If omitted, `undefined` is stored (which means
the search functions can return `undefined` for both "found but
no value" and "not found"; pass a real value when you need to
distinguish).

## Search

The tree exposes three search functions:

```typescript
// Does any interval contain the point 13?  Returns the value or undefined.
Iv.intervalSearchPoint(t, 13);    // -> "lunch" (since 13 ∈ [12, 15))

// Does any interval overlap [16, 18)?  Returns the value or undefined.
Iv.intervalSearchRange(t, 16, 18);  // -> "work meeting"

// All intervals overlapping [12, 18)?
Iv.intervalSearchAll(t, 12, 18);
// -> [{ low: 10, high: 20, value: "work meeting" },
//     { low: 12, high: 15, value: "lunch" }]
```

`intervalSearchPoint` and `intervalSearchRange` return **any one**
matching interval (whichever the BST traversal reaches first);
they're the right choice when you only need a yes/no answer with
the matching interval attached. `intervalSearchAll` is exhaustive
— it walks every overlapping interval, which is O(log n + k) where
k is the result count.

## Half-open semantics

All intervals are **half-open**: `[low, high)` contains `p` iff
`low <= p < high`. This means:

- `[1, 5)` contains `1, 2, 3, 4` but **not** `5`.
- Two adjacent intervals `[1, 5)` and `[5, 10)` **do not overlap**.
- `intervalSearchRange(t, 5, 10)` will *not* find `[1, 5)` (its high
  equals the query's low; half-open excludes the boundary).

The half-open convention is the standard in C++ iterators, Rust
ranges, Python `range()`, and most modern libraries; it makes
"partition the number line into non-overlapping chunks" a
zero-edge-case operation. If your data uses closed intervals
`[low, high]`, you can simulate by inserting `[low, high+1)` and
adjusting queries similarly.

## Deletion

`intervalDelete(t, low, high)` removes **one** interval whose
endpoints match exactly (both `low` and `high` must match). If
multiple intervals share the same `(low, high)`, only one is
removed per call; call repeatedly to remove all. Returns `true`
if an interval was removed, `false` if no match was found.

Deletion uses the standard BST two-children case (replace with
the in-order successor, then recursively delete the successor
from the right subtree). After each deletion, the `max`
augmentation field is recomputed along the deletion path so
searches remain correct.

## Endpoint queries

`intervalMin(t)` returns the smallest `low` among all intervals
(in-order leftmost node); `intervalMax(t)` returns the largest
`high` (root's `max` field — O(1)). Both return `undefined` for
an empty tree.

`intervalSize(t)` returns the count of intervals. `intervalToSortedArray(t)`
returns all intervals as `{low, high, value}` triples in ascending
order of `low` (in-order traversal).

## Implementation

The tree is a classic CLRS-style **augmented BST** keyed by `low`.
Each node stores, in addition to `low`, `high`, `value`, and the
left/right child pointers, a `max` field: the maximum `high` in
the subtree rooted at this node. This augmentation lets the search
prune whole subtrees: if `node.left.max < p`, then no interval in
the left subtree contains point `p`, and we descend right.

The tree is **not self-balancing**. Random insertion order gives
expected O(log n) depth; sorted insertion order degenerates to a
linked list (O(n) per operation). For adversarial inputs, pair
this module with `aether/stdlib/skip-list` (which *is* balanced,
probabilistically) or build a red-black variant.

## Performance

| Operation        | Average  | Worst (unbalanced) |
|------------------|----------|--------------------|
| `intervalInsert` | O(log n) | O(n) |
| `intervalDelete` | O(log n) | O(n) |
| `intervalSearchPoint`  | O(log n) | O(n) |
| `intervalSearchRange` | O(log n) | O(n) |
| `intervalSearchAll` | O(log n + k) | O(n) |
| `intervalSize` | O(1) | O(1) |
| `intervalMin` | O(log n) | O(n) |
| `intervalMax` | O(1) | O(1) |
| `intervalToSortedArray` | O(n) | O(n) |

`k` is the number of intervals returned by `intervalSearchAll`.

## API

| Function | Signature | Description |
|----------|-----------|-------------|
| `intervalNew` | `() -> IntervalTree` | Create a fresh empty tree. |
| `intervalInsert` | `(t, low, high, value?) -> IntervalTree` | Insert `[low, high)` with optional value; chainable. |
| `intervalDelete` | `(t, low, high) -> bool` | Delete one matching interval. |
| `intervalSearchPoint` | `(t, p) -> any?` | Find any interval containing `p`. |
| `intervalSearchRange` | `(t, low, high) -> any?` | Find any interval overlapping `[low, high)`. |
| `intervalSearchAll` | `(t, low, high) -> [{low,high,value}]` | All overlapping intervals. |
| `intervalSize` | `(t) -> int` | Number of intervals. |
| `intervalMin` | `(t) -> int?` | Smallest `low`. |
| `intervalMax` | `(t) -> int?` | Largest `high`. O(1). |
| `intervalToSortedArray` | `(t) -> [{low,high,value}]` | In-order traversal. |

## Validation

All functions throw a plain `Error` on invalid input (non-tree,
non-number, `NaN`/`Infinity`, `low > high`); the Aether evaluator
converts thrown errors into Aether panics.
