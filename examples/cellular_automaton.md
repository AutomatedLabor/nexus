# cellular_automaton.ae

Elementary cellular automaton **rule 30** (Wolfram). Run 10
generations on a 21-cell grid, printing each generation.

Rule 30 is a 1D CA where each cell's new state is determined
by the 3-cell neighbourhood (left, self, right) according to
the 8-bit lookup table:

```
   111  110  101  100  011  010  001  000
    0    0    0    1    1    1    1    0
```

Rule 30 is famous for its chaotic, pseudo-random-looking
behaviour — Wolfram uses it for Mathematica's random number
generator. Starting from a single live cell in the middle,
the triangle pattern looks random.

## What it does

1. **`zeros_row(n)`** — build an N-cell row of zeros.
2. **`step_row(row)`** — compute the next row from the
   current one using rule 30. Uses periodic (wraparound)
   boundaries so the grid stays the same width.
3. **`print_row(label, row)`** — render a row as `#` / `.`.
4. **Driver** — sets up a single live cell at index 10 in a
   21-cell row, runs 10 generations, prints each.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/cellular_automaton.ae
```

## Key language features

- **Array indexing with modulo** for wraparound boundaries:
   `row[(i - 1 + n) % n]` and `row[(i + 1) % n]`.
- **Nested `if` chain** for the 8-bit lookup. A real
   implementation would use a flat 8-element lookup table; the
   `if` chain is the explicit equivalent.
- **`while` loops** with `mut i` — sidesteps the for-loop-scope
   quirk.
- **`int(...)`** — not needed here; all arithmetic is already
   integer.

## Why rule 30?

Wolfram's classification of 1D CAs (1..256, by the 8-bit
lookup table) categorises them into four classes:

1. **Homogeneous** — quickly settles to all-0 or all-1.
2. **Stable / simple structures** — settles to a fixed
   pattern or a small cycle.
3. **Chaotic** — aperiodic, "random-looking" behaviour.
4. **Complex** — localised structures that interact.

Rule 30 is class 3 (chaotic). Its centre column (the
sequence of states of the middle cell over time) passes
statistical tests for randomness and is used in
Mathematica's `RandomInteger` for small n.

## Expected output (truncated)

```
== Elementary CA: rule 30 ==

gen  0: ..........#..........
gen  1: .........###.........
gen  2: ........##..#........
gen  3: .......##.####.......
gen  4: ......##..#...#......
gen  5: .....##.####.###.....
gen  6: ....##..#....#..#....
gen  7: ...##.####..######...
gen  8: ..##..#...###.....#..
gen  9: .##.####.##..#...###.
gen 10: ##..#...#..#####.##..
All assertions passed.
```

## Design notes

- Periodic boundaries (wraparound) make the grid a torus —
  this is the most common choice for theoretical study.
  Fixed boundaries (treat out-of-range as 0) would give a
  different but equally valid pattern.
- The 8-entry lookup could be a list `[..., 1, 1, 1, 1, 0]`
  indexed by the 3-bit pattern. The explicit `if` chain
  is easier to read and just as fast.
