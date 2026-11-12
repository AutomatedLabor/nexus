# tabu_search.ae

A tiny tabu search for the Traveling Salesman Problem on 4 cities. Starts from the naive route `[0, 1, 2, 3]` (cost 95) and iteratively applies 2-opt swaps (exchanging two cities' positions) while maintaining a short tabu list of recently performed swaps. The demo prints the best route found and its total cost (80).

## What it does

Tabu search is a local-search metaheuristic that escapes local optima by *forbidding* recently-made moves (the "tabu list"). At each iteration:

1. Enumerate all 2-opt swaps `(i, j)` with `i < j`.
2. Skip swaps that are tabu (recently performed).
3. Among the non-tabu swaps, pick the one that reduces the total route cost the most.
4. Apply the swap; add it to the tabu list; if the list grows beyond 3 entries, drop the oldest.
5. Update `best_route` if the new route is better than the current best.

The algorithm runs for 20 iterations. For the 4-city TSP used in the demo, this is more than enough to find the optimal tour.

## The 4-city TSP instance

The distance matrix is asymmetric-friendly (symmetric in this case):

```
       0    1    2    3
   0 [ 0,  10,  15,  20]
   1 [10,   0,  35,  25]
   2 [15,  35,   0,  30]
   3 [20,  25,  30,   0]
```

The naive route `[0, 1, 2, 3]` visits 0 → 1 → 2 → 3 → 0 with total cost `10 + 35 + 30 + 20 = 95`. The optimal tour visits in the order `[1, 0, 2, 3]` (equivalently any rotation thereof) with cost `10 + 15 + 30 + 25 = 80`. The demo finds this optimum.

## Complexity

- **Time per iteration:** O(k^3) — O(k^2) swap candidates, each evaluated with an O(k) route-cost computation.
- **Total time:** O(iterations * k^3). For 4 cities and 20 iterations this is trivially fast (a few hundred operations).
- **Space:** O(k) for the route, the best_route, and the tabu list.

## Why it's interesting

Tabu search is the canonical example of "memory-augmented local search". The two ideas — keep a short list of forbidden moves to prevent cycling, and allow non-improving moves when no improving move is available — generalize to most metaheuristics (simulated annealing uses temperature instead of a tabu list, genetic algorithms use population instead of a single state, etc.). Understanding tabu search makes the other metaheuristics easier to reason about.

The 2-opt neighborhood used here is the simplest TSP neighborhood: swap any two cities. Richer neighborhoods (3-opt, Lin-Kernighan) yield better solutions but at much higher per-iteration cost.

## Output

```
== Tabu search demo (4-city TSP) ==

distance matrix (4x4):
  [0, 10, 15, 20]
  [10, 0, 35, 25]
  [15, 35, 0, 30]
  [20, 25, 30, 0]

naive route [0, 1, 2, 3] cost = 95
best route after tabu search = [1, 0, 2, 3]
best cost = 80

Tabu search complete.
```

## Notes

- The algorithm is deterministic — the same input always produces the same output (the demo picks the best swap by index order, breaking ties by the first encountered).
- The tabu list is symmetric — `(i, j)` and `(j, i)` are treated as the same swap, so the reverse is also forbidden.
- The `swap_at` helper builds a fresh array rather than mutating, which keeps the implementation pure-functional (and sidesteps a known type-inference quirk in the v1 evaluator).
