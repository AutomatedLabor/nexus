# state_machine_demo.ae

A turnstile finite-state machine. Two states (`Locked`,
`Unlocked`) and two events (`Coin`, `Push`). Transitions:

| State      | Event | Next       | Output   |
|------------|-------|------------|----------|
| Locked     | Coin  | Unlocked   | (silent) |
| Locked     | Push  | Locked     | BEEP     |
| Unlocked   | Coin  | Unlocked   | (silent) |
| Unlocked   | Push  | Locked     | CLICK    |

We run a sequence of events through the FSM and print the state +
output after each step.

## What it does

1. **State / event ids** — encoded as int constants.
2. **`state_name` / `event_name`** — pretty-print helpers.
3. **`step(state, event)`** — the transition function. Returns
   `(next_state, output_text)`. The output is empty string when
   no audible action happens, or a short label like `"BEEP"` /
   `"CLICK"` otherwise.
4. **`run_trace(initial, events)`** — runs a sequence of events
   starting from `initial`. Prints a one-line trace per step:
   `"Locked + Coin -> Unlocked  (silent)"`. Returns the final
   state.
5. **Driver** — defines an event sequence
   `[Coin, Push, Push, Coin, Coin, Push]` and runs it from
   `Locked`. Then runs two shorter traces to verify transitions.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/state_machine_demo.ae
```

## Key language features

- **Nested `if/else`** for the transition function — a 2x2 truth
  table encoded as nested ifs. Each branch returns a tuple
  `(int, string)`.
- **Tuple-typed return**: `step` returns `(int, string)` so we
  can return both the next state and the output label.
- **`if act == "" { "(silent)" } else { act }`** — a ternary-like
  expression to pick the display string.
- **`while` loop in `run_trace`** to walk the event list —
  sidesteps the for-loop-scope quirk.

## Expected output

```
== Turnstile finite-state machine ==

starting state: Locked
event sequence: Coin, Push, Push, Coin, Coin, Push

  Locked + Coin -> Unlocked  (silent)
  Unlocked + Push -> Locked  CLICK
  Locked + Push -> Locked  BEEP
  Locked + Coin -> Unlocked  (silent)
  Unlocked + Coin -> Unlocked  (silent)
  Unlocked + Push -> Locked  CLICK

final state: Locked

starting state: Unlocked
event sequence: Push
  Unlocked + Push -> Locked  CLICK

starting state: Locked
event sequence: Push, Push, Push
  Locked + Push -> Locked  BEEP
  Locked + Push -> Locked  BEEP
  Locked + Push -> Locked  BEEP

All assertions passed.
```

## Design notes

- This is the canonical FSM example from every textbook (the
  coin-operated turnstile). It's small enough to verify by
  inspection but covers all four (state, event) combinations.
- The output labels (`BEEP` for "you pushed a locked turnstile",
  `CLICK` for "you pushed through") make the trace easy to read
  even without knowing the transition table.
- The same pattern scales to bigger FSMs: encode states and
  events as ints, implement `step` as a function, and you have a
  table-driven state machine. For large FSMs you'd want a real
  transition table (2D array indexed by state and event).
- The 3-trace demo covers: a "realistic" sequence, a single
  transition from Unlocked, and a "panic-push" sequence that
  just beeps every time.
