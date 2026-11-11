# Aether stdlib — `tree`

The `tree` module works on a simple n-ary tree shape: every node is `{ value, children: [] }`. The module gives you constructors (`treeNew`, `treeAddChild`, `treeFromEdges`), accessors (`treeValue`, `treeChildren`, `treeIsLeaf`), shape queries (`treeSize`, `treeDepth`, `treeHeight`), higher-order transforms (`treeMap`, `treeFilter`, `treeFind`, `treePath`, `treeFlatten`), traversals (`treeWalk`/`treeDfs`/`treeBfs`), display helpers (`treePrint`, `treeToString`), and structural equality (`treeEquals`). Every function is a pure TypeScript implementation; throwing a plain `Error` from a builtin becomes an Aether panic.

## Why this shape?

A n-ary tree (each node has a value and a list of child nodes) is the simplest tree shape that covers most real uses: file-system hierarchies, HTML/XML DOM, ASTs, decision trees, organizational charts. The single `value` field keeps the type simple and means `treeMap`/`treeFilter` can be total functions; if you need richer per-node data, store it in `value` (an object, a tuple, anything).

## Conventions

- **The shape is `{ value, children: TreeNode[] }`.** Both fields must be present; `children` must be an array. Anything else panics with `treeX: expected tree node, got ...`.
- **`treeAddChild` mutates** the parent (pushes onto `children`) and returns the new child. All other functions are non-mutating: `treeMap`/`treeFilter` build fresh trees, `treeFlatten`/`treePrint`/`treeToString` produce new strings/arrays.
- **Traversals are pre-order** by default (`treeWalk`, `treeDfs`, `treeFlatten`, `treeFind`, `treePath`). `treeBfs` is the only breadth-first one.
- **`treeFilter` is shape-preserving.** A node whose value fails the predicate is kept *if any of its descendants pass* — the structure down to the matching descendant stays intact. A node with no passing descendants and a failing value itself is dropped. This matches what you want for "show me the part of the filesystem containing large files": you keep the directories along the way.
- **Values are compared by deep equality** in `treeEquals` — so two trees with the same structure and deeply-equal values (numbers, strings, arrays, plain objects) are equal.

## Construction and accessors

`treeNew(v)` creates a leaf node with value `v` and an empty `children` array. `treeAddChild(t, v)` appends a new child to `t` (mutating it) and returns the new child for convenience chaining. `treeValue(t)` returns the value, `treeChildren(t)` returns the children array by reference (mutating the array mutates the tree — useful for in-place construction). `treeIsLeaf(t)` is `children.length === 0`.

```aether
let root = tree.treeNew("root")
tree.treeAddChild(root, "a")       // returns the "a" child
tree.treeAddChild(root, "b")       // returns the "b" child
tree.treeValue(root)               // "root"
tree.treeChildren(root).length    // 2
tree.treeIsLeaf(root)              // false
tree.treeIsLeaf(tree.treeNew("x")) // true
```

## Shape queries

`treeSize(t)` is the number of nodes (root included). `treeDepth(t)` is the number of *nodes* on the longest root-to-leaf path (root counts as 1). `treeHeight(t)` is the number of *edges* on the longest path (root = 0). The two are related by `height = depth - 1`; we expose both because both are conventional in different textbooks.

```aether
tree.treeSize(tree.treeNew("x"))   // 1
tree.treeDepth(tree.treeNew("x")) // 1
tree.treeHeight(tree.treeNew("x")) // 0
// For a 3-level tree (root -> a -> a1), size=5, depth=3, height=2
```

## Higher-order transforms

`treeMap(t, fn)` returns a new tree whose every value is `fn(value)` — perfect for label rewrites (e.g. adding a prefix to every directory name in a filesystem tree). `treeFilter(t, fn)` returns a *partial* tree containing only the matching nodes plus their ancestors (or `null` if nothing matches). `treeFind(t, fn)` returns the first matching node (pre-order) or `null`. `treePath(t, fn)` returns the array of values from root down to the first match (or `null` if no match) — useful for "show me the path to the error in this AST". `treeFlatten(t)` returns all values in pre-order as a flat array.

```aether
tree.treeMap(t, v -> v.toUpperCase())   // new tree with all uppercased
tree.treeFilter(t, v -> v.endsWith(".ts"))  // only .ts files + their parent dirs
tree.treeFind(t, v -> v === "a1")       // the "a1" node
tree.treePath(t, v -> v === "a1")       // ["root", "a", "a1"]
tree.treeFlatten(t)                      // ["root", "a", "a1", "a2", "b"]
```

## Traversals

`treeWalk(t, fn)` is the canonical pre-order DFS — call `fn(value)` on every node, root first. `treeDfs` is the same (alias). `treeBfs(t, fn)` is breadth-first — call `fn(value)` level by level, root then its children then their children. Both are non-mutating. Reach for `treeBfs` when the order of processing matters (e.g. "process the root before any child"), and `treeWalk`/`treeDfs` when you want a natural recursive descent.

```aether
tree.treeBfs(t, v -> println(v))   // root, a, b, a1, a2
tree.treeDfs(t, v -> println(v))   // root, a, a1, a2, b
```

## Display

`treePrint(t)` produces a multi-line ASCII tree with `├─`/`└─` branches and `│  ` vertical continuations — the classic Unix `tree` output. `treeToString(t)` produces a single-line S-expression-like string `root(a(a1, a2), b)` — useful for compact serialization when you don't care about indentation.

```aether
tree.treePrint(t)
// root
// ├─ a
// │  ├─ a1
// │  └─ a2
// └─ b
tree.treeToString(t)  // "root(a(a1, a2), b)"
```

## Building from edges

`treeFromEdges(edges)` takes a list of `[parent, child]` value pairs and builds the tree, returning the root. The root is the parent that never appears as a child in any edge. Returns `null` for an empty edge list. Useful for building a tree from a flat list of parent-child relationships (e.g. a SQL adjacency list).

```aether
const t = tree.treeFromEdges([
  ["root", "a"], ["root", "b"], ["a", "a1"], ["a", "a2"],
])
tree.treeValue(t)        // "root"
tree.treeFlatten(t)      // ["root", "a", "a1", "a2", "b"] (depends on insertion order)
```

## Equality

`treeEquals(a, b)` returns true when `a` and `b` have the same shape and deeply-equal values at every node. Useful for AST comparison, snapshot testing, and detecting "this tree was just modified back to its previous state".

```aether
tree.treeEquals(buildTree(), buildTree())  // true
tree.treeEquals(t, tree.treeMap(t, v -> v + "x"))  // false
```

## Common patterns

- **Build a tree imperatively**: chain `treeAddChild` calls; the function returns the new child so you can do `const a = treeAddChild(root, "a"); treeAddChild(a, "a1");`.
- **Walk and aggregate**: `let sum = 0; tree.treeWalk(t, v => { sum += v; });`.
- **Pretty-print for debugging**: `console.log(tree.treePrint(ast))` is the single most useful line you'll write when working with trees.
- **Filter to a sub-tree**: `tree.treeFilter(t, v => v.startsWith("error_"))` to extract just the error-branch nodes.

The whole module is 20 functions, ~280 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
