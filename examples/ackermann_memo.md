# ackermann_memo.ae

The Ackermann function — a classic example of a total computable
function that grows faster than any primitive recursive
function. Plain recursion explodes for `A(3, n)` with `n > a
handful`; memoization keeps the work tractable.

## The function

```
A(0, n) = n + 1
A(m, 0) = A(m-1, 1)                  for m > 0
A(m, n) = A(m-1, A(m, n-1))          for m > 0, n > 0
```

Closed forms for small `m`:
- `A(0, n) = n + 1`
- `A(1, n) = n + 2`
- `A(2, n) = 2n + 3`
- `A(3, n) = 2^(n+3) - 3`

So `A(3, 5) = 2^8 - 3 = 253`, but the recursion visits
thousands of distinct (m, n) pairs along the way.

## What it does

1. **`memo`** — a 2D array of nested arrays, grown lazily.
   -1 means "not yet computed".
2. **`ensure_size(m, n)`** — grow `memo[m]` to include index
   `n`, padding with -1.
3. **`get(m, n)` / `set_mem(m, n, v)`** — O(1) lookup / store.
4. **`ack(m, n)`** — recursive, with the memo lookup first.
5. **Driver** — computes `A(0, 0)` through `A(3, 5)`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/ackermann_memo.ae
```

## Key language features

- **Nested array assignment** (`memo[m][n] = v`) — Aether
  supports mutation of array elements at any depth.
- **Lazy growth** via `while len(...) <= m { push(...) }` —
  avoids preallocating a huge 2D array.
- **Recursion** with the memoization guard at the top.

## Why a 2D array memo?

The "parallel arrays" trick in `memo_fib.ae` is O(n) lookup —
fine for Fibonacci, where the memo only ever has ~50 entries.
Ackermann with `A(3, 5)` visits ~3000 distinct (m, n) pairs;
O(n) lookup would be 9 million comparisons. The 2D array gives
O(1) lookup, keeping the total step count well under the
evaluator's 1M-step budget.

## Expected output

```
== Ackermann with memoization ==

A(0, 0) = 1
A(0, 5) = 6
A(1, 5) = 7
A(2, 3) = 9
A(2, 10) = 23
A(3, 3) = 61
A(3, 4) = 125
A(3, 5) = 253

All assertions passed.
```

## Design notes

- The closed form `A(2, n) = 2n + 3` gives `A(2, 10) = 23` —
  a sanity check that the recursion is wired up correctly.
- The maximum `n` we compute is 5 (for `m = 3`). The memo
  needs `n` up to about 253 (the value of `A(3, 5)` — that's
  the inner argument when computing `A(2, A(3, 4))`). The
  lazy growth handles this transparently.
