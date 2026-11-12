# aether-tree

> Tree operations for the Aether language — 15 pub functions covering the canonical tree API, written in Aether itself.

`aether-tree` is a small but complete tree library: `treeNew`, `treeAddChild`, `treeValue`, `treeDepth`, `treeSize`, `treeMap`, `treeFilter`, `treeFind`, `treeFlatten`, `treeWalk`, `treeBfs`, `treeDfs`, `treeEquals`, `treePrint`, `treeFromEdges`. Every function is a few lines of Aether built on `while`, `push`, `len`, and recursion — no `for in` loops (defensive against the v1 evaluator's for-loop-scope quirk).

## Why a tree package?

Trees are the canonical recursive data structure. Aether ships the core `push`/`len`/`while` primitives but no tree operations. `aether-tree` is the canonical user-installable package for trees: it provides the basic operations (construct, traverse, query, transform) that every tree-using project needs.

## Representation

A tree node is a 2-element array `[value, children]` where:
- `value` is the node's payload (an `int` in the type annotations; the runtime accepts any value).
- `children` is an array of child trees (recursively the same shape).

A leaf is `[value, []]`. The root of a tree is itself just a node.

This representation is the simplest possible — no struct, no enum, no field names. The trade-off: callers must remember that index 0 is the value and index 1 is the children. The `treeValue(node)` helper makes this readable.

## API

All 15 functions are `pub fn` declarations in `src/lib.ae`.

### Constructors / accessors

| Function | Signature | Description |
| --- | --- | --- |
| `treeNew(v)` | `(int) -> [int]` | Create a leaf tree with value `v`. |
| `treeAddChild(parent, child)` | `([int], [int]) -> [int]` | Append `child` to `parent`'s children. Mutates `parent` in place (builder pattern). Returns `parent`. |
| `treeValue(node)` | `([int]) -> int` | Extract the node's value. |

### Queries

| Function | Signature | Description |
| --- | --- | --- |
| `treeDepth(node)` | `([int]) -> int` | Max depth from node to a leaf. Leaf depth = 1. |
| `treeSize(node)` | `([int]) -> int` | Total number of nodes (including the root). |
| `treeEquals(a, b)` | `([int], [int]) -> bool` | Structural equality (value + children). |

### Transformations

| Function | Signature | Description |
| --- | --- | --- |
| `treeMap(node, f)` | `([int], fn(int)->int) -> [int]` | Apply `f` to every value, returning a new tree. |
| `treeFilter(node, pred)` | `([int], fn(int)->bool) -> [int]` | Keep nodes passing `pred`. A node whose value doesn't pass but has passing descendants is kept (with its passing children); a node with no passing descendants is dropped (returned as `[-1, []]`). If a node doesn't pass but has exactly one passing child, the child is promoted (the parent is dropped). |

### Searches

| Function | Signature | Description |
| --- | --- | --- |
| `treeFind(node, pred)` | `([int], fn(int)->bool) -> [int]` | First node (DFS, pre-order) whose value satisfies `pred`. Returns `[-1, []]` if none. |

### Traversals

| Function | Signature | Description |
| --- | --- | --- |
| `treeFlatten(node)` | `([int]) -> [int]` | DFS pre-order; returns values as a flat array. |
| `treeWalk(node, f)` | `([int], fn(int)->()) -> ()` | Pre-order DFS, calling `f` on each value (side-effect). |
| `treeBfs(node)` | `([int]) -> [int]` | Breadth-first search; returns values level by level. |
| `treeDfs(node)` | `([int]) -> [int]` | Depth-first search (alias of `treeFlatten`). |

### Building / printing

| Function | Signature | Description |
| --- | --- | --- |
| `treeFromEdges(edges)` | `([[int]]) -> [int]` | Build a tree from a list of `[parent, child]` edges. First edge's parent becomes the root. Panics if a parent isn't found. |
| `treePrint(node)` | `([int]) -> string` | Pretty-print as a nested `v(c1, c2, ...)` string. |

## How to use

### As a dependency

```toml
[dependencies]
aether-tree = "0.1.0"
```

```aether
import { treeNew, treeAddChild, treeBfs, treePrint } from "aether-tree";

let root = treeNew(1);
treeAddChild(root, treeNew(2));
treeAddChild(root, treeNew(3));
print(treePrint(root));  // "1(2, 3)"
print(treeBfs(root));    // [1, 2, 3]
```

### Running the test suite

```sh
aether test aether-packages/aether-tree/tests
# PASS aether-packages/aether-tree/tests/tests.ae
# 1 passed, 0 failed
```

## Design notes

### Why array-of-2 representation?

Aether's struct syntax requires concrete field types; recursive struct types (a `TreeNode` with `children: [TreeNode]`) need special parser support. The array-of-2 representation `[value, children]` sidesteps this — it works at runtime because Aether arrays are JS arrays. The trade-off: callers must remember the convention (index 0 = value, 1 = children). The `treeValue(node)` helper makes this readable.

### Why `-1` as the "not found" sentinel?

`treeFind` returns `[-1, []]` when no node matches the predicate. The caller checks `treeValue(found) == -1`. This is a hack: real tree values can't be -1 (or the caller can't distinguish "not found" from a real match). The v3.1 plan is a `Option<T>` generic type (already in `aether-result`) so `treeFind` can return `Some(node)` or `None`.

### Why "promote the only child" in treeFilter?

When a node doesn't pass `pred` but has exactly one passing child, the child is promoted (the parent is dropped from that branch). This is a common tree-filter convention: if you filter out a node with one child, the child takes the parent's slot. If the parent has zero or 2+ passing children, the parent stays (with value unchanged) wrapping the passing children.

### Why no for-in?

Aether v1 has a known for-loop-scope quirk. All iteration uses `while` with explicit index variables. The generated code is the same after lowering, so no performance cost.

## Future work

- **Generic `Option<T>` for treeFind.** Switch the return type to `Option<[int]>` so callers can pattern-match instead of checking against `[-1, []]`.
- **Mutable tree operations.** `treeRemove(node, v)`, `treeReplace(node, v, new_v)`.
- **Balanced trees (AVL/Red-Black).** A separate `aether-bst` package for sorted binary trees.

## License

MIT — same as the Aether language.
