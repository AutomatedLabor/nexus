# hanoi.ae

The Tower of Hanoi — the classic recursive puzzle. Three pegs
(source, auxiliary, target) and N disks of different sizes, all
stacked on the source peg in decreasing size. The goal: move
all disks to the target peg, one at a time, never placing a
larger disk on a smaller one.

## What it does

Algorithm:

```
hanoi(n, from, to, via):
  if n == 1:  move disk from -> to
  else:
    hanoi(n - 1, from, via, to)   // move top n-1 to the spare
    move disk from -> to           // move the largest disk
    hanoi(n - 1, via, to, from)   // move n-1 from spare to target
```

1. **`hanoi(n, from, to, via, out)`** — recursive helper. Returns
   `()` (unit) — its purpose is to push move descriptions onto
   the accumulator `out` (a `[string]`).
2. **`solve_hanoi(n)`** — wrapper that allocates the accumulator,
   calls the recursive helper, and returns the move list.
3. **`show_moves(moves)`** — renders a move list as a single
   newline-separated string via `reduce`.
4. **Driver** — solves N=3 (the canonical example, 7 moves),
   prints the move list. Also solves N=1 (trivial) and N=4 (15
   moves) for completeness, plus runs assertions on the move
   count `2^n - 1`.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/hanoi.ae
```

## Key language features

- **Recursive function with side effects** — `hanoi` doesn't
  return a value; it pushes onto the captured `out` array. The
  recursion structure is the classic textbook Hanoi, but the
  "output" is collected via mutation rather than constructed as
  a return value.
- **`return;` inside an `if` block** — `if n == 0 { return; };`
  is a bare-unit return (no value) and works fine after the `if`
  block. The task description warns that `return X;` (with a
  value) after a block can be brittle, but a bare `return;`
  works.
- **`push(out, ...)` to append to a `[string]`** — the helper
  uses `push` to record each move description.
- **`reduce` to join the move list** with newlines for display.
- **Forward reference** — `power2` is defined AFTER its use site
  in the driver. Aether supports this since top-level `fn`
  declarations are visible across the whole file regardless of
  order.

## Expected output

```
== Tower of Hanoi (recursive) ==

Solving Hanoi for 3 disks (A -> C via B):

move disk 1 from A to C
move disk 2 from A to B
move disk 1 from C to B
move disk 3 from A to C
move disk 1 from B to A
move disk 2 from B to C
move disk 1 from A to C

total moves: 7  (expected 2^3 - 1 = 7)

Hanoi for 1 disk: move disk 1 from A to C

Hanoi for 4 disks (15 moves):
move disk 1 from A to B
...
All assertions passed.
```

## Design notes

- The accumulator pattern (`out` captured by the recursive
  helper) is a common Aether idiom for collecting output from a
  recursive walk. It avoids the for-loop-scope quirk and keeps
  the recursion structure clean.
- The `solve_hanoi` wrapper is necessary because we can't
  `return out;` directly after the recursive call (the bare
  expression after a block pattern fails sometimes). The
  wrapper builds `out`, calls the helper, then returns `out`
  as a bare expression — which works because the previous
  statement is a `fn` call (not a block).
- The move count `2^n - 1` is verified via a small `power2`
  helper — included to make the assertion self-documenting.
