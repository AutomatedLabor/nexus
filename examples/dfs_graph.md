# dfs_graph.ae

Depth-first search on a small undirected graph. Print the visit
order starting from a chosen root.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`dfs(graph, n, src)`** — recursive DFS. The nested
   `visit(u)` helper closes over `visited` and `order`
   (both declared `let mut` in the enclosing function). On
   entering `u`: mark visited, push to `order`, then recurse
   into each unvisited neighbor in ascending index order.
3. **`dfs_iter(graph, n, src)`** — iterative DFS with an
   explicit stack. Pushes neighbors in *descending* order
   so the smallest-index neighbor ends up on top of the
   stack and is visited next, matching the recursive DFS's
   order.
4. **Driver** — prints the adjacency matrix, runs both
   recursive and iterative DFS from node 0, and shows DFS
   from a different root for variety.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/dfs_graph.ae
```

## Key language features

- **Nested recursive function** `visit(u)` inside `dfs` —
   closes over `visited` and `order` from the enclosing
   scope, mutating both via index-assignment (`visited[u] = 1`)
   and `push(order, u)`.
- **Explicit-stack iterative version** as an alternative
   pattern: useful when the graph is large enough to risk
   stack overflow in the recursive version.
- **`while` loops** throughout — sidesteps the for-loop-scope
   quirk.

## Expected output

```
== Depth-first search ==

adjacency matrix:
  0 1 1 0 0
  1 0 0 1 0
  1 0 0 0 1
  0 1 0 0 0
  0 0 1 0 0

recursive DFS from 0: 0 -> 1 -> 3 -> 2 -> 4
iterative DFS from 0: 0 -> 1 -> 3 -> 2 -> 4

recursive DFS from 3: 3 -> 1 -> 0 -> 2 -> 4

All assertions passed.
```

## Design notes

- Both versions produce the same visit order for our small
  graph, but in general the recursive version's order is
  determined by the call stack, while the iterative
  version's order depends on the stack-push order. We
  push neighbors in descending index order so the
  smallest-index neighbor is on top.
- The graph is a 5-node tree-like structure (no cycles
  beyond what's already implied), so each node is visited
  exactly once.
- For deep / cyclic graphs the iterative version is
  safer; for shallow graphs the recursive version is
  more readable. Both are useful patterns to have in
  your Aether toolbox.
- The `let mut visited` referenced *after* the recursion
  would not work for a `for` loop (the post-loop scope
  quirk), but for `while` and recursion it's fine.
