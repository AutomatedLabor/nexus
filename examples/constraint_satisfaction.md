# constraint_satisfaction.ae

A demo of solving a tiny graph-coloring constraint satisfaction problem (CSP) via backtracking. The graph has 4 nodes (A, B, C, D) and 5 edges (A-B, A-C, B-C, B-D, C-D). We want to assign each node one of 3 colors such that no two adjacent nodes share a color.

## What it does

A constraint satisfaction problem has three components:

- **Variables:** the things to be assigned. Here, the four nodes A, B, C, D.
- **Domains:** the set of possible values for each variable. Here, each node's domain is `{0, 1, 2}` (three colors).
- **Constraints:** restrictions on which combinations of values are allowed. Here, the constraint is "no two adjacent nodes share a color".

The algorithm is simple **backtracking**:

1. Pick the next unassigned node (in order 0, 1, 2, 3).
2. Try each color in turn (0, 1, 2).
3. For each color, check if assigning it to the current node is *consistent* with the already-assigned neighbors (no conflict).
4. If consistent, make the assignment and recurse on the next node.
5. If recursion succeeds, return true.
6. If recursion fails (no consistent color works for a later node), undo the assignment (set it back to -1) and try the next color — this is the "backtrack".
7. If no color works, return false (no solution exists from this partial assignment).

## The graph

```
       A --- B
       |  X  |
       | / \ |
       C --- D
```

The adjacency list:
- A (0): neighbors B (1), C (2)
- B (1): neighbors A (0), C (2), D (3)
- C (2): neighbors A (0), B (1), D (3)
- D (3): neighbors B (1), C (2)

## Why it's interesting

Graph coloring is the canonical CSP. It's NP-hard in general (for `k` colors and `n` nodes, the worst case is `k^n` assignments to check), but for small graphs and small color counts, backtracking is fast in practice. The demo runs in 0 backtracks because the greedy order (A=0, B=1, C=2, D=0) happens to be a valid coloring — the algorithm never has to undo a choice.

For more challenging CSPs (Sudoku, N-queens with large N, scheduling problems), backtracking alone can be too slow. Real CSP solvers add **constraint propagation** (e.g. forward-checking, arc consistency) to prune the search tree before recursing, and **variable ordering heuristics** (most-constrained-first) to fail fast on bad branches. See the `sudoku_solver.ae` example for a Sudoku-specific backtracking solver.

## Output

```
== Graph coloring CSP demo ==

graph: 4 nodes (A=0, B=1, C=2, D=3), edges A-B, A-C, B-C, B-D, C-D
colors: 3 (0, 1, 2)

solution found:
  node A (0) -> color 0
  node B (1) -> color 1
  node C (2) -> color 2
  node D (3) -> color 0

backtracks used: 0

Constraint satisfaction complete.
```

## Notes

- The `assignment` array is shared mutable state — the recursive `backtrack` function modifies it in place and undoes its changes on failure. This is the standard pattern for backtracking CSP solvers.
- The `consistent` check is `O(degree)` per call, and the overall search is `O(k^n * average degree)` in the worst case.
- The node-name lookup (mapping 0 -> "A", 1 -> "B", etc.) uses a series of `if` statements because Aether's switch-on-int is more verbose for small cases.
