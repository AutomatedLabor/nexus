# Aether stdlib — `state-machine`

The `state-machine` module implements a **finite state machine
(FSM)**: a graph of states connected by transitions triggered by
events.  The machine starts in a designated start state; each
event either triggers a transition (if the current state has a
transition for that event) or is rejected.  The machine records
its history so you can audit the sequence of states visited.

## Why a state machine?

State machines are the right tool when a system has discrete
modes with explicit transitions between them.  Examples: a
traffic light (red → green → yellow → red), a TCP connection
(LISTEN → SYN_RECEIVED → ESTABLISHED → …), a video player (idle
→ playing → paused → playing → stopped), an order workflow
(created → paid → shipped → delivered → closed).  Encoding the
states and transitions explicitly catches bugs (you can't
"transition" from "delivered" back to "created" by accident) and
makes the system's behavior auditable (the history shows exactly
how it got to its current state).

## Construction

`fsmNew()` creates a fresh empty FSM.  Add states with
`fsmAddState(m, name)` (or `fsmAddState(m, name, true)` to mark it
as terminal — for documentation; the machine doesn't enforce
terminality).  Add transitions with `fsmAddTransition(m, from,
event, to)` (both states must exist).  All adder functions are
chainable (return the FSM).

```aether
let m = fsm.fsmNew()
fsm.fsmAddState(m, "idle")
fsm.fsmAddState(m, "running")
fsm.fsmAddState(m, "done", true)
fsm.fsmAddTransition(m, "idle", "start", "running")
fsm.fsmAddTransition(m, "running", "finish", "done")
fsm.fsmAddTransition(m, "running", "cancel", "idle")
```

## Starting and firing events

`fsmStart(m, name)` sets the start state, resets the machine, and
records the initial transition in history.  `fsmEvent(m, event)`
fires an event: if the current state has a transition for this
event, the machine transitions to the target state (recording
the transition in history) and returns the new state name; if
not, returns `null` (the event is rejected) and the state is
unchanged.

```aether
fsm.fsmStart(m, "idle")
fsm.fsmEvent(m, "start")    // → "running"
fsm.fsmEvent(m, "finish")   // → "done"
fsm.fsmEvent(m, "cancel")   // → null (no transition from "done" on "cancel")
```

## Inspection

`fsmCurrent(m)` returns the current state name (or `null` if not
started).  `fsmCanTransition(m, event)` returns true if the
current state has a transition for this event (without actually
firing it — useful for "is this action available?" UI hints).
`fsmHistory(m)` returns the full history of `(event, from, to)`
triples, oldest first.

```aether
fsm.fsmCurrent(m)              // "done"
fsm.fsmCanTransition(m, "x")  // false
let h = fsm.fsmHistory(m)      // [{event:"__start__", from:"", to:"idle"},
                               //  {event:"start", from:"idle", to:"running"},
                               //  {event:"finish", from:"running", to:"done"}]
```

The history is returned as a fresh array (mutation doesn't
affect the FSM's internal history).

## Reset and validate

`fsmReset(m)` resets the machine to its start state, clearing the
history.  `fsmValidate(m)` returns a list of validation errors
(empty if valid): checks that every transition's target state
exists and that the start state (if set) exists.  Useful for
catching construction bugs.

```aether
fsm.fsmReset(m)              // back to "idle", history cleared
let errors = fsm.fsmValidate(m)  // [] if valid
```

## Implementation notes

The FSM stores states in a `Map<name, {transitions: Map<event,
target>, isTerminal}>`.  Transitions are looked up by event name
(O(1) average).  The history is a plain array, appended on each
transition.  No GC of old history (the history grows forever
unless you call `fsmReset`) — for long-running machines, periodic
`fsmReset` (or a v2 `fsmTrimHistory` function) keeps memory
bounded.

## When to use an FSM vs ad-hoc state

Use an FSM when:

- The system has explicit states with a small, enumerable set of
  transitions.
- You want to audit the transition history.
- You want to catch illegal transitions (the FSM rejects them
  with `null`).
- You want to document the system's behavior (the states and
  transitions form a spec).

Use ad-hoc state (a struct with fields) when:

- The state is continuous (numeric fields, not discrete modes).
- The transitions are unconstrained (any state can go to any
  other at any time).
- The system has a small, fixed behavior (the FSM's overhead
  isn't worth it).

## Common patterns

- **Traffic light**: states `red`, `green`, `yellow`; events
  `go`, `warn`, `stop` between them.
- **Order workflow**: states `created`, `paid`, `shipped`,
  `delivered`, `closed`, `cancelled`; events `pay`, `ship`,
  `deliver`, `close`, `cancel` (some allowed only in specific
  states).
- **TCP connection**: states `LISTEN`, `SYN_SENT`,
  `SYN_RECEIVED`, `ESTABLISHED`, `FIN_WAIT_1`, …, `CLOSED`;
  events `connect`, `accept`, `send`, `receive`, `close`, …
- **Video player**: states `idle`, `loading`, `playing`,
  `paused`, `ended`; events `play`, `pause`, `stop`, `seek`,
  `ended`.

## Caveats

- The FSM doesn't support guards (conditional transitions) in
  v1 — every transition is unconditional.  v2 may add `fsmAddGuard`.
- The FSM doesn't support actions (side effects on transitions) —
  use `fsmEvent`'s return value to trigger actions in the caller.
- The FSM doesn't persist — v2 may add serialization.
- The FSM is not hierarchical (no nested states) — flat FSMs only.

The whole module is 10 functions, ~200 lines of TypeScript, no
dependencies.  Wired in by `registerAll` in `aether/stdlib/index.ts`.
