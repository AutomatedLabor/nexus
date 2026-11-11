# interpret_brainfuck.ae

A small interpreter for the Brainfuck esoteric language, written in
pure Aether. Runs the canonical Wikipedia "Hello World!" program and
a handful of tiny one-shot tests.

## What it does

Brainfuck has 8 commands operating on an infinite tape of bytes and a
single pointer:

```
+  increment the current cell          .  output the current cell as ASCII
-  decrement the current cell          ,  input a byte (unsupported here)
>  move the pointer right              [  if cell==0, jump forward to matching ]
<  move the pointer left               ]  if cell!=0, jump back to matching [
```

The interpreter has three pieces:

1. **`chr_of(n)`** — converts an int to a 1-char ASCII string. Aether
   has no `char(n)` builtin, so we keep a 95-char string of the
   printable ASCII characters starting at code 32 and index into it
   for codes in `[32, 126]`. Special cases for `\n` (10), `\t` (9),
   `\r` (13). Anything else falls back to `"?"`.
2. **`precompute_brackets(prog)`** — walks the program once and
   builds two `int` arrays, `jump_fwd` and `jump_bwd`, that record
   the position of the matching `]` for each `[` (and vice versa).
   Uses a stack of open-bracket positions: when we see `]`, we pop
   the most recent `[` and record the pair.
3. **`run_bf(prog)`** — the main loop. The tape is an int array of 64
   zeros that grows by one cell at a time whenever the pointer would
   run off the right end. The pointer never moves below 0 — `<` at
   the left edge is a no-op. The program counter `pc` walks the
   program string; for each command we update the tape/pointer/output
   as required and jump through the precomputed bracket table when
   `[`/`]` decide to skip.

After the main run, the program runs four tiny test programs (a
fixed number of `+`s then `.` to print a single char, plus a short
loop `++++++++[>+++++++++<-]>.` that prints `H` via 8×9=72) to verify
each BF feature works as expected. It closes with `assert_eq` checks.

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /home/z/my-project/verify_one.ts /home/z/my-project/examples/interpret_brainfuck.ae
```

## Key language features

- **Array element mutation** — `tape[ptr] = tape[ptr] + 1` works in
  the v1 evaluator (verified up front with a small test snippet).
  This is critical: the BF interpreter relies on mutating tape cells
  in place. We document this clearly because the evaluator's
  mutation support isn't always obvious from the spec.
- **`push` and `pop`** inline builtins for growing the tape and
  managing the bracket-matching stack.
- **Tuple-returning functions** — `precompute_brackets` returns
  `(jump_fwd, jump_bwd)`, a tuple of two `int` arrays, and the caller
  destructures with `pair.0` and `pair.1`.
- **`while` loops with `&&`** in the condition (the main interpreter
  loop runs while `pc < n`).
- **String indexing** `str(prog[i])` returns a 1-char string at
  runtime (the type checker reports `char`, but the runtime value is
  a string); we wrap with `str(...)` to satisfy the type system.
- **String concat `+`** for accumulating output (`out = out + chr_of(
  tape[ptr])`).
- **No for-loop-scope quirk**: every mutable binding (`tape`, `ptr`,
  `pc`, `out`) is updated inside a while loop, never across a `for`
  boundary. The `for pair in exs` loop in the driver only reads, never
  writes to outer mut bindings.

## Expected output

```
== Brainfuck interpreter in Aether ==

program: ++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.
length: 106 chars

running...
output:
Hello World!

(output length: 13 bytes)

tiny tests:
  33 +'s + '.'      ->  "!"
  65 +'s + '.'      ->  "A"
  72 +'s + '.'      ->  "H"
  H + > + 105 +'s   ->  "Hi"
  8 * 9 loop        ->  "H"

All assertions passed.
```

## Design notes

- **Why BF and not `base_converter.ae`?** We tested array element
  mutation up front (`let mut t = [0,0,0]; t[0] = 5; print(t[0])` →
  `5`), confirmed it works, and chose the more ambitious BF
  interpreter. The task description offered a `base_converter.ae`
  fallback if mutation was broken; it wasn't.
- **The canonical Hello World BF program** is from Wikipedia. The
  interpreter produces exactly `"Hello World!\n"` (13 bytes). Getting
  this right required careful copying of the original — an off-by-one
  in the dash count produces "Hello Worlc!" instead (a real bug we
  hit during development; the correct program uses 8 dashes in the
  second-to-last group, not 9).
- **Tape starts at 64 cells and grows on demand** — most short BF
  programs stay within 64 cells; longer programs trigger one
  `push(tape, 0)` per `>` past the right edge. The tape never
  shrinks, which matches BF's typical "tape is unbounded" semantics.
- **No `,` (input) command** — BF programs that read input would
  need a host-supplied input source, which the v1 playground doesn't
  expose. All our test programs are input-free.
- **ASCII output via a printable-chars string** is the simplest
  approach that fits Aether's stdlib. A more complete version would
  have a 256-char lookup table covering all byte values; we cover
  the printable range plus three common whitespace codes and fall
  back to `"?"` for everything else, which is enough for the test
  programs we run.
