# Conway's Blinker (examples/conway_blinker.ae)

A compact Conway's Game of Life demo focused on the **blinker** — the
simplest possible oscillator. The blinker is a row (or column) of three
live cells that flips between a horizontal 3-in-a-row and a vertical
3-in-a-column every generation, with period 2:

```
gen 0:   . # # # .         gen 1:   . . # . .
                                . . # . .
                                . . # . .
gen 2:   . # # # .         gen 3:   . . # . .
                                . . # . .
                                . . # . .
```

This example runs **6 generations** of two blinker setups side-by-side:

- **Horizontal blinker** — a 1×9 grid with three live cells in a row at
  cols 3-5. The grid is too thin for the blinker to "go vertical" (it
  would need 3 rows), so it oscillates between 3 cells in a row and a
  single live cell — a degenerate case that shows what happens at the
  boundary.
- **Vertical blinker** — a 5×3 grid with three live cells in a column
  at row 1-3, col 1. This is the canonical blinker: it oscillates
  between vertical and horizontal every generation, with full 3-cell
  survival.

## Implementation notes

- **`while` loops only, no `for in`** — Aether v3's evaluator has a
  for-loop-scope quirk (a `let X;` before a `for` loop referenced after
  the loop fails). All iteration uses `while` with explicit integer
  indices. This is purely defensive; modern Aether versions may fix
  the quirk, but the example stays portable.
- **Fresh grid per generation** — `step(g)` allocates a new grid for
  the next generation rather than mutating in place. This is required
  because each cell's next state depends on the *current* state of
  all 8 neighbours; mutating in place would corrupt neighbour reads
  mid-update.
- **Fixed (zero) boundaries** — `get_cell` returns 0 for any
  out-of-bounds coordinate. The grid is finite and the boundary is
  treated as permanently dead. (A toroidal/wraparound boundary is
  equally easy to implement — replace `get_cell` with a modulo.)
- **`;` discipline** — Aether's parser treats `if cond { stmt }`
  followed by another statement as a single expression that
  silently swallows the next statement. Every single-line if block
  in this example has `;` *inside* the block (`if cond { stmt; }`)
  AND `;` *after* the closing `}` (`};`). Top-level `while` loops
  do NOT take a trailing `;` (the parser rejects `};` at top level).
  Multi-line if/while blocks inside functions do take a trailing `;`.

## Game-of-Life rules

A cell's next state depends on its 8 orthogonal+diagonal neighbours:

- A **live** cell with 2 or 3 live neighbours survives; otherwise dies
  (underpopulation or overpopulation).
- A **dead** cell with exactly 3 live neighbours becomes live
  (reproduction); otherwise stays dead.

The blinker works because the middle live cell always has 2 live
neighbours (the two other cells in the line), so it survives. The end
cells each have only 1 live neighbour, so they die. The two cells
above and below the middle (and the two cells to either side of the
line) each have exactly 3 live neighbours (the entire line), so they
become live. Net effect: the line flips orientation.

## Files

- `examples/conway_blinker.ae` — the example source (~175 LOC).

## Running

```bash
bun /tmp/verify_one.ts examples/conway_blinker.ae
```

The expected output prints 6 generations of the horizontal blinker,
then 6 generations of the vertical blinker. The vertical blinker is
the canonical Conway oscillator and is visibly periodic with period 2.

## Related

- `examples/game_of_life.ae` — a larger 8×8 Game of Life with an
  R-pentomino starting pattern that produces visible motion over 5
  generations.
- `examples/conway_life_oscillators.ae` — a survey of Conway
  oscillators (blinker, toad, beacon, pulsar).
- `examples/cellular_automaton.ae` — elementary 1D cellular
  automaton (Wolfram rule 30).
