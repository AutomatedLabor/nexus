/**
 * Aether stdlib — `state-machine` module.
 *
 * A finite state machine (FSM): a graph of states connected by
 * transitions triggered by events.  The machine starts in a
 * designated start state; each event either triggers a transition
 * to a new state (if the current state has a transition for that
 * event) or is rejected (no such transition).  The machine
 * records its history so you can audit the sequence of states
 * visited.
 *
 * Implementation: each FSM holds a `Map<stateName, State>` of
 * states (each with its outgoing transitions), the current
 * state name, the start state name, and a history array of
 * `(event, newState)` pairs.  All operations are O(1) average.
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface State {
  /** Outgoing transitions: event → target state name. */
  transitions: Map<string, string>;
  /** True if this state is a terminal (no outgoing transitions). */
  isTerminal?: boolean;
}

export interface FSM {
  states: Map<string, State>;
  startState: string | null;
  currentState: string | null;
  /** History of (event, fromState, toState) triples. */
  history: Array<{ event: string; from: string; to: string }>;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function fsmNew(): FSM {
  return {
    states: new Map(),
    startState: null,
    currentState: null,
    history: [],
  };
}

/** Add a state to the machine.  If the state already exists, this is
 *  a no-op (preserving its transitions).  Returns the FSM (chainable). */
export function fsmAddState(fsm: FSM, name: string, isTerminal: boolean = false): FSM {
  assertFsm(fsm, "fsmAddState");
  assertString(name, "fsmAddState");
  if (!fsm.states.has(name)) {
    fsm.states.set(name, { transitions: new Map(), isTerminal });
  }
  return fsm;
}

/** Add a transition from `from` to `to` on event `event`.
 *  Both states must already exist (use fsmAddState first).
 *  Returns the FSM (chainable). */
export function fsmAddTransition(fsm: FSM, from: string, event: string, to: string): FSM {
  assertFsm(fsm, "fsmAddTransition");
  assertString(from, "fsmAddTransition");
  assertString(event, "fsmAddTransition");
  assertString(to, "fsmAddTransition");
  if (!fsm.states.has(from)) throw new Error("fsmAddTransition: source state '" + from + "' does not exist");
  if (!fsm.states.has(to)) throw new Error("fsmAddTransition: target state '" + to + "' does not exist");
  fsm.states.get(from)!.transitions.set(event, to);
  return fsm;
}

/** Set the start state.  The state must exist.  Returns the FSM. */
export function fsmStart(fsm: FSM, name: string): FSM {
  assertFsm(fsm, "fsmStart");
  assertString(name, "fsmStart");
  if (!fsm.states.has(name)) throw new Error("fsmStart: state '" + name + "' does not exist");
  fsm.startState = name;
  fsm.currentState = name;
  fsm.history = [{ event: "__start__", from: "", to: name }];
  return fsm;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Fire an event.  If the current state has a transition for this
 *  event, the machine transitions to the target state (recording
 *  the transition in history) and returns the new state name.
 *  If not, returns null (the event is rejected).
 *  Throws if the machine hasn't been started. */
export function fsmEvent(fsm: FSM, event: string): string | null {
  assertFsm(fsm, "fsmEvent");
  assertString(event, "fsmEvent");
  if (fsm.currentState === null) throw new Error("fsmEvent: FSM has not been started (call fsmStart first)");
  const state = fsm.states.get(fsm.currentState);
  if (!state) throw new Error("fsmEvent: current state '" + fsm.currentState + "' does not exist");
  const target = state.transitions.get(event);
  if (target === undefined) return null;
  const from = fsm.currentState;
  fsm.currentState = target;
  fsm.history.push({ event, from, to: target });
  return target;
}

/** Return the current state name (or null if not started). */
export function fsmCurrent(fsm: FSM): string | null {
  assertFsm(fsm, "fsmCurrent");
  return fsm.currentState;
}

/** Return true if the current state has a transition for `event`
 *  (i.e., fsmEvent would succeed).  Doesn't actually fire the event. */
export function fsmCanTransition(fsm: FSM, event: string): boolean {
  assertFsm(fsm, "fsmCanTransition");
  assertString(event, "fsmCanTransition");
  if (fsm.currentState === null) return false;
  const state = fsm.states.get(fsm.currentState);
  if (!state) return false;
  return state.transitions.has(event);
}

/** Return the full history of (event, from, to) triples. */
export function fsmHistory(fsm: FSM): Array<{ event: string; from: string; to: string }> {
  assertFsm(fsm, "fsmHistory");
  return fsm.history.slice();
}

/** Reset the machine to its start state (clearing history). */
export function fsmReset(fsm: FSM): void {
  assertFsm(fsm, "fsmReset");
  if (fsm.startState === null) throw new Error("fsmReset: FSM has no start state");
  fsm.currentState = fsm.startState;
  fsm.history = [{ event: "__start__", from: "", to: fsm.startState }];
}

/** Validate the FSM: every transition's target must exist; the
 *  start state (if set) must exist.  Returns an array of error
 *  messages (empty if valid). */
export function fsmValidate(fsm: FSM): string[] {
  assertFsm(fsm, "fsmValidate");
  const errors: string[] = [];
  if (fsm.startState !== null && !fsm.states.has(fsm.startState)) {
    errors.push("start state '" + fsm.startState + "' does not exist");
  }
  for (const [name, state] of fsm.states) {
    for (const [event, target] of state.transitions) {
      if (!fsm.states.has(target)) {
        errors.push("state '" + name + "' has transition on '" + event + "' to non-existent state '" + target + "'");
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "state-machine",
  fns: [
    { name: "fsmNew", sig: "() -> FSM", desc: "Create a new empty finite state machine." },
    { name: "fsmAddState", sig: "(m: FSM, name: string, isTerminal?: bool) -> FSM", desc: "Add a state; chainable." },
    { name: "fsmAddTransition", sig: "(m: FSM, from: string, event: string, to: string) -> FSM", desc: "Add a transition; chainable." },
    { name: "fsmStart", sig: "(m: FSM, name: string) -> FSM", desc: "Set the start state and reset history; chainable." },
    { name: "fsmEvent", sig: "(m: FSM, event: string) -> string?", desc: "Fire an event; returns new state name or null if rejected." },
    { name: "fsmCurrent", sig: "(m: FSM) -> string?", desc: "Current state name (or null if not started)." },
    { name: "fsmCanTransition", sig: "(m: FSM, event: string) -> bool", desc: "True if the current state has a transition for this event." },
    { name: "fsmHistory", sig: "(m: FSM) -> [{event, from, to}]", desc: "Full transition history (oldest first)." },
    { name: "fsmReset", sig: "(m: FSM) -> void", desc: "Reset to the start state, clearing history." },
    { name: "fsmValidate", sig: "(m: FSM) -> string[]", desc: "Returns a list of validation errors (empty if valid)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("fsmNew", fsmNew);
  registerBuiltin("fsmAddState", fsmAddState);
  registerBuiltin("fsmAddTransition", fsmAddTransition);
  registerBuiltin("fsmStart", fsmStart);
  registerBuiltin("fsmEvent", fsmEvent);
  registerBuiltin("fsmCurrent", fsmCurrent);
  registerBuiltin("fsmCanTransition", fsmCanTransition);
  registerBuiltin("fsmHistory", fsmHistory);
  registerBuiltin("fsmReset", fsmReset);
  registerBuiltin("fsmValidate", fsmValidate);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertFsm(x: any, fn: string): asserts x is FSM {
  if (typeof x !== "object" || x === null ||
      !(x.states instanceof Map) ||
      !Array.isArray(x.history)) {
    throw new Error(fn + ": expected FSM, got " + kind(x));
  }
}

function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") {
    throw new Error(fn + ": expected string, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
