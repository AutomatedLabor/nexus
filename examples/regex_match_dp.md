# regex_match_dp.ae

Regex matching with `.` (any single char) and `*` (zero or more of the preceding element) via DP. We build a boolean DP table `dp[i][j]` meaning "does `s[0..i]` match the pattern `p[0..j]`?", then read off `dp[m][n]`.

## What it does

1. **`make2d(rows, cols)`** — fresh 2D array of zeros.
2. **`char_match(c, p)`** — returns 1 if `c == p` or `p` is `'.'` (char code 46), else 0.
3. **`regex_match(s, p)`** — DP fill:
   - `dp[0][0] = 1` (empty string matches empty pattern).
   - For `dp[0][j]` (empty string vs pattern): if `p[j-1] == '*'`, propagate `dp[0][j-2]` (zero occurrences of the starred element).
   - For `dp[i][j]` with `i ≥ 1`:
     - If `p[j-1] == '*'`: take the max of (a) zero occurrences: `dp[i][j-2]`, and (b) one-or-more: if `char_match(s[i-1], p[j-2]) == 1`, `dp[i-1][j]`.
     - Else: `char_match(s[i-1], p[j-1]) == 1` AND `dp[i-1][j-1]`.
4. **Driver** — prints several test cases with expected results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/regex_match_dp.ae
```

## Key language features

- **`charCode(s, i)`** — int code of the character at index `i`. Used to compare with literal char codes (e.g., `42` for `'*'`, `46` for `'.'`).
- **`while` for every loop** — sidesteps the for-loop-scope quirk.
- **`if cond { ... } else { ... };`** — closing brace of an if-else block must be followed by `;` when followed by another statement.

## Expected output

```
== Regex match (. and *) ==

  "aa" ~ "a" -> no
  "aa" ~ "a*" -> yes
  "ab" ~ ".*" -> yes
  "aab" ~ "c*a*b" -> yes
  "mississippi" ~ "mis*is*p*." -> no
  "mississippi" ~ "mis*is*ip*." -> yes
  "" ~ "a*" -> yes
  "" ~ "a" -> no
  "bbbba" ~ ".*a*a" -> yes
  "ab" ~ ".*c" -> no

All assertions passed.
```

## Design notes

- `"a*"` matches `"aa"` because `*` allows zero or more `a`s.
- `".*"` matches anything because `.` matches any char and `*` repeats it.
- `"c*a*b"` matches `"aab"` because `c*` matches zero `c`s, `a*` matches two `a`s, and `b` matches the final `b`.
- `"mis*is*ip*."` matches `"mississippi"`: `m`, `i`, `s*` (4 s's), `i`, `s*` (2 s's), `i`, `p*` (1 p), `.` (final i).
- Complexity: `O(m * n)` time and space.
- This implementation handles `.` and `*` only; supporting `+`, `?`, `[]`, `()` requires either a regex engine (NFA) or a more complex DP.
