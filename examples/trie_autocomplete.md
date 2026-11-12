# trie_autocomplete.ae

A trie (prefix tree) for autocomplete. We insert words one letter
at a time, walking/creating child nodes. Each node tracks whether
a word ends here. For autocomplete, we descend to the prefix, then
DFS to collect all complete words below.

## What it does

1. The trie is stored as **4 parallel arrays** indexed by node id:
   - `is_word[id]`: 1 if this node marks the end of a word.
   - `letters[id]`: list of edge labels (single chars).
   - `nexts[id]`: list of child node ids (parallel to `letters`).
   - `parent[id]`: parent id, or -1 for root.
2. **`new_trie()`** — allocate the root node (id 0, no children).
3. **`step(...)`** — find (or create) the child of node `u` with
   edge label `c`. Linear scan over `letters[u]`; if not found,
   allocate a new node and append the edge.
4. **`insert(trie, word)`** — walk the trie letter by letter,
   creating nodes as needed; mark the final node `is_word = 1`.
5. **`collect(...)`** — recursive DFS from a node, accumulating
   the prefix string. Each time `is_word == 1`, emit the current
   prefix.
6. **`find_node(trie, prefix)`** — walk the trie matching `prefix`;
   return the node id or -1 if not present.
7. **`autocomplete(trie, prefix)`** — `find_node` then `collect`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/trie_autocomplete.ae
```

## Key language features

- **Parallel-array data layout** — Aether has no native hashmap,
  so we store the children as a parallel pair `(letters[u],
  nexts[u])`. The lookup is `O(alphabet size)` instead of `O(1)`,
  but that's fine for a 26-letter alphabet.
- **`str(word[i])`** to extract a single character as a string.
- **Recursive DFS** for `collect` — returns a list of words
  under the prefix.
- **Tuple-typed state**: the trie is the 4-tuple
  `([int], [[string]], [[int]], [int])`, threaded through every
  function.

## Expected output

```
== Trie autocomplete ==

inserted words:
  cat
  car
  card
  care
  careful
  dog
  do
  door

autocomplete("ca") -> ["cat", "car", "card", "care", "careful"]
autocomplete("car") -> ["car", "card", "care", "careful"]
autocomplete("do") -> ["do", "dog", "door"]
autocomplete("x") -> []

All assertions passed.
```

## Design notes

- The output order matches insertion order at each branch:
  "ca" expands to "cat" (inserted first), then "car", "card",
  "care", "careful" (sharing the "car" prefix). "do" expands to
  "do" (inserted first), then "dog", "door".
- The trie uses O(total chars) memory; for small dictionaries this
  is more than a flat array, but autocomplete is `O(prefix length
  + matching words)` instead of `O(N * prefix length)` for a
  linear scan.
- The parallel-array layout mirrors how you'd implement a trie
  in a low-level language like C: each node is a small struct of
  arrays. In Python or JS you'd use a dict instead; here we
  can't, so we go low-level.
