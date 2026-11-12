# snake_game_logic.ae

Snake game logic on a 5x5 grid. The snake starts as a single
cell at the center, food is placed at a fixed position, and we
simulate 10 deterministic moves (R, R, R, D, L, D, L, U, R, U).
Eating food grows the snake by one cell and respawns the food
at the next position from a fixed list. Hitting a wall or
itself ends the game (the chosen moves are safe; the
simulation reaches completion).

## What it does

1. **`zeros()`** — build a 5x5 grid of zeros.
2. **`stamp(g, snake, food)`** — clear the grid, write the
   food (`2`) and snake (`1`) into the grid.
3. **`step(state, dir)`** — move the snake one step in `dir`
   (a `[dr, dc]` pair). Returns a new state `[snake, food_idx,
   foods, game_over]`. Detects wall hits and self-collisions.
4. **`print_grid(label, g)`** — render the grid as `F` (food),
   `S` (snake), `.` (empty).
5. **Driver** — sets up the initial state, runs 10 moves,
   prints the grid + snake + food after each move.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/snake_game_logic.ae
```

## Key language features

- **Nested list-of-lists** for the grid (`[[int]]`) — Aether
  supports `g[r][c] = v` mutation at any depth.
- **Tagged-list state** — the state is `[snake, food_idx,
  foods, game_over]`. A real implementation would use a
  struct, but Aether's struct fields can't hold list types
  easily in v1; arrays are the universal fallback.
- **`pop`** to drop the snake's tail when no food is eaten.
- **`while` loops** everywhere — sidesteps the for-loop-scope
  quirk.

## Game rules

- The snake is a list of `[r, c]` cells, head at index 0.
- Each move adds a new head; the tail is dropped unless food
  is eaten (in which case the snake grows by one cell).
- Eating food advances the food to the next item in the
  `foods` list. When the list runs out, food stays put.
- Wall hit or self-collision sets `game_over = true`.

## Expected output

```
== Snake game logic (5x5 grid) ==

Initial state:
  F . . . .
  . . . . .
  . . S . .
  . . . . .
  . . . . .
snake: [[2, 2]]  food: [0, 0]

After move 1 (R)
  ... (grid + snake + food)
...
== Snake simulation complete ==
Final snake length: 3
Final snake cells: [...]
All assertions passed.
```

## Design notes

- Food is a *list* of positions, not a single random cell —
  this makes the simulation deterministic and reproducible
  (no `Math.random()` required). A real game would use a
  pseudo-random source (e.g. the stdlib `random` module).
- The wall-hit and self-hit checks are present but not
  exercised by the chosen move sequence — they're there
  to show how the game-over logic would work.
