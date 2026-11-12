# longest_common_subseq.ae

Longest Common Subsequence (LCS) of two strings via DP. We build an `(m+1) × (n+1)` table where `dp[i][j]` is the LCS length of `s1[0..i]` and `s2[0..j]`. We then walk back from `dp[m][n]` to reconstruct the actual subsequence.

## What it does

1. **`make2d(rows, cols, init)`** — fresh 2D array.
2. **`lcs_length(s1, s2)`** — DP fill:
   - `dp[i][j] = dp[i-1][j-1] + 1` if `s1[i-1] == s2[j-1]`.
   - Else `dp[i][j] = max(dp[i-1][j], dp[i][j-1])`.
3. **`lcs_reconstruct(dp, s1, s2)`** — walk back from `(m, n)`:
   - If `s1[i-1] == s2[j-1]`, prepend the char, move diagonally.
   - Else move to whichever cell has the larger value.
4. **Driver** — prints LCS for several string pairs.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/longest_common_subseq.ae
```

## Key language features

- **`charCode(s, i)`** — int code of the character at index `i`, used for character equality.
- **`s[i]`** — 1-character string at index `i`. Used for building the result string via `s1[i-1] + out` (string concat with a 1-char prefix).
- **`if cond { ... } else { ... };`** — closing brace of an if-else block must be followed by `;` when followed by another statement.

## Expected output

```
== Longest Common Subsequence ==

  "ABCBDAB" / "BDCAB": LCS = "BDAB"  (length 4)
  "AGGTAB" / "GXTXAYB": LCS = "GTAB"  (length 4)
  "abc" / "abc": LCS = "abc"  (length 3)
  "" / "abc": LCS = ""  (length 0)
  "xyz" / "abc": LCS = ""  (length 0)

All assertions passed.
```

## Design notes

- For `"ABCBDAB"` vs `"BDCAB"` the LCS is `"BDAB"` (length 4). There may be multiple LCSs of the same length; the reconstruction returns one.
- `O(mn)` time and space. The Hirschberg optimization reduces space to `O(min(m, n))` while still producing the actual subsequence.
- The walk-back picks `dp[i-1][j] > dp[i][j-1]` to move up; ties go left. The result is deterministic but not canonical.
