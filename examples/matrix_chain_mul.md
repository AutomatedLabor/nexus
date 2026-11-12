# matrix_chain_mul.ae

Matrix chain multiplication: find the optimal parenthesization to minimize scalar multiplications for chaining `A0 × A1 × ... × A(n-1)`, where `Ai` has dimensions `p[i] × p[i+1]`. The DP recurrence:
- `m[i][j] = 0` if `i == j`.
- `m[i][j] = min over k of m[i][k] + m[k+1][j] + p[i] * p[k+1] * p[j+1]`.

We keep a `s[i][j]` table of the best split point to reconstruct the parenthesization.

## What it does

1. **`make2d(rows, cols, init)`** — fresh 2D array.
2. **`matrix_chain(p)`** — fills the DP tables:
   - Iterate by chain length `len_chain` from 2 to `n`.
   - For each `(i, j)` with `j = i + len_chain − 1`, try every split point `k ∈ [i, j-1]` and take the min cost.
   - Returns `[m, s]`.
3. **`parenthesize(s, i, j)`** — recursive reconstruction: if `i == j`, return `"Ai"`; else split at `s[i][j]` and join.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/matrix_chain_mul.ae
```

## Key language features

- **Recursive string construction** — `parenthesize` builds the parenthesized expression as a string; recursion depth is bounded by `log n` in practice.
- **`while` for every loop** — outer over chain length, inner over starting index, innermost over split point.
- **`if cond { ... };` after if** — Aether v1 requires `;` after the closing brace of an if/else block when followed by another statement.

## Expected output

```
== Matrix chain multiplication ==

  matrices: 4
  dims:     [10, 30, 5, 60, 20]
  min cost: 8500 scalar multiplications
  plan:     ((A0 * A1) * (A2 * A3))

  chain 2 cost: 26000
  chain 2 plan: ((A0 * (A1 * A2)) * A3)

All assertions passed.
```

## Design notes

- For the chain `[10, 30, 5, 60, 20]` the optimal plan is `((A0 * A1) * (A2 * A3))`:
  - `A0 × A1`: cost `10 × 30 × 5 = 1500`, result `10 × 5`.
  - `A2 × A3`: cost `5 × 60 × 20 = 6000`, result `5 × 20`.
  - Final: cost `10 × 5 × 20 = 1000`, result `10 × 20`.
  - Total: `1500 + 6000 + 1000 = 8500`.
- For the chain `[40, 20, 30, 10, 30]` the optimal plan is `((A0 * (A1 * A2)) * A3)` with cost 26000.
- Complexity: `O(n³)` time, `O(n²)` space.
- The output plan is a parenthesized expression; evaluating it left-to-right gives the actual multiplication order.
