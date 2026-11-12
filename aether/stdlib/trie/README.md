# Aether stdlib — `trie`

The `trie` module implements a **trie** (prefix tree) — a tree-
shaped data structure for storing strings where common prefixes
are shared.  Tries are the right tool for prefix-based queries:
"find all words starting with X" (autocomplete), "find the
longest prefix of Y that's in the trie" (URL routing), and
membership testing at O(L) where L is the string length (independent
of how many words are stored).

## Why a trie?

A trie stores "apple", "app", "application" by sharing the "app"
prefix — three words in a tree with one path for "app" and two
branches (one to "le", one to "lication").  Lookup is O(L) (walk
down the tree); insert is O(L); prefix search is O(L + matches)
(walk down to the prefix, then collect all words below).  For
large sets of strings with shared prefixes (URLs, usernames,
dictionary words), the trie's space and time are both better than
a hash set's.

## Construction

`trieNew()` creates a fresh empty trie.  No capacity parameter —
a trie grows as you insert.

```aether
let t = trie.trieNew()
```

## Insert and search

`trieInsert(t, word)` adds a word.  If the word is already present,
the insert is a no-op (the size doesn't change).  `trieSearch(t,
word)` returns true iff the exact word is in the trie.  Both work
on the empty string too (inserting "" creates an "end-of-word"
marker at the root).

```aether
trie.trieInsert(t, "apple")
trie.trieInsert(t, "app")
trie.trieInsert(t, "application")
trie.trieSearch(t, "apple")       // true
trie.trieSearch(t, "app")         // true
trie.trieSearch(t, "appl")        // false — "appl" is a prefix, not a word
trie.trieSearch(t, "apples")      // false
```

## Prefix queries

`trieStartsWith(t, prefix)` returns true if any word in the trie
starts with the given prefix (i.e., the prefix corresponds to a
path in the trie, possibly ending mid-word).  `trieLongestPrefix(t,
s)` returns the longest word in the trie that is a prefix of `s`
(or the empty string if no word is a prefix).

```aether
trie.trieStartsWith(t, "app")     // true (apple, app, application all start with "app")
trie.trieStartsWith(t, "appl")    // true (apple, application)
trie.trieStartsWith(t, "banan")   // false
trie.trieLongestPrefix(t, "applesauce")  // "apple"
trie.trieLongestPrefix(t, "apx")         // "app" — wait, no: "apx" has no "p" path? actually...
```

(Quick check: "apx" — the trie has "a", "p", "p" then branches.
"x" is not a child of the second "p", so the walk stops at "app",
but "app" is a word, so `trieLongestPrefix` returns "app".)

## Autocomplete

`trieAutocomplete(t, prefix)` returns all words in the trie that
start with the given prefix, in lexicographic order.  This is the
canonical autocomplete operation: the user types "app", you show
them ["app", "apple", "application"].  `trieCount(t, prefix)`
returns the count without materializing the array (useful for
"X results" displays).

```aether
trie.trieAutocomplete(t, "app")  // ["app", "apple", "application"]
trie.trieCount(t, "app")         // 3
trie.trieAutocomplete(t, "ban")  // [] (no match)
```

## Deletion and listing

`trieDelete(t, word)` removes a word; returns true if it was
present (and is now removed), false otherwise.  After deletion,
unused interior nodes are pruned (so the trie stays compact).
`trieWords(t)` returns all complete words in lexicographic order.
`trieSize(t)` returns the count.

```aether
trie.trieDelete(t, "apple")     // true
trie.trieSearch(t, "apple")     // false
trie.trieSearch(t, "app")       // true (still there)
trie.trieWords(t)               // ["app", "application"] (sorted)
trie.trieSize(t)                // 2
```

## Implementation notes

Each node has a `Map<char, TrieNode>` for its children and an
`isEnd` boolean.  The root represents the empty string.  Walking
down the tree follows the path of the input string's chars; at
each step we look up the char in the current node's children.
`collectWords` walks the subtree in lexicographic order (sorting
keys at each node — necessary because `Map` iteration order is
insertion order, not sort order).  `deleteNode` is a post-order
recursive prune: after unmarking the end, if the node has no
children, the caller can remove it from its parent's children.

For very large alphabets (e.g., Unicode strings), a sorted-array-
of-(char, child) pairs or a hash table would beat a `Map` on
memory; for the common case of ASCII identifiers (URLs, code,
usernames), `Map` is plenty fast.

## When to use a trie vs a set

Use a trie when:

- You need prefix queries ("words starting with X") — a hash set
  can't do this efficiently.
- You need longest-prefix matching (URL routing) — a trie is O(L);
  a hash set requires O(L²) substring checks.
- You need autocomplete — a trie gives you all matches in one
  walk.

Use a hash set (`set`) when:

- You only need exact membership — a hash set is O(1) average
  vs the trie's O(L).
- Memory is tight — a hash set has lower per-entry overhead (the
  trie shares prefixes, but the per-node `Map` overhead adds up).
- You don't need any prefix operations.

## Common patterns

- **Autocomplete**: `let dict = trie.trieNew(); for word in
  dictionary: trie.trieInsert(dict, word); let suggestions =
  trie.trieAutocomplete(dict, userInput)`.
- **URL routing**: `let routes = trie.trieNew(); for path in
  routeTable: trie.trieInsert(routes, path); let best =
  trie.trieLongestPrefix(routes, requestPath)`.
- **Spell-check**: `let words = trie.trieNew(); for word in
  dictionary: trie.trieInsert(words, word); let isWord =
  trie.trieSearch(words, candidate)`.
- **IP routing**: store prefixes (e.g., "192.168.0.0/16") as
  trie paths; longest-prefix-match gives the most-specific route.

## Caveats

- The trie stores strings, not byte arrays; chars are JS
  UTF-16 code units.  For most use cases (ASCII, common Unicode)
  this is fine, but combining-character sequences may behave
  unexpectedly.
- The trie doesn't support wildcards in queries (e.g., "app?e")
  — use `regex` for that.
- The trie doesn't persist; v2 may add serialization.

The whole module is 10 functions, ~220 lines of TypeScript, no
dependencies.  Wired in by `registerAll` in `aether/stdlib/index.ts`.
