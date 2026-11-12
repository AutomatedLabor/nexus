# aho_corasick2 — Aho-Corasick (Textbook Example)

Aho-Corasick multi-pattern string search on the textbook
example from Aho & Corasick's 1975 paper — a different pattern
set from `aho_corasick.ae` (which searches `["he", "she", "his"]`
in `"ushers"`).

## What it does

Searches for the patterns `["a", "ab", "bab", "bc", "bca", "c", "caa"]`
in the text `"abccab"`. The pattern set is interesting because:

- `"a"` is a prefix of `"ab"` — overlapping patterns.
- `"ab"` and `"bab"` share `"ab"` as a suffix — shared suffixes
  make the failure-link construction non-trivial.
- `"bc"` and `"bca"` share `"bc"` as a prefix —
  trie depth matters.

## Output

```
== Aho-Corasick multi-pattern search (textbook example) ==

patterns: [a, ab, bab, bc, bca, c, caa]
text:     "abccab"

trie has 11 nodes
built failure links

matches: ["a"@0, "ab"@0, "bc"@1, "c"@2, "c"@3, "a"@4, "ab"@4]
```

Seven matches total:
- `"a"` at positions 0 and 4 (the two 'a' chars).
- `"ab"` at positions 0 and 4 (the two `"ab"` substrings).
- `"bc"` at position 1 (`"bcc..."` — the 'bc' at indices 1-2).
- `"c"` at positions 2 and 3 (the two consecutive 'c' chars).

The pattern `"bab"`, `"bca"`, and `"caa"` don't occur in
`"abccab"`.

## Algorithm

Same as `aho_corasick.ae`:

1. **Build the trie** from the patterns. Each node has children
   (array of `[char, node_index]` pairs), a `fail` link, and an
   `outputs` list (pattern indices that end at this node).
2. **Build failure links** via BFS. For each node, its fail
   link points to the longest proper suffix of the current
   path that's also a prefix of some pattern.
3. **Search** the text in a single linear scan. At each char,
   follow child or failure links; when landing on a node with
   outputs, report a match for each output pattern.

## Implementation notes

- Trie nodes use array indices (not pointers) for stable
  references across the BFS.
- The BFS uses a manual queue (an array of node indices
  processed with `while`).
- All iteration uses `while` with explicit indices (no `for`
  loops).

## Sanity assertions

The example verifies:
- the total match count is 7;
- per-pattern counts: `"a"` occurs 2 times, `"ab"` occurs 2
  times, `"bc"` occurs 1 time, `"c"` occurs 2 times.

This matches the textbook output.

## See also

- `aho_corasick.ae` — the canonical `["he", "she", "his"]` in
  `"ushers"` example.
