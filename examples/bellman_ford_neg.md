# bellman_ford_neg.ae

Bellman-Ford single-source shortest paths with explicit negative-cycle detection. We relax every edge V−1 times, then make one more pass: any edge that still relaxes is on a negative cycle. We then walk that edge's tail through `prev` exactly V times to land on a node guaranteed to be *on* the cycle, and reconstruct the cycle by following `prev` until we come back to the starting node.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`bellman_ford(n, edges, src)`** — the algorithm:
   - `dist[src] = 0`, all other `dist = INF`.
   - Relax every edge `n − 1` times. Early-exit when no edge changed in a pass.
   - One more pass: any edge `(u, v, w)` with `dist[u] + w < dist[v]` proves a negative cycle exists; we record `v` as `cycle_node`.
   - Walk `prev` from `cycle_node` `n` times to land on a node guaranteed to be on the cycle.
   - Returns `[dist, prev, [cycle_node]]`.
3. **Driver** — reconstructs the cycle by following `prev` from `cycle_node` until returning, then prints in forward order.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/bellman_ford_neg.ae
```

## Key language features

- **`while` for everything** — no `for in`.
- **`if cond { ... };` after if-else blocks** — closing brace of an `if-else` block must be followed by `;` if the next line is another statement.
- **Module-level `let INF = 1000000`** — shared between the algorithm and the show function.

## Expected output

```
== Bellman-Ford with negative cycle detection ==

edges:
  0 -> 1  w = 1
  ...
dist: [0, -7, -3, 0, 5]
prev: [-1, 3, 1, 2, 0]
negative-cycle node: 3

cycle: 1 -> 2 -> 3 -> 1  (closes back on 1)

All assertions passed.
```

## Design notes

- The first graph has a cycle `1 -> 2 -> 3 -> 1` of weight `2 + 3 − 7 = −2`. After `V−1 = 4` passes the `dist` values still drift; the fifth pass detects this and walks `prev` to a cycle node.
- The cycle reconstruction walks `prev` from `cycle_node` until we return to it; we reverse the accumulated array so it reads in forward order.
- The second test graph has no negative cycle, so `cycle_node = −1` and `r2[2][0] = −1`.
- `prev` may form cycles even outside negative cycles if the input has unrelated back-edges, but the `n`-step walk guarantees we land on a node that's actually inside a negative cycle if one exists.
