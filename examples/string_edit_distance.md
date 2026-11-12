# string_edit_distance.ae

Levenshtein edit distance via full DP table. We compute the minimum number of single-character edits (insert, delete, substitute) needed to transform `s1` into `s2`, then reconstruct the edit sequence by walking the DP table backwards.

## What it does

1. **`make2d(rows, cols, init)`** — fresh 2D array.
2. **`edit_distance(s1, s2)`** — builds the `(m+1) × (n+1)` table:
   - Row 0 = pure insertions: `dp[0][j] = j`.
   - Column 0 = pure deletions: `dp[i][0] = i`.
   - `dp[i][j] = min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + (cost))` where `cost = 0` if `s1[i-1] == s2[j-1]` else `1`.
3. **`reconstruct(dp, s1, s2)`** — walks from `dp[m][n]` back to `dp[0][0]`, choosing each step's operation:
   - Match: `s1[i-1] == s2[j-1]` and `dp[i][j] == dp[i-1][j-1]` → `"match"`, move diagonally.
   - Substitution: `dp[i][j] == dp[i-1][j-1] + 1` → `"sub"`, move diagonally.
   - Deletion: `dp[i][j] == dp[i-1][j] + 1` → `"del"`, move up.
   - Insertion: otherwise → `"ins"`, move left.
   - Reverse the result for forward order.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/string_edit_distance.ae
```

## Key language features

- **`charCode(s, i)`** — returns the integer code of the character at index `i`. Used to compare characters; `s[i]` returns a 1-char string but is awkward to compare.
- **Nested `while` for the DP fill** — the outer loop is `i`, the inner is `j`.
- **`if cond { ... };` after if-else** — required when followed by another statement.

## Expected output

```
== Levenshtein edit distance ==

  kitten -> sitting: distance = 3
    ops: [sub, match, match, match, sub, match, ins]
  ...
All assertions passed.
```

## Design notes

- For `kitten → sitting`: substitute `k → s`, keep `itt`, substitute `e → i`, keep `ng`, insert `g` at the end. Three edits: 2 subs + 1 ins.
- The DP table is `O(mn)` in space; the Hirschberg variant reduces this to `O(min(m, n))` with a divide-and-conquer scheme.
- The "match"/"sub"/"ins"/"del" tag list is a common way to render the edit script. For a human-readable diff, we'd also keep the original characters.
