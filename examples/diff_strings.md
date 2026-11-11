# diff_strings.ae

A line-oriented diff utility based on the longest common
subsequence (LCS) of the two input strings' lines. Given two
multi-line strings, it emits a unified-diff-style output
marking each line as common (` `), removed (`-`), or added
(`+`).

## What it does

1. **`split_lines(s)`** — splits a string on `\n`, omitting a
   trailing empty line if the input ends with a newline.
2. **`lcs_table(a, b)`** — builds the classical DP table:
   `dp[i][j] =` length of LCS of `a[0..i)` and `b[0..j)`.
   Stored as a flat row-major int array of size
   `(rows+1) × (cols+1)`.
3. **`diff_strings(a, b)`** — splits both inputs into lines,
   builds the DP table, then walks it from the bottom-right
   corner back to the top-left, emitting tuples in reverse:
   - If `a[i-1] == b[j-1]`: emit `(" ", line)`, move diagonally.
   - Else if moving left keeps the LCS length: emit
     `("+", b[j-1])`, move left.
   - Else: emit `("-", a[i-1])`, move up.
   Then reverses the result.
4. **`show_diff(diff)`** — renders the diff as a printable
   string with kind prefixes.
5. **Driver** — runs five tests: insert a line, delete a
   line, no common lines (complete rewrite), identical
   strings, and a small poem edit. Each test prints A, B,
   and the diff.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/diff_strings.ae
```

## Key language features

- **Flat row-major DP table** — `table[i * (cols+1) + j]`
  emulates a 2D array using a single 1D `[int]`. `dp_get` and
  `dp_set` helpers handle the index arithmetic.
- **Tuple construction** — `(" ", line)`, `("-", line)`,
  `("+", line)`.
- **Reversal via `while k >= 0`** — walk the reversed list
  back-to-front, pushing into a new list.
- **Nested `while` loops** for the DP fill (outer over rows,
  inner over cols).

## Expected output

```
== String diff (LCS-based) ==

Test 1: insert a line in the middle
--- A ---
alpha
beta
gamma
--- B ---
alpha
beta
delta
gamma
--- diff ---
  alpha
  beta
+ delta
  gamma
All assertions passed.
```

## Design notes

The DP table is `O(rows × cols)` in memory and time — fine
for short inputs, but for large files a Myers diff algorithm
or a Hunt–Szymanski variant would be more efficient. The
backtracking step uses a `safety` counter to guarantee
termination even if the table is somehow inconsistent. The
"insert before delete" tie-breaking in the backtrack (we
prefer emitting `+` first when both moves give equal LCS
length) makes the output match `diff`-style expectations
more closely.
