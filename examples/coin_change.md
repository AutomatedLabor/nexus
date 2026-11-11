# coin_change.ae

Coin change via dynamic programming: given a set of coin
denominations and a target amount, find the minimum number
of coins needed to make that amount — and reconstruct which
coins were used.

## What it does

1. **`coin_change(coins, amount)`** — builds a 1D DP table
   where `dp[a] =` minimum coins to make amount `a`, with a
   parallel `prev` array tracking which coin was last used.
   For each amount `a` from 1 to `amount`, it tries each coin
   `c ≤ a` and picks the best (`dp[a-c] + 1`).
2. **`reconstruct(prev, amount)`** — walks backward through
   `prev` from `amount` to 0, accumulating the chosen coins
   into a list. Returns them in descending order.
3. **Driver** — prints the full DP table for amount 27, the
   minimum coin count, and the chosen coins. Repeats with
   amount 30 for a second example.
4. **Assertions** — verifies the DP values at `0, 1, 5, 10, 25, 27, 30`
   and that the reconstructed coins for amount 27 sum to 27.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/coin_change.ae
```

## Key language features

- **Tuple return** — `coin_change` returns `(dp, prev)` as a
  tuple; callers destructure via `result.0`, `result.1`.
- **`repeat(n, v)` helper** — builds an array of `n` copies of
  `v` (Aether v1 has no `vec!` macro / `repeat` built-in).
- **Nested `while` loops** for the DP fill — outer over amounts,
  inner over coin denominations.
- **Sentinel-based "impossible"** — uses `INF = 1000000` rather
  than an `Option<int>` (v1 doesn't expose `Option` cleanly).
- **`reduce` over `[int]`** to render the chosen coins as
  `[1, 5, 25]`-style strings.

## Expected output

```
== Coin change (DP) ==

coins:   [1, 5, 10, 25]
amount:  27

dp table (amount -> min coins):
  a=0: 0 coins
  a=1: 1 coins
  ...
  a=27: 3 coins

min coins to make 27: 3
coins used: [25, 1, 1]
...
All assertions passed.
```

## Design notes

The `reconstruct` helper uses a `safety` counter to guarantee
termination even if `prev` is corrupted. The sentinel value
`1000000` is comfortably larger than any reasonable `amount`
divided by the smallest coin (we cap `amount` at 30 in tests,
so the true worst case is 30 ones = 30 coins).
