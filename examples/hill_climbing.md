# hill_climbing.ae

A demo of hill climbing — start at a point, repeatedly move to the best neighbor (the one with the highest `f`-value) until no neighbor is better. The demo climbs two functions: a unimodal one (where hill climbing always finds the global max) and a bimodal one (where hill climbing can get stuck at a local max).

## What it does

Hill climbing is the simplest local-search optimization algorithm:

1. Start at a given point `x0`.
2. Compute `f(x - 1)`, `f(x)`, and `f(x + 1)`.
3. Move to whichever neighbor has a strictly greater `f` value.
4. Otherwise, stop — `x` is a local maximum.

The "neighbor" of `x` is `x +/- 1` — a one-dimensional step.

## The two functions

**Unimodal** (`f(x) = -(x - 7)^2`): peak at `x = 7`. Hill climbing from `x = 0` walks right and finds `x = 7` immediately.

**Bimodal** (`g(x) = -(x - 3)^2 if x < 6 else -(x - 10)^2 + 5`): a local max at `x = 3` (value 0) and a global max at `x = 10` (value 5). From `x = 0` hill climbing gets stuck at `x = 3`. Starting from `x = 7` it finds the global max at `x = 10`.

## Why it's interesting

Hill climbing is the canonical *greedy* local search — always takes the best immediate move, never a worse move. Fast (always converges to a local optimum) but fragile (the local optimum depends entirely on the starting point).

The bimodal demo shows the *local-optimum problem*: to escape, the algorithm would need to accept worse moves (which is what simulated annealing does) or maintain a population (which is what genetic algorithms do).

## Output

```
== Hill climbing demo ==
f(x) = -(x - 7)^2  (peak at x = 7)
start: x = 0
hill climbing peak = 7
f(peak) = 0

g(x) = bimodal: local max at x = 3 (g=0), global max at x = 10 (g=5)
start: x = 0
hill climbing peak = 3   (stuck at local max)
starting from x = 7 instead:
hill climbing peak = 10  (global max found)
Hill climbing complete.
```

## Notes

- An `improved` flag enables early exit: as soon as no neighbor is strictly better, the loop terminates.
- For continuous optimization, the step size would be tunable; for combinatorial optimization, neighbors would be defined by a move operator (swap, flip).
