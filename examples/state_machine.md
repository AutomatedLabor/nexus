# state_machine.ae

A finite state machine (FSM) modeling a turnstile, the classic
FSM teaching example. The turnstile has two states (`Locked`,
`Unlocked`) and two events (`Coin`, `Push`), with a transition
function that maps `(state, event) → next_state`.

## What it does

1. **Enums** — `State` (`Locked`, `Unlocked`) and `Event`
   (`Coin`, `Push`) declared as Aether enums.
2. **`step(s, e)`** — the transition function, written as a
   nested `match` (state × event) that returns the next state.
3. **`run_events(start, events)`** — runs a list of events from
   a starting state, threading the state forward via recursive
   helper. Returns the final state and a trace array of
   `(before, event, after)` tuples.
4. **Driver** — prints four scenarios (push without paying,
   coin then push, two coins, etc.), each showing the step-by-step
   transition trace and the final state.
5. **Assertions** — the four single-step transitions are
   verified with `assert_eq`, plus three full-run checks.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/state_machine.ae
```

## Key language features

- **Enums with unit variants** — `enum State { Locked, Unlocked }`.
- **Pattern matching** with `match`/`=>` arms; nested `match`
  inside `match` arms.
- **Tuple construction** — `trace + [(s, e, next)]` builds
  tuples and appends them.
- **Recursive helper function** — `helper(i, s, trace)` carries
  state through the recursion and accumulates the trace.
- **Field access on tuples** — `step_tuple.0`, `.1`, `.2`.

## Expected output

```
== Finite state machine: turnstile ==

Scenario 1: push without coin (locked, locked):
  Locked     + Push  -> Locked
  Locked     + Push  -> Locked
  Locked     + Push  -> Locked
  final state: Locked

Scenario 2: coin, push (unlocked, then locked):
  Locked     + Coin  -> Unlocked
  Unlocked   + Push  -> Locked
  final state: Locked
...
All assertions passed.
```

## Design notes

The trace is built with array concatenation (`trace + [tuple]`)
rather than mutation, so each step's `helper` invocation is
referentially transparent. The final state is the head of the
returned tuple, the trace is the tail. The driver uses `while`
loops (not `for`) to walk the trace array, avoiding the v1
for-loop-scope quirk.
