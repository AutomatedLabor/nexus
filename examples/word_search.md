# word_search.ae

Word search: given an M x N grid of characters and a word,
return true if the word can be constructed by traversing
adjacent cells (horizontally or vertically) without reusing
a cell.

## What it does

1. **`get(g, cols, r, c)`** — index helper for the flat
   row-major grid of single-char strings.
2. **`dfs(g, rows, cols, r, c, word, index)`** — recursive DFS:
   - If `index >= len(word)`, the word is matched.
   - If out of bounds, return false.
   - If `grid[r][c] != word[index]`, return false.
   - Otherwise: mark the cell as visited by replacing it with
     the sentinel `"#"`, recurse into the four directions, then
     restore the original cell value (so the parent's search
     doesn't see the sentinel).
3. **`exists(g, rows, cols, word)`** — try every starting cell;
   return true if any DFS succeeds.
4. **Driver** — runs the search for six words on a 3x4 grid,
   then asserts ten sub-results including 1x1 cases and the
   "empty word matches" edge case.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/word_search.ae
```

## Key language features

- **Recursive DFS** — Aether handles recursion fine, the only
  worry is the v1 evaluator's step limit (default 1M), which we
  stay well under.
- **In-place visited marking** via `g[r * cols + c] = "#"`
  followed by `g[r * cols + c] = saved` on the way out — avoids
  allocating a separate `visited` array.
- **`up || down || left || right`** — boolean short-circuit
  (`||` returns true/false in Aether's v1 evaluator).
- **`str(word[index])`** — extract a single-char string at
  position `index` (which is itself an int).

## Expected output

```
== Word search ==

Grid 3x4:
ABCE
SFCS
ADEE

  word "ABCCED"  ->  true
  word "SEE"  ->  true
  word "ABCB"  ->  false
  word "ADEE"  ->  true
  word "ABC"  ->  true
  word "ASADEE"  ->  true

Headline: exists("ABCCED") = true

All assertions passed.
```

## Design notes

- The `"ABCCED"` path is `A(0,0) -> B(0,1) -> C(0,2) -> C(1,2) -> E(2,2) -> D(2,1)`.
- `"ABCB"` fails because the only `C` reachable from `A-B` is
  `(0,2)` or `(1,2)`, and neither is adjacent to a second `B`.
- `"ASADEE"` succeeds via `A(0,0) -> S(1,0) -> A(2,0) -> D(2,1) -> E(2,2) -> E(2,3)`.
- The 1x1 grid with `A` matches the empty word (the trivial
  empty path is always a match).
- The 2x2 grid `["A", "B", "C", "D"]` (laid out as `[[A,B],[C,D]]`)
  fails `"ABCD"` because after `A-B` you can't reach `C-D` without
  reusing a cell.
- Fully clean compile (`ok = true`).
