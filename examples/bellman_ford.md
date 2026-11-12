# bellman_ford.ae

Bellman-Ford single-source shortest path. Handles graphs with
negative weights and detects negative-weight cycles reachable from
the source. We use an edge-list representation: each edge is a
`(u, v, w)` triple. The algorithm relaxes every edge `V - 1` times,
then makes one more pass to detect further relaxations (a sign of a
negative cycle).

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`bellman_ford(n, edges, src)`** — the algorithm:
   - Initialize `dist[src] = 0`, all others `INF` (= 10^9).
   - Relax all edges `V - 1` times: for each `(u, v, w)`, if
     `dist[u] + w < dist[v]`, update `dist[v]`.
   - Early-exit if a relaxation pass makes no change.
   - One more pass: if any edge can still be relaxed, there's a
     negative cycle.
   - Returns `(dist, has_negative_cycle)` as a tuple.
3. **`show_dist(dist)`** — pretty-print the distance vector with
   `INF` for unreachable nodes.
4. **Driver** — runs Bellman-Ford on a 5-node graph with negative
   weights, and on a 3-node graph with a negative cycle.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/bellman_ford.ae
```

## Key language features

- **`(int, int, int)` tuple types** in function signatures —
  Aether supports tuple-typed parameters and tuples of tuples.
- **Tuple field access** `e.0`, `e.1`, `e.2` to destructure an
  edge tuple.
- **`if !changed { i = n }`** to short-circuit the relaxation
  loop when no progress is made (early exit).
- **`while` loops** for the relaxation passes — sidesteps the
  for-loop-scope bug.

## Expected output

```
== Bellman-Ford shortest path ==

node count: 5, source: 0
edges (6):
  0 -> 1  w = 6
  0 -> 2  w = 7
  1 -> 3  w = 5
  2 -> 3  w = -3
  3 -> 4  w = 2
  2 -> 1  w = -2

dist from source: [0, 5, 7, 4, 6]
negative cycle: false

graph with a negative cycle:
  dist: [0, -3, -4]
  negative cycle: true

All assertions passed.
```

## Design notes

- The first graph has an interesting shortcut: going via node 2
  (cost 7) and then back to node 1 (cost -2) is cheaper (5) than
  the direct edge 0->1 (cost 6). Bellman-Ford handles this
  naturally in `V - 1 = 4` relaxation passes.
- The second graph contains a 2-cycle (1 -> 2 -> 1 with total
  weight -2); one extra relaxation pass confirms the cycle by
  noticing that `dist[1]` can still be reduced.
- We use `INF = 10^9` rather than `MAX_INT` because Aether
  integers can overflow on arithmetic with `INF`-sized values;
  $10^9$ is far enough from the overflow boundary for the small
  graphs we use here.
