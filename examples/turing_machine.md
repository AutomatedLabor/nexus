# turing_machine.ae

A small Turing machine that increments a binary number. The
machine walks right to the end of the number, then steps left
while carrying, flipping 1s to 0s and writing a final 1 when
it hits a 0 or a blank.

## What it does

1. **Tape representation** — a list of strings ("0", "1", "_"
   blank) plus a head index.
2. **States** — `Start` (walk right), `AddOne` (carry-add phase),
   `Done` (halt). Hard-coded transition function inside
   `run_increment`.
3. **`read_tape`**, **`write_tape`** — pure helpers that read
   or write the cell under the head. `write_tape` returns a
   fresh tape (no in-place mutation).
4. **`run_increment(tape, head)`** — the main loop. Steps until
   the `Done` state or a safety limit of 1000 iterations.
5. **Driver** — runs five test cases: increment `0 → 1`,
   `1 → 10`, `1011 → 1100`, `111 → 1000` (carry overflow past
   the top bit), and `101010 → 101011`. Each prints the tape
   before and after, with the head marked by `^`.
6. **Sanity assertions** — `bin_to_int(digits(tape_after))`
   checks the binary value of the produced digits equals
   `input + 1`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/turing_machine.ae
```

## Key language features

- **State-machine inside a `while` loop** — the `state`
  variable is updated by the dispatch (`if state == "Start" { ... } else if state == "AddOne" { ... }`).
- **Pure tape writes** — `write_tape` returns a fresh array
  rebuilt cell-by-cell. The `tape = write_tape(...)` pattern
  threads the immutable tape forward like a state monad.
- **`show_tape`** — builds two parallel strings (cells and
  head marker) and joins them with a newline, so the marker
  row aligns under the cell row.
- **`bin_to_int` helper** — converts a `[string]` of bits
  (most-significant first) to a binary integer.

## Expected output

```
== Turing machine: binary increment ==

Test 3: increment '1011' (expect '1100')
before:
 _  1  0  1  1  _
    ^
after:
 _  1  1  0  0  _
    ^
All assertions passed.
```

## Design notes

The tape is **pre-padded with blanks** so the head never runs
off the end (we don't auto-extend the tape on demand — that
would require dynamic array growth inside the loop, which is
doable but adds complexity). The carry-overflow case
(`111 → 1000`) writes a 1 in the blank cell to the left of the
most-significant bit, matching the expected binary result.
