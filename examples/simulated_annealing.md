# simulated_annealing.ae

A from-scratch demo of simulated annealing — find the `x` that minimizes a function `f(x)` by repeatedly proposing a small move (`x +/- 1`) and accepting it if it decreases `f`, or accepting it with a small probability (proportional to the current temperature) if it increases `f`. The temperature cools over time, allowing the algorithm to escape local minima early and settle into the global minimum late.

The demo minimizes `f(x) = (x - 23)^2` starting from `x = 0`. The true minimum is `x = 23`, and the algorithm finds it within 200 iterations.

## What it does

Simulated annealing models physical annealing — a process where a metal is heated to a high temperature and cooled slowly, allowing atoms to settle into a low-energy crystalline structure. In the algorithm:

- **State:** the current `x` and the best `(x, f(x))` seen so far.
- **Move:** propose a neighbor `x' = x +/- 1` (chosen by a pseudo-random LCG).
- **Acceptance:** if `f(x') < f(x)`, always accept. Else, accept with probability `T / (T + delta)` where `delta = f(x') - f(x)` and `T` is the current temperature.
- **Cooling:** `T(t) = T0 - (T0 - T1) * t / iterations` — linear cooling from `T0 = 100` to `T1 = 1`.

The probability `T / (T + delta)` is the Metropolis-Hastings acceptance criterion. At high temperatures, even large uphill moves are likely to be accepted (the algorithm explores freely). At low temperatures, only small uphill moves are accepted (the algorithm settles into a local minimum).

## Complexity

- **Time:** O(iterations) — each iteration does a constant amount of work (two function evaluations, a few arithmetic ops, one LCG call).
- **Space:** O(1).

For the demo (200 iterations on a 1D quadratic), the runtime is essentially instantaneous.

## Why it's interesting

Simulated annealing is the canonical example of a *global* optimization algorithm — one that can escape local minima, unlike pure local search (hill climbing, gradient descent). The two ideas — accept worse moves with small probability, and reduce that probability over time — appear in many other metaheuristics (genetic algorithms, particle swarm, etc.).

The demo uses a deterministic LCG (seed 1, Numerical Recipes constants) for reproducibility. The same input always produces the same output, which makes the result testable.

## Output

```
== Simulated annealing demo ==

f(x) = (x - 23)^2  (minimum at x = 23)
start: x = 0, iterations = 200
best x found = 23
f(best x)   = 0

f(x) = |x - 7|  (minimum at x = 7)
best x found = 7
f(best x)   = 0

Simulated annealing complete.
```

## Notes

- The `float(i) / float(iterations)` cast is needed because Aether's `/` is float division (no integer truncation here — we want the exact ratio).
- The LCG state is held in a 1-element array `[1]` so the function can mutate it without needing to thread state through the loop explicitly.
- For the production-grade version, see `aether-algorithms.simulatedAnnealing`.
