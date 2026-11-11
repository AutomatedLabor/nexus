# huffman_compress.ae

Huffman coding: builds a variable-length prefix code from
character frequencies. More frequent characters get shorter
codes, so the encoded bit string is shorter than the
fixed-width original. The classic example
`"aaabbc"` produces `a="0"`, `c="10"`, `b="11"` — 9 bits total
vs 48 bits at 8 bits per char.

## What it does

1. **`count_freqs(s)`** — counts character frequencies,
   returning a list of `(char, count)` tuples.
2. **Min-heap of node indices** — `heap_push`, `heap_pop`,
   `heap_sift_up`, `heap_sift_down` maintain a binary heap
   of indices into parallel arrays `weights`, `lefts`,
   `rights`, `chars`. The comparator orders by
   `weights[heap[idx]]`.
3. **`build_huffman(s)`** — pushes all leaves onto the heap,
   then repeatedly pops two smallest, merges them into an
   internal node (sum of weights), and pushes back. Special
   case: if only one unique character exists, the code is
   `"0"` (single bit).
4. **`walk_codes(node, prefix)`** — recursive traversal that
   builds `(char, code)` tuples. Left = `"0"`, right = `"1"`.
5. **`huffman_encode(s)`** — builds the tree, walks it for
   codes, then for each input char emits its code. Returns
   the bit string.
6. **`huffman_decode(bitstr, root)`** — walks the tree
   bit-by-bit until a leaf is reached, emitting the leaf's
   char, then resets to root for the next char.
7. **Driver** — builds the codes for `"aaabbc"`, prints each
   char's frequency and code, prints the encoded bit string,
   and runs four more examples (`"hello world"`,
   `"mississippi"`, etc.) showing bit-count savings. Then
   verifies the round-trip `decode(encode(s)) == s`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/huffman_compress.ae
```

## Key language features

- **Module-level `let mut` arrays** — `weights`, `lefts`,
  `rights`, `chars`, and `heap` are mutated by helpers.
  `build_huffman` clears them in-place at the start (using
  `pop` in a while loop) so the function can be called
  multiple times.
- **Recursive tree walk** — `walk_codes(node, prefix)` returns
  a `[tuple]` list, with leaves returning `[(char, prefix)]`
  and internal nodes returning `from_l + from_r` (array
  concatenation).
- **Insertion sort with a `keep_going` flag** — sorts codes
  by (length, char) for pretty printing.
- **`while` loops with explicit indices** throughout, to
  dodge the v1 for-loop-scope quirk.

## Expected output

```
== Huffman coding ==

input: "aaabbc"

character frequencies and codes:
  'a' (occurs 3x): code = 0  (length 1)
  'b' (occurs 2x): code = 11  (length 2)
  'c' (occurs 1x): code = 10  (length 2)

encoded bit string: 000111110
encoded length: 9 bits
round-trip: decode(encode("aaabbc")) = "aaabbc"
All assertions passed.
```

## Design notes

The heap is **index-based** (the heap stores node indices,
not the nodes themselves) so the parallel arrays can grow
freely without invalidating existing indices. The decode
function rebuilds the tree because `huffman_encode` clears
the global arrays; a production version would thread the
tree explicitly through the encode/decode pair.
