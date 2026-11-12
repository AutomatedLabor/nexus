# rod_cutting.ae

Rod cutting DP. We have a rod of length `n` inches and a price table `prices[i]` (1-indexed price for a piece of length `i`). We want to maximize revenue by cutting the rod into pieces. The recurrence:
- `r(n) = max over i in 1..n of prices[i] + r(n - i)`.

We also track `cut[i]` (the length of the first piece cut from a rod of length `i`) to reconstruct the cut list.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`rod_cut(prices, n)`** — fills two arrays:
   - `r[i]` = best revenue for a rod of length `i`.
   - `cut[i]` = the length of the first piece to cut from a rod of length `i`.
   - For each `len_ ∈ [1, n]` and each `i ∈ [1, len_]`: try `prices[i-1] + r[len_ - i]`, take the max.
3. **`reconstruct_cuts(cut, n)`** — walk back through `cut` to produce the list of piece lengths.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/rod_cutting.ae
```

## Key language features

- **`while` for every loop** — sidesteps the for-loop-scope quirk.
- **1-indexed semantics in `prices`, 0-indexed arrays in Aether** — we use `prices[i-1]` to get the price for length `i`.
- **`if cond { ... };` after if-else** — required when followed by another statement.

## Expected output

```
== Rod cutting ==

  length | price | best revenue | cuts
    1   |   1    |     1        | [1]
    2   |   5    |     5        | [2]
    3   |   8    |     8        | [3]
    4   |   9    |     10        | [2, 2]
    5   |   10    |     13        | [2, 3]
    6   |   17    |     17        | [6]
    7   |   17    |     18        | [1, 6]
    8   |   20    |     22        | [2, 6]

  optimal cuts for length 8: [2, 6]

All assertions passed.
```

## Design notes

- Prices for lengths 1..8 are `[1, 5, 8, 9, 10, 17, 17, 20]`.
- For length 4, cutting into two pieces of length 2 each gives revenue `5 + 5 = 10`, better than selling the whole rod (price 9).
- For length 8, the optimal is `[2, 6]` (revenue `5 + 17 = 22`), beating the whole-rod price of 20 and any other split.
- The reconstruct walk gives the optimal piece lengths, not just the optimal revenue.
- Complexity: `O(n²)` time, `O(n)` space (single loop over lengths, inner loop over first-cut position).
- A generalized version with a "cost per cut" makes it harder; the basic version here is pure DP.
