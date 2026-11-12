# conway_life_oscillators.ae

Conway's Game of Life on a 7x7 grid. Run a blinker (period-2
oscillator) for 6 generations, printing each one. The blinker
is three live cells in a horizontal row that oscillates
between horizontal and vertical each generation.

## The rules

- A live cell with 2 or 3 live neighbours survives.
- A dead cell with exactly 3 live neighbours becomes live.
- Everything else dies or stays dead.

We use fixed boundaries (out-of-range cells are dead).

## What it does

1. **`zeros(rows, cols)`** — build a grid of zeros.
2. **`get_cell(g, i, j)`** — safe get; returns 0 for
   out-of-bounds.
3. **`count_neighbors(g, i, j)`** — count the 8 neighbours
   of `(i, j)`. Uses a `-1..1` x `-1..1` double loop, skipping
   the centre cell.
4. **`step(g)`** — compute the next generation into a fresh
   grid; does not mutate `g`.
5. **`print_grid(label, g)`** — render the grid as `#` / `.`.
6. **`count_live(g)`** — count live cells (used for the
   invariant assertion).
7. **Driver** — sets up a blinker in the middle of a 7x7
   grid and runs 6 generations, printing each.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/conway_life_oscillators.ae
```

## Key language features

- **2D list-of-lists** for the grid.
- **`g[i][j] = v`** mutation — Aether supports this directly.
- **Nested `while` loops** for the neighbour count and the
   grid update.
- **`if/else` chains** for the survival/birth decision.

## Why a blinker?

The blinker is the simplest non-trivial oscillator in
Conway's Life: 3 cells in a horizontal row ↔ 3 cells in a
vertical column, every generation. Its period is 2, so 6
generations show 3 full cycles. Visually, the centre cell
stays live and the two outer cells rotate around it.

Other oscillators in the same family:
- **Toad** (period 2, 6 cells) — a 2x4 block that toggles.
- **Beacon** (period 2, 6 cells) — two 2x2 blocks that blink.
- **Pulsar** (period 3, 48 cells) — a more complex
  three-generation oscillator.

## Expected output (truncated)

```
== Conway's Game of Life: blinker oscillator ==

Generation 0:
  .......
  .......
  .......
  ..###..    <- horizontal blinker
  .......
  .......
  .......
live cells: 3

Generation 1:
  .......
  .......
  ...#...
  ...#...    <- vertical blinker
  ...#...
  .......
  .......
live cells: 3

...
All assertions passed.
```

## Design notes

- `step` builds a fresh grid rather than mutating in place —
  this is essential because each cell's new state depends on
  the *current* state of all 8 neighbours.
- The fixed-boundary choice means the blinker survives
  indefinitely because it's centred. With periodic
  boundaries (wraparound), the dynamics would be different
  for patterns near the edge.
- Compare to `game_of_life.ae` (already in the repo) which
  runs a more complex pattern (R-pentomino) for 5 generations
  on an 8x8 grid.
