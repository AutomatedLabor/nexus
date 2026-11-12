# word_break.ae

Word break DP. Given a string `s` and a dictionary of valid words, decide whether `s` can be segmented into a sequence of dictionary words. We build a boolean DP table `dp[i]` meaning "s[0..i] can be segmented" and reconstruct the word sequence when possible.

## What it does

1. **`repeat_bool(n)`** — fresh array of `n` zeros (used as booleans).
2. **`in_dict(dict, word)`** — linear-scan dictionary lookup; returns 1 if `word` is in `dict`, 0 otherwise.
3. **`substr(s, start, end)`** — wraps `strSlice(s, start, end)`.
4. **`word_break(s, dict)`** — DP fill:
   - `dp[0] = 1` (empty prefix is segmentable).
   - For each `i ∈ [1, n]` and `j ∈ [0, i)`: if `dp[j] == 1` and `s[j..i]` is in dict, set `dp[i] = 1`, record `prev[i] = j`, break inner loop.
5. **`reconstruct(s, prev, n)`** — walk back from `prev[n]` to `prev[0]`, building the word list in forward order.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/word_break.ae
```

## Key language features

- **`strSlice(s, start, end)`** — substring from `start` (inclusive) to `end` (exclusive).
- **`while` for every loop** — outer over end index, inner over start index.
- **Early break in inner loop** — once we've found a valid segmentation for `dp[i]`, we set `j = i` to break out of the inner `while j < i` loop.
- **`if cond { ... };` after if** — required when followed by another statement.

## Expected output

```
== Word break ==

  "leetcode" dict=[leet, code] -> yes, segmentation=[leet, code]
  "applepenapple" dict=[apple, pen] -> yes, segmentation=[apple, pen, apple]
  "catsandog" dict=[cats, dog, sand, and, cat] -> no
  "aaaaaaa" dict=[aaaa, aa] -> no
  "abc" dict=[a, b, c] -> yes, segmentation=[a, b, c]

All assertions passed.
```

## Design notes

- For `"leetcode"` with `["leet", "code"]`, segmentation is `["leet", "code"]`.
- For `"catsandog"` with `["cats", "dog", "sand", "and", "cat"]`, no segmentation exists — `"og"` isn't a word, so the DP can't reach `dp[9] = 1`.
- For `"aaaaaaa"` (length 7) with `["aaaa", "aa"]`, no segmentation exists: we'd need a 1-length word to fill the last char. Adding `"a"` to the dict makes it segmentable.
- `O(n²)` time per string lookup (substring + dict scan); for large inputs, use a trie.
- The DP table is `O(n)` in space; the `prev` array enables reconstruction.
