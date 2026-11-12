# fsm_vending_machine.ae

A finite-state machine (FSM) modelling a simple vending machine. Four states (`idle`, `selecting`, `paying`, `dispensing`) and four inputs (`insert_coin`, `select_item`, `cancel`, `dispense_done`). A scripted 15-step sequence walks the machine through coins, selections, cancellations, and refunds, ending back in `idle`.

## What it does

1. **`state_name(s)`** — `0` → "idle", `1` → "selecting", `2` → "paying", `3` → "dispensing" (chained `if/else`).
2. **`input_name(i)`** — `0` → "insert_coin", `1` → "select_item", `2` → "cancel", `3` → "dispense_done".
3. **`step(s, items, credit, input)`** — apply one transition:
   - `insert_coin`: always adds 25c credit; state unchanged.
   - `select_item`: valid only in `idle` (transition to `selecting`) or `selecting` (increment items).
   - `cancel`: refund credit, return to `idle`.
   - `dispense_done`: only valid in `dispensing`; otherwise ignored.
   - Prints the transition side-effect for traceability.
   - Returns the new `(state, items, credit)` tuple.
4. **Driver** — initial state `(idle, 0, 0)`, then runs 15 scripted steps, printing before and after each, ending in `(idle, 0, 25)`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/fsm_vending_machine.ae
```

## Key language features

- **Chained `if/else` expressions** — `state_name` and `input_name` are pure-expression functions built from `if x { "a" } else { if y { "b" } else { ... } }`. Aether's `if` is an expression, so this reads as a ladder.
- **Tuple-of-3 as a state record** — `(state, items, credit)` is threaded through every step. Aether has no record type at the stdlib level, so we use tuples.
- **`let mut` for rebinding** — `state`, `items`, and `credit` need `let mut` so the loop can update them.
- **Tuple destructuring via `.0`/`.1`/`.2`** — `next.0`, `next.1`, `next.2` extract the new state, items, credit.
- **`while` for iteration** — avoids the for-loop-scope quirk.
- **Side-effect printing inside transitions** — the `step` function prints a line to explain what happened; this is acceptable in a demo, though in production you'd separate the transition logic from the printing.

## Expected output

```
== Vending machine FSM ==

states: idle=0, selecting=1, paying=2, dispensing=3
inputs: insert_coin=0, select_item=1, cancel=2, dispense_done=3

initial state: idle (items=0, credit=0c)

step 1: in=insert_coin; from state=idle
    [insert_coin +25c; credit now 25]
  -> new state: idle (items=0, credit=25c)

step 2: in=insert_coin; from state=idle
    [insert_coin +25c; credit now 50]
  -> new state: idle (items=0, credit=50c)
... (steps 3-15 omitted for brevity)

final state: idle (items=0, credit=25c)

All assertions passed.
```

## Design notes

- **State = int, not enum**: Aether has enums, but the stdlib FSM uses ints for compactness. The `state_name` helper maps back to readable strings.
- **No `paying` transitions in the script**: this small FSM treats `paying` and `dispensing` as targets only reached by a hypothetical `pay` input (not modelled here). The script demonstrates `idle`, `selecting`, and back via `cancel` — a complete purchase would need a `pay` input and a `dispense` action.
- **`dispense_done` ignored in `idle`**: the FSM is permissive — unknown transitions are no-ops rather than errors. This avoids needing an explicit error state.
- **`cancel` resets `items` and `credit`**: in a real vending machine, `cancel` would also return the credit physically; here we just zero it.
- **Side-effect printing inside `step`**: the function does both the transition AND the printing. A cleaner design would have `step` return the new state and an "action" enum, and have the driver print based on the action. We trade purity for brevity here.
- **Avoids for-loop-scope quirk**: every loop is `while i < n { ...; i = i + 1 }`.
