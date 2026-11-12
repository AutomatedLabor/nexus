/**
 * Aether stdlib — `trie` module.
 *
 * A trie (prefix tree) — a tree-shaped data structure for storing
 * strings where common prefixes are shared.  Tries shine for
 * prefix-based queries: "find all words starting with X", "find the
 * longest prefix of Y that's in the trie", autocomplete.  Lookup,
 * insert, and prefix-search are all O(L) where L is the string
 * length, independent of the number of stored words.
 *
 * Implementation: each node has a Map<char, childNode> and a
 * boolean "isEnd" flag.  The root represents the empty string; a
 * path from root to a node represents a prefix; an "isEnd" node
 * represents a complete word.
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrieNode {
  /** child char → child node */
  children: Map<string, TrieNode>;
  /** true if this node marks the end of a complete word */
  isEnd: boolean;
}

export interface Trie {
  root: TrieNode;
  /** Number of complete words stored (not the number of nodes). */
  size: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function newNode(): TrieNode {
  return { children: new Map(), isEnd: false };
}

export function trieNew(): Trie {
  return { root: newNode(), size: 0 };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Insert a word into the trie.  If the word is already present,
 *  this is a no-op (the size doesn't change). */
export function trieInsert(trie: Trie, word: string): void {
  assertTrie(trie, "trieInsert");
  assertString(word, "trieInsert");
  let node = trie.root;
  for (const ch of word) {
    let child = node.children.get(ch);
    if (!child) {
      child = newNode();
      node.children.set(ch, child);
    }
    node = child;
  }
  if (!node.isEnd) {
    node.isEnd = true;
    trie.size++;
  }
}

/** Returns true if the exact word is in the trie. */
export function trieSearch(trie: Trie, word: string): boolean {
  assertTrie(trie, "trieSearch");
  assertString(word, "trieSearch");
  const node = findNode(trie.root, word);
  return node !== null && node.isEnd;
}

/** Returns true if any word in the trie starts with the given prefix. */
export function trieStartsWith(trie: Trie, prefix: string): boolean {
  assertTrie(trie, "trieStartsWith");
  assertString(prefix, "trieStartsWith");
  return findNode(trie.root, prefix) !== null;
}

/** Delete a word from the trie.  Returns true if the word was present
 *  (and is now removed); false if it wasn't there. */
export function trieDelete(trie: Trie, word: string): boolean {
  assertTrie(trie, "trieDelete");
  assertString(word, "trieDelete");
  const r = deleteNode(trie, trie.root, word, 0);
  return r.found;
}

/** Returns all complete words in the trie, in lexicographic order. */
export function trieWords(trie: Trie): string[] {
  assertTrie(trie, "trieWords");
  const out: string[] = [];
  collectWords(trie.root, "", out);
  return out;
}

/** Number of complete words in the trie. */
export function trieSize(trie: Trie): number {
  assertTrie(trie, "trieSize");
  return trie.size;
}

/** Longest word in the trie that is a prefix of `s`.  Returns the
 *  empty string if no such word exists. */
export function trieLongestPrefix(trie: Trie, s: string): string {
  assertTrie(trie, "trieLongestPrefix");
  assertString(s, "trieLongestPrefix");
  let node = trie.root;
  let longest = "";
  let current = "";
  for (const ch of s) {
    const child = node.children.get(ch);
    if (!child) break;
    current += ch;
    if (child.isEnd) longest = current;
    node = child;
  }
  return longest;
}

/** Returns all words in the trie that start with the given prefix.
 *  If no word matches, returns an empty array.  Results are in
 *  lexicographic order. */
export function trieAutocomplete(trie: Trie, prefix: string): string[] {
  assertTrie(trie, "trieAutocomplete");
  assertString(prefix, "trieAutocomplete");
  const start = findNode(trie.root, prefix);
  if (!start) return [];
  const out: string[] = [];
  collectWords(start, prefix, out);
  return out;
}

/** Count the number of words in the trie that start with the given
 *  prefix.  Equivalent to `trieAutocomplete(trie, prefix).length`
 *  but doesn't allocate the array. */
export function trieCount(trie: Trie, prefix: string): number {
  assertTrie(trie, "trieCount");
  assertString(prefix, "trieCount");
  const start = findNode(trie.root, prefix);
  if (!start) return 0;
  return countWords(start);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNode(root: TrieNode, s: string): TrieNode | null {
  let node = root;
  for (const ch of s) {
    const child = node.children.get(ch);
    if (!child) return null;
    node = child;
  }
  return node;
}

function collectWords(node: TrieNode, prefix: string, out: string[]): void {
  if (node.isEnd) out.push(prefix);
  // Sort keys for deterministic lexicographic order.
  const keys = Array.from(node.children.keys()).sort();
  for (const ch of keys) {
    collectWords(node.children.get(ch)!, prefix + ch, out);
  }
}

function countWords(node: TrieNode): number {
  let n = node.isEnd ? 1 : 0;
  for (const child of node.children.values()) {
    n += countWords(child);
  }
  return n;
}

/** Recursive delete helper.
 *  Returns `{ found, canPrune }`: `found` is true iff the word was
 *  present and has been removed (and `trie.size` decremented).
 *  `canPrune` is true iff the caller can remove this node from its
 *  parent's children (i.e., this node is no longer an end and has
 *  no children of its own). */
function deleteNode(
  trie: Trie,
  node: TrieNode,
  word: string,
  depth: number,
): { found: boolean; canPrune: boolean } {
  if (depth === word.length) {
    if (!node.isEnd) return { found: false, canPrune: false };
    node.isEnd = false;
    trie.size--;
    return { found: true, canPrune: node.children.size === 0 };
  }
  const ch = word[depth];
  const child = node.children.get(ch);
  if (!child) return { found: false, canPrune: false };
  const r = deleteNode(trie, child, word, depth + 1);
  if (r.canPrune) {
    node.children.delete(ch);
  }
  // We can prune `node` only if it's not an end and has no children
  // (but we don't prune the root).
  const canPrune = !node.isEnd && node.children.size === 0 && depth > 0;
  return { found: r.found, canPrune };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "trie",
  fns: [
    { name: "trieNew", sig: "() -> Trie", desc: "Create a new empty trie." },
    { name: "trieInsert", sig: "(t: Trie, word: string) -> void", desc: "Insert a word (no-op if already present)." },
    { name: "trieSearch", sig: "(t: Trie, word: string) -> bool", desc: "True if the exact word is in the trie." },
    { name: "trieStartsWith", sig: "(t: Trie, prefix: string) -> bool", desc: "True if any word starts with the given prefix." },
    { name: "trieDelete", sig: "(t: Trie, word: string) -> bool", desc: "Remove a word; returns whether it was present." },
    { name: "trieWords", sig: "(t: Trie) -> string[]", desc: "All words in lexicographic order." },
    { name: "trieSize", sig: "(t: Trie) -> int", desc: "Number of complete words stored." },
    { name: "trieLongestPrefix", sig: "(t: Trie, s: string) -> string", desc: "Longest word in the trie that is a prefix of s (empty string if none)." },
    { name: "trieAutocomplete", sig: "(t: Trie, prefix: string) -> string[]", desc: "All words starting with the prefix, lexicographically." },
    { name: "trieCount", sig: "(t: Trie, prefix: string) -> int", desc: "Number of words starting with the prefix." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("trieNew", trieNew);
  registerBuiltin("trieInsert", trieInsert);
  registerBuiltin("trieSearch", trieSearch);
  registerBuiltin("trieStartsWith", trieStartsWith);
  registerBuiltin("trieDelete", trieDelete);
  registerBuiltin("trieWords", trieWords);
  registerBuiltin("trieSize", trieSize);
  registerBuiltin("trieLongestPrefix", trieLongestPrefix);
  registerBuiltin("trieAutocomplete", trieAutocomplete);
  registerBuiltin("trieCount", trieCount);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertTrie(x: any, fn: string): asserts x is Trie {
  if (typeof x !== "object" || x === null ||
      typeof x.root !== "object" || x.root === null ||
      !(x.root.children instanceof Map) ||
      typeof x.size !== "number") {
    throw new Error(fn + ": expected Trie, got " + kind(x));
  }
}

function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") {
    throw new Error(fn + ": expected string, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
