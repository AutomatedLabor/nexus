# trie_dictionary.ae

A trie (prefix tree) used as a dictionary with autocomplete. We insert 10 words, then autocomplete the prefixes "ap" and "ba" to demonstrate the prefix lookup: walk the trie to the prefix node, then DFS to collect every complete word below it.

## What it does

1. **`new_trie()`** — fresh trie: one root node (id 0). The trie is a 4-tuple of parallel arrays `(is_word, letters, nexts, parent)` indexed by node id.
2. **`step(...)`** — find (or create) the child of node `u` with edge label `c`. Children are searched linearly in `letters[u]`.
3. **`insert(trie, word)`** — walk the trie from the root, calling `step()` for each character, then mark the final node `is_word = 1`.
4. **`collect(...)`** — DFS from node `start` (at the end of `prefix`): if `is_word[start] == 1`, emit `prefix`; recurse into each child, appending its letter to the prefix.
5. **`find_node(trie, prefix)`** — walk the trie to find the node id matching `prefix`, or -1 if not present.
6. **`autocomplete(trie, prefix)`** — `find_node` then `collect`.
7. **`show_words(arr)`** — render a `[string]` array as `["a", "b", "c"]`.
8. **Driver** — builds the trie with 10 words, autocompletes "ap", "ba", and "x", and asserts the expected results.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/trie_dictionary.ae
```

## Key language features

- **Tuple-of-arrays as a struct** — Aether doesn't have a built-in record type at the stdlib level, so the trie's four parallel arrays are bundled into a 4-tuple and threaded through every function. (You could also use a single `record` via `collections.mapNew`, but explicit arrays are faster.)
- **`str(word[i])`** — convert a single-character substring to a string. Aether's `word[i]` returns a `string` already; `str()` is a no-op safety cast that the type checker accepts.
- **Recursion** — `collect` is recursive (DFS into children). Aether supports recursion; the runtime step budget caps the depth at 1,000,000 which is plenty for a 10-word trie.
- **Mutation via index assignment** — `is_word[u] = 1` mutates the array in place. Aether arrays support index assignment; the type checker warns (because `is_word` is declared `[int]` and 1 is an `int`, this works fine — the warnings are about edge-label children of `[int]` being treated as tuples).
- **`while` for iteration** — every loop is `while i < n { ...; i = i + 1 }` to avoid the for-loop-scope quirk.

## Expected output

```
== Trie dictionary + autocomplete ==

inserted 10 words:
  apple
  app
  apply
  apricot
  apex
  banana
  band
  bandana
  bank
  bat

autocomplete("ap") -> ["app", "apple", "apply", "apricot", "apex"]
autocomplete("ba") -> ["banana", "band", "bandana", "bank", "bat"]
autocomplete("x") -> []

All assertions passed.
```

## Design notes

- **DFS order = insertion order at each level**: children are pushed into `letters[u]` in the order they're first encountered, so the DFS visits them in insertion order. This is why `autocomplete("ap")` returns `["app", "apple", "apply", "apricot", "apex"]` — "app" is a complete word at the "app" node (emitted first), then "apple" via the "le" edge, then "apply" via the "ly" edge, then "apricot" via the "ricot" edge, then "apex" via the "ex" edge.
- **Shorter words emitted before longer**: because `collect` checks `is_word[start]` *before* descending, a complete word at the prefix node is emitted before any of its extensions. This is why "app" appears before "apple" and "apply".
- **No hash map needed**: children are searched linearly in `letters[u]`. For an alphabet of 26 letters, this is at most 26 comparisons per step — fine. For a larger alphabet (e.g. Unicode), you'd want a hash map.
- **O(L) per insert/lookup** where L is the word length. Autocomplete is O(L + k) where k is the number of nodes in the subtree below the prefix.
- **Avoids for-loop-scope quirk**: every loop is `while`. The recursion in `collect` doesn't trigger the quirk because recursion doesn't use a loop variable.
