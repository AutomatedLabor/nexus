import { describe, it, expect } from "vitest";
import * as F from "./index";

describe("state-machine module", () => {
  it("fsmNew: creates empty FSM", () => {
    const m = F.fsmNew();
    expect(F.fsmCurrent(m)).toBeNull();
    expect(F.fsmHistory(m)).toEqual([]);
  });

  it("fsmAddState: adds a state (chainable)", () => {
    const m = F.fsmNew();
    expect(F.fsmAddState(m, "idle")).toBe(m);
    expect(F.fsmValidate(m)).toEqual([]);
  });

  it("fsmAddState: duplicate is no-op", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "idle");
    F.fsmAddState(m, "idle", true);  // would set isTerminal, but state exists
    // The state should not be marked terminal because the second add is a no-op.
    F.fsmAddTransition(m, "idle", "go", "idle");  // wouldn't be allowed if terminal
    expect(F.fsmValidate(m)).toEqual([]);
  });

  it("fsmAddTransition: adds transition (chainable)", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    F.fsmAddState(m, "b");
    expect(F.fsmAddTransition(m, "a", "go", "b")).toBe(m);
    expect(F.fsmValidate(m)).toEqual([]);
  });

  it("fsmAddTransition: throws if source state missing", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    expect(() => F.fsmAddTransition(m, "missing", "go", "a")).toThrow();
  });

  it("fsmAddTransition: throws if target state missing", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    expect(() => F.fsmAddTransition(m, "a", "go", "missing")).toThrow();
  });

  it("fsmStart: sets start state", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "idle");
    F.fsmStart(m, "idle");
    expect(F.fsmCurrent(m)).toBe("idle");
    expect(F.fsmHistory(m).length).toBe(1);
    expect(F.fsmHistory(m)[0]).toEqual({ event: "__start__", from: "", to: "idle" });
  });

  it("fsmStart: throws if state doesn't exist", () => {
    const m = F.fsmNew();
    expect(() => F.fsmStart(m, "nope")).toThrow();
  });

  it("fsmEvent: transitions to new state", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "idle");
    F.fsmAddState(m, "running");
    F.fsmAddTransition(m, "idle", "start", "running");
    F.fsmStart(m, "idle");
    expect(F.fsmEvent(m, "start")).toBe("running");
    expect(F.fsmCurrent(m)).toBe("running");
  });

  it("fsmEvent: returns null if no transition for event", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "idle");
    F.fsmStart(m, "idle");
    expect(F.fsmEvent(m, "nonexistent")).toBeNull();
    expect(F.fsmCurrent(m)).toBe("idle");
  });

  it("fsmEvent: records history", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    F.fsmAddState(m, "b");
    F.fsmAddState(m, "c");
    F.fsmAddTransition(m, "a", "next", "b");
    F.fsmAddTransition(m, "b", "next", "c");
    F.fsmStart(m, "a");
    F.fsmEvent(m, "next");
    F.fsmEvent(m, "next");
    const history = F.fsmHistory(m);
    expect(history.length).toBe(3);  // start + 2 events
    expect(history[1]).toEqual({ event: "next", from: "a", to: "b" });
    expect(history[2]).toEqual({ event: "next", from: "b", to: "c" });
  });

  it("fsmEvent: throws if not started", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    expect(() => F.fsmEvent(m, "x")).toThrow();
  });

  it("fsmCurrent: returns null if not started", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    expect(F.fsmCurrent(m)).toBeNull();
  });

  it("fsmCanTransition: true for valid event", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "idle");
    F.fsmAddState(m, "running");
    F.fsmAddTransition(m, "idle", "start", "running");
    F.fsmStart(m, "idle");
    expect(F.fsmCanTransition(m, "start")).toBe(true);
  });

  it("fsmCanTransition: false for missing event", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "idle");
    F.fsmStart(m, "idle");
    expect(F.fsmCanTransition(m, "missing")).toBe(false);
  });

  it("fsmCanTransition: false if not started", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    expect(F.fsmCanTransition(m, "x")).toBe(false);
  });

  it("fsmHistory: returns a copy (mutation doesn't affect the FSM)", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    F.fsmStart(m, "a");
    const h1 = F.fsmHistory(m);
    h1.push({ event: "fake", from: "x", to: "y" });
    const h2 = F.fsmHistory(m);
    expect(h2.length).toBe(1);
  });

  it("fsmReset: resets to start state", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    F.fsmAddState(m, "b");
    F.fsmAddTransition(m, "a", "next", "b");
    F.fsmStart(m, "a");
    F.fsmEvent(m, "next");
    expect(F.fsmCurrent(m)).toBe("b");
    F.fsmReset(m);
    expect(F.fsmCurrent(m)).toBe("a");
    expect(F.fsmHistory(m).length).toBe(1);
  });

  it("fsmReset: throws if no start state", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    expect(() => F.fsmReset(m)).toThrow();
  });

  it("fsmValidate: empty for valid FSM", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    F.fsmAddState(m, "b");
    F.fsmAddTransition(m, "a", "next", "b");
    F.fsmAddTransition(m, "b", "back", "a");
    F.fsmStart(m, "a");
    expect(F.fsmValidate(m)).toEqual([]);
  });

  it("fsmValidate: reports invalid start state", () => {
    const m = F.fsmNew();
    m.startState = "nonexistent";  // bypass fsmStart to create an invalid config
    const errors = F.fsmValidate(m);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("nonexistent");
  });

  it("fsmValidate: reports dangling transition target", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    // Manually add a transition to a non-existent state by editing the map.
    m.states.get("a")!.transitions.set("event", "missing");
    const errors = F.fsmValidate(m);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("missing");
  });

  it("a simple traffic-light FSM works end-to-end", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "red");
    F.fsmAddState(m, "green");
    F.fsmAddState(m, "yellow");
    F.fsmAddTransition(m, "red", "go", "green");
    F.fsmAddTransition(m, "green", "warn", "yellow");
    F.fsmAddTransition(m, "yellow", "stop", "red");
    F.fsmStart(m, "red");
    expect(F.fsmEvent(m, "go")).toBe("green");
    expect(F.fsmEvent(m, "warn")).toBe("yellow");
    expect(F.fsmEvent(m, "stop")).toBe("red");
    expect(F.fsmEvent(m, "go")).toBe("green");
    expect(F.fsmHistory(m).length).toBe(5);  // start + 4 transitions
  });

  it("an event that doesn't transition still leaves history unchanged", () => {
    const m = F.fsmNew();
    F.fsmAddState(m, "a");
    F.fsmStart(m, "a");
    const beforeLen = F.fsmHistory(m).length;
    F.fsmEvent(m, "missing");  // rejected
    expect(F.fsmHistory(m).length).toBe(beforeLen);
  });

  it("non-FSM argument panics", () => {
    expect(() => F.fsmCurrent({} as any)).toThrow();
    expect(() => F.fsmEvent(null as any, "x")).toThrow();
    expect(() => F.fsmReset(undefined as any)).toThrow();
  });

  it("non-string state/event panics", () => {
    const m = F.fsmNew();
    expect(() => F.fsmAddState(m, 42 as any)).toThrow();
    expect(() => F.fsmAddTransition(m, "a", 42 as any, "b")).toThrow();
  });
});
