# shortest_common_superseq.ae

Shortest Common Supersequence (SCS) of two strings. The SCS is the shortest string that contains both `s1` and `s2` as subsequences. We compute it by reusing the LCS DP table (since `scs_len = m + n − lcs_len`) and walking back, choosing characters from either string when they differ.

## What it does

1. **`make2d(rows, cols, init)`** — fresh 2D array.
2. **`lcs_table(s1, s2)`** — fills the LCS length table (same as `longest_common_subseq.ae`).
3. **`scs_reconstruct(s1, s2)`**:
   - Start at `(m, n)`.
   - If `s1[i-1] == s2[j-1]`, prepend the char, move diagonally.
   - Else if `dp[i-1][j] > dp[i][j-1]`, take `s1[i-1]`, move up.
   - Else take `s2[j-1]`, move left.
   - When one side is exhausted, prepend remaining chars from the other.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/shortest_common_superseq.ae
```

## Key language features

- **`charCode(s, i)`** for character equality.
- **`s[i-1] + out`** — string concat where `s[i-1]` is the 1-char string at that index; this prepends the character to the growing result.
- **`if cond { ... } else { ... };`** — closing brace of an if-else block must be followed by `;` when the next line is another statement.
- **`while` for every loop** — sidesteps the for-loop-scope quirk.

## Expected output

```
== Shortest Common Supersequence ==

  "abac" + "cab": SCS = "cabac"  (length 5)
  "AGGTAB" + "GXTXAYB": SCS = "AGGXTXAYB"  (length 9)
  "abc" + "abc": SCS = "abc"  (length 3)
  "abc" + "xyz": SCS = "abcxyz"  (length 6)
  "" + "abc": SCS = "abc"  (length 3)

All assertions passed.
```

## Design notes

- `scs_len = m + n − lcs_len`: the SCS interleaves the two strings, reusing characters that are common to both.
- For `"abac"` and `"cab"`, LCS is `"ab"` (length 2), so SCS length is `4 + 3 − 2 = 5`. The SCS `"cabac"` contains both `"abac"` (C, A, B, A, C — skip C, A, B, A, C) and `"cab"` (C, A, B, A, C — first 3 chars).
- For `"AGGTAB"` and `"GXTXAYB"`, LCS is `"GTAB"` (length 4), so SCS length is `6 + 7 − 4 = 9`.
- The reconstruction uses the same LCS DP table, so SCS and LCS share the table-building code.
