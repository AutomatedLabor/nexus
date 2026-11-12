# genetic_algorithm.ae

A tiny genetic algorithm to evolve a population of bit-strings toward a target. The demo evolves toward `target = [1, 0, 1, 1, 0, 1, 0, 0]` (length 8). Starting from a random population of 10 individuals, the algorithm converges (finds an exact match) within ~13 generations.

## What it does

A genetic algorithm (GA) is a population-based metaheuristic inspired by biological evolution:

1. **Initialize.** Create a random population of `pop_size` individuals, each a random bit-string of the target length.
2. **Evaluate.** Compute the fitness of each individual (number of bits matching the target).
3. **Select.** Pick two parents with probability proportional to fitness (plus a small bonus to avoid zero-probability parents).
4. **Crossover.** Pick a random pivot; the child is `parent_a[0..pivot]` followed by `parent_b[pivot..length]`.
5. **Mutate.** Each bit flips with probability `1/length` (so on average one bit flips per offspring).
6. **Replace.** The new population replaces the old; the best individual from the previous generation is carried over (elitism).
7. **Repeat** until the best individual matches the target (or the generation budget runs out).

The algorithm uses a deterministic LCG (seed 42, Numerical Recipes constants) for all randomness, so the run is reproducible.

## The target

The target is the 8-bit string `[1, 0, 1, 1, 0, 1, 0, 0]`. The search space is `2^8 = 256` possible strings, so a GA is overkill (random search would find the target in ~256 tries). The point of the demo is to show the GA structure; the same code would work on much longer bit-strings where random search becomes infeasible.

## Complexity

- **Per generation:** O(pop_size * length) for evaluation + O(pop_size * length) for selection + crossover + mutation.
- **Total:** O(generations * pop_size * length). For the demo (40 generations, 10 individuals, 8-bit strings), this is trivially fast.
- **Space:** O(pop_size * length) for the population.

## Why it's interesting

Genetic algorithms are the canonical example of *population-based* search. Unlike simulated annealing (which keeps a single state), a GA keeps a population of candidate solutions and uses recombination (crossover) to combine good substructures from different parents. The two ideas — fitness-proportional selection and recombination — are the foundation of evolutionary computation.

The demo also demonstrates *elitism* (carrying the best individual forward unchanged), which prevents the algorithm from losing its best solution to a bad crossover or mutation. Without elitism, GAs often cycle around the optimum rather than converging.

## Output

```
== Genetic algorithm demo ==

target = [1, 0, 1, 1, 0, 1, 0, 0]  (length 8)
pop_size = 10, max generations = 40
converged in 13 generation(s)
final target reached: [1, 0, 1, 1, 0, 1, 0, 0]

Genetic algorithm complete.
```

## Notes

- The `+1` in `fitness + 1` for selection ensures every individual has a nonzero chance of being selected, even when its fitness is zero. This avoids the "all-zero-fitness" degenerate case where selection would always return the first individual.
- The `1/length` mutation rate is a common heuristic: on average, one bit flips per offspring, which is enough to escape local optima without disrupting good solutions too much.
- The LCG state is held in a 1-element array `[42]` so the helper functions can mutate it without threading state through the call chain explicitly.
