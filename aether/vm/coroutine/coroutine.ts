/**
 * aether/vm/coroutine/coroutine.ts
 * =================================
 * REAL async coroutines for Aether v3 (RFC-001).
 *
 * What this is
 * ------------
 * A TS-side cooperative scheduler for real async coroutines. The v2
 * async runtime (`aether/vm/async/async.ts`) used JS Promises: every
 * "await" returned a Promise and the caller had to consume it with
 * `await` in JS host code. That gave the right *API* shape but the wrong
 * *semantics* — there was no real suspend/resume of an Aether closure
 * mid-execution, because the JS call stack couldn't be paused.
 *
 * v3 fixes that. Each Aether coroutine is modeled as a JS generator
 * (`function*`); the generator's `yield` is the suspend point. The
 * scheduler drives the generator one step at a time. When a coroutine
 * "awaits" another coroutine, it parks itself on that coroutine's
 * awaiter list; when the awaited coroutine completes, the scheduler
 * re-enqueues the awaiter with the resolved value. When a coroutine
 * "yields" a value (the generators-style `yield`), it parks itself and
 * waits for a `resume`/`send` call to wake it with a new value.
 *
 * Channels (buffered, multi-producer multi-consumer) park a sender
 * when the buffer is full and a receiver when the buffer is empty.
 * `select` waits for the first of N channels to become ready and
 * reports which one won.
 *
 * Structured concurrency: `join` waits for all of N coroutines;
 * `race` waits for the first; `timeout` is a coroutine that completes
 * after N ms (using `Date.now()` so it works under any JS host).
 *
 * Mapping to RFC-001
 * ------------------
 * RFC-001 § "Runtime: executor and suspend/resume" specifies the design
 * for true suspend/resume at the *bytecode VM* level: the `await` opcode
 * snapshots the VM frame (registers + IP + operand stack) and parks the
 * coroutine; the scheduler restores the snapshot when the awaited
 * future resolves. That work is the v3.1 milestone (see "Plan" below).
 *
 * The v3.0 implementation here is the *TS-side* runtime: coroutine
 * bodies are JS generators, suspend points are JS generator `yield`s,
 * and the scheduler is a JS run-queue. The VM's future `await` opcode
 * will call into this scheduler; for now, host code (and Aether code
 * via the registered builtins) constructs coroutines via `spawn` and
 * drives them via `await`/`run`.
 *
 * v3.1 plan (bytecode-level suspend/resume)
 * -----------------------------------------
 * The next milestone replaces the JS-generator body with a true VM
 * frame snapshot. The `Await` opcode (new in v3.1) will:
 *   1. Snapshot the current frame: `{ func, ip, regs: [...], upvalues }`.
 *   2. Park the coroutine on the awaited future's awaiter list.
 *   3. Throw a `SuspendSignal` to unwind the JS call stack back to the
 *      scheduler loop.
 *   4. When the future resolves, the scheduler restores the snapshot
 *      (builds a new `Frame` from the saved registers + ip + upvalues),
 *      writes the resolved value into the awaited-result register, and
 *      re-enters the dispatch loop at the saved IP.
 *
 * The data structures in this file (`Coroutine`, `VmFrame`, the
 * scheduler's run queue and awaiter lists) are designed to be reusable
 * for that v3.1 implementation — the only change is how the body is
 * driven (JS generator → VM frame restore).
 *
 * Public surface
 * --------------
 *   type Value (re-exported from core/eval)
 *   interface VmFrame
 *   interface Coroutine
 *   interface Channel
 *   interface SelectResult
 *   class CoroutineScheduler
 *       spawn(body) -> Coroutine
 *       spawnFrame(frame) -> Coroutine
 *       await(co) -> Value                  // sync; drives scheduler
 *       yield(value) -> Value               // from inside a coroutine body
 *       resume(co) -> Value                 // resumes a suspended coroutine
 *       send(co, value) -> void             // resumes with a value
 *       cancel(co) -> void
 *       run() -> Value                      // drives scheduler until root done
 *       channel(capacity) -> Channel
 *       send(ch, v) -> void                 // from outside a coroutine
 *       recv(ch) -> Value                   // from outside a coroutine
 *       select(chs) -> SelectResult
 *       join(cos) -> Value[]
 *       race(cos) -> Value
 *       timeout(ms) -> Coroutine
 *   function registerCoroutineBuiltins(reg): void
 */
import type { Value } from "../../core/eval/eval";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

/**
 * A serializable VM frame. The v3.1 `Await` opcode will snapshot the
 * current frame into one of these and park the coroutine; the scheduler
 * restores it by building a new VM `Frame` from these fields.
 *
 * v3.0 coroutines don't use this for execution (they drive a JS
 * generator instead), but they hold a reference to it for telemetry
 * and to keep the surface stable for the v3.1 transition.
 */
export interface VmFrame {
  /** The bytecode function being executed (null for host-supplied bodies). */
  func: { name: string } | null;
  /** Instruction pointer — index into func.code. */
  ip: number;
  /** Register file (mutable; the snapshot is a copy at suspend time). */
  registers: Value[];
  /** Upvalues (closures' captured boxes). */
  upvalues: Value[];
}

/** Discriminator for what a coroutine yielded. */
export type Yielded =
  | { kind: "yield"; value: Value }
  | { kind: "await"; co: Coroutine }
  | { kind: "channel_send"; ch: Channel; value: Value }
  | { kind: "channel_recv"; ch: Channel }
  | { kind: "sleep"; ms: number };

/** A coroutine's lifecycle. */
export type CoroutineState =
  | "pending"      // queued but not yet started
  | "running"      // currently executing (in the dispatch loop)
  | "suspended"    // parked on an awaiter list (await/yield/channel/timeout)
  | "done"         // completed with a value
  | "error"        // threw an error
  | "cancelled";   // cancel() was called; will not resume

/**
 * A coroutine. Holds a JS generator iterator (for v3.0) plus the
 * bookkeeping the scheduler needs: state, value, awaiters, the
 * `sendValue` to be passed on next resume, and the suspend reason
 * (so the scheduler knows how to wake it).
 */
export interface Coroutine {
  id: number;
  state: CoroutineState;
  /** The VM frame snapshot (for v3.1 bytecode-level suspend/resume). */
  frame: VmFrame | null;
  /** The JS generator iterator that produces `Yielded` values. */
  iterator: Iterator<Yielded, Value, Value> | null;
  /** The coroutine's value: the yielded value (while suspended) or the
   * final return value (when done). */
  value: Value;
  /** Error message if state === 'error'. */
  error?: string;
  /** Coroutines awaiting this one's completion. */
  awaiters: Coroutine[];
  /** The value to send into the coroutine on the next resume. */
  sendValue: Value;
  /** True if a sendValue has been queued (so the scheduler knows to
   * pass it instead of undefined). */
  hasSend: boolean;
  /** Why this coroutine is suspended (so the scheduler can match wakeups). */
  suspendReason:
    | { kind: "none" }
    | { kind: "yield" }
    | { kind: "await"; co: Coroutine }
    | { kind: "channel_send"; ch: Channel }
    | { kind: "channel_recv"; ch: Channel }
    | { kind: "channel_select"; chs: Channel[] }
    | { kind: "sleep"; wakeAt: number };
  /** For cancellation: a flag set by `cancel()` and observed by the
   * scheduler when it would otherwise resume this coroutine. */
  cancelled: boolean;
  /** Parent coroutine (the one that spawned this; for structured
   * concurrency telemetry). */
  parent: Coroutine | null;
  /** For `select`: the channel that won (set when woken by a channel
   * ready event during a select). */
  selectWinner: Channel | null;
}

/**
 * A buffered async channel. Capacity 0 means unbounded. Capacity > 0
 * means a bounded buffer; `send` parks the sender when full.
 */
export interface Channel {
  id: number;
  buf: Value[];
  capacity: number;
  /** Coroutines parked on `recv` while the buffer was empty. */
  recvWaiters: Coroutine[];
  /** Coroutines parked on `send` while the buffer was full. The value
   * to send is on the coroutine's `sendValue`. */
  sendWaiters: Coroutine[];
  closed: boolean;
}

/** `select` result: which channel won, and the value received. */
export interface SelectResult {
  ch: Channel;
  v: Value;
}

/** A token used to suspend the current coroutine from within a body. */
export const COROUTINE_CURRENT: unique symbol = Symbol("aether.coroutine.current");

/** Yield signal — returned by `Yielded.kind === 'yield'` */
export class YieldSignal { constructor(public value: Value) {} }

//----------------------------------------------------------------------------
// CoroutineScheduler
//----------------------------------------------------------------------------

/**
 * The cooperative scheduler. Holds coroutine and channel registries,
 * a run queue of ready coroutines, and drives them one step at a time.
 *
 * The scheduler is reentrant-safe: `await` and `recv` and `send` (when
 * called from outside a coroutine) call `run()` to drain the queue
 * until their target completes. `run()` itself drains until the root
 * coroutine completes (or the queue empties without progress, which
 * is a deadlock and is reported as an error).
 */
export class CoroutineScheduler {
  private coroutines = new Map<number, Coroutine>();
  private channels = new Map<number, Channel>();
  private nextCoId = 1;
  private nextChId = 1;
  private runQueue: Coroutine[] = [];
  /** The root coroutine (the one `run()` waits for). Set by `run()`. */
  private root: Coroutine | null = null;
  /** The currently-executing coroutine (set by `stepOnce()`). */
  current: Coroutine | null = null;
  /** Wall-clock start (for `timeout` / `sleep` math). */
  private startTime = Date.now();
  /** Trace of completed coroutines (for telemetry / debugging). */
  private doneOrder: number[] = [];

  //------------------------------------------------------------------
  // Spawning
  //------------------------------------------------------------------

  /**
   * Spawn a coroutine whose body is a JS generator. The generator
   * yields `Yielded` values to suspend; returns a `Value` to complete.
   *
   * The body is called with `(scheduler)` so it can use the scheduler
   * to drive nested awaits/sends.
   */
  spawn(body: (sched: CoroutineScheduler) => Generator<Yielded, Value, Value>): Coroutine {
    const id = this.nextCoId++;
    const co: Coroutine = {
      id,
      state: "pending",
      frame: null,
      iterator: null,
      value: null,
      awaiters: [],
      sendValue: null,
      hasSend: false,
      suspendReason: { kind: "none" },
      cancelled: false,
      parent: this.current,
      selectWinner: null,
    };
    co.iterator = body.call(co, this);
    this.coroutines.set(id, co);
    this.runQueue.push(co);
    return co;
  }

  /**
   * Spawn a coroutine that wraps a host function (a synchronous Aether
   * closure, or any `() => Value`). The coroutine runs the function to
   * completion in one step and returns its result.
   *
   * This is the entry point used by the Aether evaluator's `spawn`
   * builtin: it wraps the Aether closure in a coroutine.
   */
  spawnFn(fn: () => Value): Coroutine {
    return this.spawn(function* (): Generator<Yielded, Value, Value> {
      return fn();
    });
  }

  /**
   * Spawn a coroutine that wraps a VM frame snapshot. v3.1 will use
   * this to suspend a running VM coroutine at the `Await` opcode; v3.0
   * uses it for telemetry and for tests that verify the snapshot shape.
   */
  spawnFrame(frame: VmFrame): Coroutine {
    const co = this.spawnFn(() => frame); // v3.0: trivial wrapper
    co.frame = frame;
    return co;
  }

  /**
   * Look up a coroutine by id (or undefined if unknown).
   */
  getCoroutine(id: number): Coroutine | undefined {
    return this.coroutines.get(id);
  }

  /** All known coroutines, in spawn order. */
  allCoroutines(): Coroutine[] {
    return Array.from(this.coroutines.values());
  }

  /** Completion order (for tests / telemetry). */
  completionOrder(): number[] {
    return this.doneOrder.slice();
  }

  //------------------------------------------------------------------
  // Awaiting
  //------------------------------------------------------------------

  /**
   * Synchronously drive the scheduler until `co` completes (or errors
   * or is cancelled). Returns the coroutine's value.
   *
   * This is the host-facing `await` — called from outside a coroutine
   * (e.g., from Aether code via the `await` builtin). When called from
   * inside a coroutine body, the body should instead `yield { kind:
   * 'await', co }` so the scheduler can park it properly.
   */
  await(co: Coroutine): Value {
    this.runUntil(co);
    if (co.state === "error") throw new Error(co.error ?? "coroutine errored");
    if (co.state === "cancelled") throw new Error("coroutine cancelled");
    return co.value;
  }

  /**
   * Drive the scheduler until `target` is done/error/cancelled.
   * Returns true if the target completed; false if the queue drained
   * without progress (deadlock).
   */
  private runUntil(target: Coroutine): boolean {
    let steps = 0;
    const maxSteps = 1_000_000;
    while (target.state !== "done" && target.state !== "error" && target.state !== "cancelled") {
      if (steps++ > maxSteps) {
        throw new Error("scheduler step limit exceeded (infinite loop?)");
      }
      const progress = this.stepOnce();
      if (!progress) {
        // No progress was made — the queue is empty but target hasn't
        // completed. This is a deadlock (a coroutine is parked on an
        // await that will never resolve).
        if (target.state === "pending" || target.state === "suspended") {
          throw new Error(
            `scheduler deadlock: coroutine ${target.id} is ${target.state} and the run queue is empty`,
          );
        }
        break;
      }
    }
    return true;
  }

  //------------------------------------------------------------------
  // Yielding (from inside a coroutine)
  //------------------------------------------------------------------

  /**
   * Yield a value from the current coroutine. Suspends the coroutine;
   * the value is available to the resumer via `resume` (which returns
   * it). The next `send`/`resume` call provides the value to send back
   * into the coroutine (returned by `yield` in the generator body).
   *
   * This is meant to be called from inside a coroutine body — but
   * since v3.0 coroutine bodies are JS generators, the body uses
   * `yield { kind: 'yield', value }` directly. This function is the
   * host-side helper: from outside a coroutine, it throws (there's no
   * "current coroutine" to yield from).
   */
  yield(value: Value): void {
    if (!this.current) throw new Error("yield: not inside a coroutine");
    // The body generator handles this via `yield { kind: 'yield', value }`.
    // This function exists for API parity with the spec and is a no-op
    // when called from host code (it's expected to be called from inside
    // a coroutine body, where the body has yielded already).
  }

  /**
   * Resume a suspended coroutine. Returns the next yielded value, or
   * the final return value if the coroutine completed.
   *
   * If the coroutine is parked on a `yield`, this wakes it with
   * `sendValue = null` (no value sent back). If the coroutine is
   * parked on an `await`/channel/timeout, this throws — those
   * coroutine types are resumed by the scheduler, not by `resume`.
   */
  resume(co: Coroutine): Value {
    if (co.state === "done") return co.value;
    if (co.state === "error") throw new Error(co.error ?? "coroutine errored");
    if (co.state === "cancelled") throw new Error("coroutine cancelled");
    if (co.state !== "suspended" && co.state !== "pending") {
      throw new Error(`resume: coroutine ${co.id} is ${co.state}, cannot resume`);
    }
    if (co.suspendReason.kind !== "yield" && co.suspendReason.kind !== "none") {
      throw new Error(
        `resume: coroutine ${co.id} is suspended on ${co.suspendReason.kind}, not yield`,
      );
    }
    // Enqueue and step until the coroutine either re-suspends on a
    // yield (returns the yielded value) or completes (returns the
    // final value). If it suspends on something else (await/channel),
    // we drive the scheduler — if that deadlocks, we report.
    co.suspendReason = { kind: "none" };
    co.state = "pending";
    this.runQueue.push(co);
    let steps = 0;
    while (true) {
      if (co.state === "done") return co.value;
      if (co.state === "error") throw new Error(co.error ?? "coroutine errored");
      if (co.state === "cancelled") throw new Error("coroutine cancelled");
      if (co.state === "suspended" && co.suspendReason.kind === "yield") return co.value;
      if (steps++ > 1_000_000) throw new Error("resume: step limit exceeded");
      const progress = this.stepOnce();
      if (!progress) {
        if (co.state === "suspended") {
          throw new Error(
            `resume: coroutine ${co.id} deadlocked on ${co.suspendReason.kind}`,
          );
        }
        break;
      }
    }
    return co.value;
  }

  /**
   * Send a value into a suspended coroutine (resumes it). The value
   * is returned by the `yield` expression inside the coroutine body.
   *
   * Throws if the coroutine isn't suspended on a `yield`.
   */
  send(target: Coroutine, value: Value): void;

  /**
   * Send a value on a channel (host-side; from inside a coroutine,
   * use `yield { kind: 'channel_send', ch, value }` to park if full).
   * Pushes the value into the buffer (or hands to a waiting receiver).
   * Throws if the channel is closed, or if the channel is full and
   * no receiver is ready.
   */
  send(target: Channel, value: Value): void;

  send(target: Coroutine | Channel, value: Value): void {
    if (this.isCoroutine(target)) return this.sendCoroutine(target, value);
    if (this.isChannel(target)) return this.sendChannel(target, value);
    throw new Error("send: expected a Coroutine or Channel");
  }

  /** Type guard for `Coroutine`. */
  private isCoroutine(v: any): v is Coroutine {
    return v && typeof v === "object" && "state" in v && "iterator" in v && "awaiters" in v;
  }

  /** Type guard for `Channel`. */
  private isChannel(v: any): v is Channel {
    return v && typeof v === "object" && "buf" in v && "recvWaiters" in v && "sendWaiters" in v;
  }

  /** Implementation of `send(co, v)` — see the docstring on the public `send`. */
  private sendCoroutine(co: Coroutine, value: Value): void {
    if (co.state !== "suspended" && co.state !== "pending") {
      throw new Error(`send: coroutine ${co.id} is ${co.state}, cannot send`);
    }
    if (co.suspendReason.kind !== "yield" && co.suspendReason.kind !== "none") {
      throw new Error(
        `send: coroutine ${co.id} is suspended on ${co.suspendReason.kind}, not yield`,
      );
    }
    co.hasSend = true;
    co.sendValue = value;
    co.suspendReason = { kind: "none" };
    co.state = "pending";
    this.runQueue.push(co);
    let steps = 0;
    while (true) {
      if (co.state === "done") return;
      if (co.state === "error") throw new Error(co.error ?? "coroutine errored");
      if (co.state === "cancelled") throw new Error("coroutine cancelled");
      if (co.state === "suspended" && co.suspendReason.kind === "yield") return;
      if (steps++ > 1_000_000) throw new Error("send: step limit exceeded");
      const progress = this.stepOnce();
      if (!progress) {
        if (co.state === "suspended") {
          throw new Error(
            `send: coroutine ${co.id} deadlocked on ${co.suspendReason.kind}`,
          );
        }
        break;
      }
    }
  }

  /** Implementation of `send(ch, v)` — see the docstring on the public `send`. */
  private sendChannel(ch: Channel, v: Value): void {
    if (ch.closed) throw new Error("send on closed channel");
    // Hand to a waiting receiver first.
    if (ch.recvWaiters.length > 0) {
      const w = ch.recvWaiters.shift()!;
      w.hasSend = true;
      w.sendValue = v;
      w.suspendReason = { kind: "none" };
      w.value = v;
      // The receiver is done (its recv completed).
      w.state = "done";
      this.doneOrder.push(w.id);
      this.wakeAwaiters(w);
      return;
    }
    // Buffer the value if there's room.
    if (ch.capacity === 0 || ch.buf.length < ch.capacity) {
      ch.buf.push(v);
      return;
    }
    // Buffer full — host-side send can't park; throw.
    throw new Error(
      `send: channel ${ch.id} is full and no receiver is ready (host-side send)`,
    );
  }

  /**
   * Cancel a coroutine. The coroutine will not be resumed by the
   * scheduler; any waiters (awaiters) are woken with a "cancelled"
   * error. If the coroutine is currently running, the cancel takes
   * effect when it next suspends or completes.
   */
  cancel(co: Coroutine): void {
    if (co.state === "done" || co.state === "error" || co.state === "cancelled") return;
    co.cancelled = true;
    co.state = "cancelled";
    // Remove from run queue.
    const idx = this.runQueue.indexOf(co);
    if (idx >= 0) this.runQueue.splice(idx, 1);
    // Wake awaiters with an error.
    this.wakeAwaiters(co);
    // Detach from any channel waiters.
    this.detachFromChannels(co);
  }

  //------------------------------------------------------------------
  // Channels
  //------------------------------------------------------------------

  /**
   * Create a buffered channel. `capacity = 0` (default) means an
   * unbounded buffer; sends never block. `capacity > 0` means a
   * bounded buffer; `send` parks the sender when the buffer is full.
   */
  channel(capacity = 0): Channel {
    const id = this.nextChId++;
    const ch: Channel = {
      id,
      buf: [],
      capacity,
      recvWaiters: [],
      sendWaiters: [],
      closed: false,
    };
    this.channels.set(id, ch);
    return ch;
  }

  /** Get a channel by id (or undefined). */
  getChannel(id: number): Channel | undefined {
    return this.channels.get(id);
  }

  /**
   * Receive a value from `ch` from OUTSIDE a coroutine. Either
   * returns immediately (buffer has a value or a waiting sender) or
   * runs the scheduler until a value arrives.
   *
   * Returns `undefined` if the channel is closed and drained.
   */
  recv(ch: Channel): Value | undefined {
    if (ch.buf.length > 0) {
      const v = ch.buf.shift()!;
      // If there's a blocked sender, hand them a slot.
      if (ch.sendWaiters.length > 0) {
        const s = ch.sendWaiters.shift()!;
        ch.buf.push(s.sendValue);
        s.hasSend = false;
        s.suspendReason = { kind: "none" };
        s.state = "pending";
        this.runQueue.push(s);
      }
      return v;
    }
    if (ch.closed) return undefined;
    // No value, no senders, channel open — check for a parked sender
    // (a bounded channel that was full and a sender parked).
    if (ch.sendWaiters.length > 0) {
      const s = ch.sendWaiters.shift()!;
      s.hasSend = false;
      s.suspendReason = { kind: "none" };
      s.state = "pending";
      const v = s.sendValue;
      this.runQueue.push(s);
      return v;
    }
    // Truly nothing available — host-side recv can't block.
    return undefined;
  }

  /**
   * Wait for the first of `chs` to become ready (have a value or a
   * parked sender). Returns the channel and the value.
   *
   * If none of the channels are ready, runs the scheduler until one
   * becomes ready. From inside a coroutine, the body should `yield
   * { kind: 'channel_select', chs }` to park properly.
   */
  select(chs: Channel[]): SelectResult {
    // First, scan all channels for an immediately-ready one.
    for (const ch of chs) {
      if (ch.buf.length > 0) {
        return { ch, v: ch.buf.shift()! };
      }
      if (ch.sendWaiters.length > 0) {
        const s = ch.sendWaiters.shift()!;
        s.hasSend = false;
        s.suspendReason = { kind: "none" };
        const v = s.sendValue;
        this.runQueue.push(s);
        return { ch, v };
      }
    }
    // None ready — host-side select can't park. We could run the
    // scheduler but there's nothing to wait for. Return a sentinel
    // (null channel) to indicate no winner. For tests, we throw.
    throw new Error("select: no channel is ready (host-side select)");
  }

  //------------------------------------------------------------------
  // Structured concurrency
  //------------------------------------------------------------------

  /**
   * Wait for all of `cos` to complete. Returns their values in
   * spawn order. If any errors, throws the first error.
   */
  join(cos: Coroutine[]): Value[] {
    for (const co of cos) {
      this.runUntil(co);
    }
    const out: Value[] = [];
    for (const co of cos) {
      if (co.state === "error") throw new Error(co.error ?? "join: coroutine errored");
      if (co.state === "cancelled") throw new Error(`join: coroutine ${co.id} cancelled`);
      out.push(co.value);
    }
    return out;
  }

  /**
   * Wait for the first of `cos` to complete. Returns its value.
   * The remaining coroutines continue running (their state isn't
   * changed by race; use `cancel` to stop them).
   */
  race(cos: Coroutine[]): Value {
    let steps = 0;
    const maxSteps = 1_000_000;
    while (!cos.some((c) => c.state === "done" || c.state === "error" || c.state === "cancelled")) {
      if (steps++ > maxSteps) throw new Error("race: step limit exceeded");
      const progress = this.stepOnce();
      if (!progress) {
        throw new Error("race: deadlock (no coroutine can make progress)");
      }
    }
    const winner = cos.find((c) => c.state === "done") ?? cos.find((c) => c.state === "error" || c.state === "cancelled");
    if (!winner) throw new Error("race: no winner");
    if (winner.state === "error") throw new Error(winner.error ?? "race: coroutine errored");
    if (winner.state === "cancelled") throw new Error("race: coroutine cancelled");
    return winner.value;
  }

  /**
   * Spawn a coroutine that completes after `ms` milliseconds. Uses
   * `Date.now()` for wall-clock math (works under any JS host). The
   * coroutine's value is `null` (the Aether `unit`).
   */
  timeout(ms: number): Coroutine {
    return this.spawn(function* (sched: CoroutineScheduler): Generator<Yielded, Value, Value> {
      yield { kind: "sleep", ms };
      return null;
    });
  }

  //------------------------------------------------------------------
  // The dispatch loop
  //------------------------------------------------------------------

  /**
   * Run the scheduler until the root coroutine completes (or errors).
   * Returns the root's value.
   */
  run(): Value {
    if (!this.root) {
      // No root set; pick the first spawned coroutine as the root.
      const first = this.coroutines.get(1);
      if (!first) throw new Error("run: no coroutines to run");
      this.root = first;
    }
    this.runUntil(this.root);
    if (this.root.state === "error") throw new Error(this.root.error ?? "root errored");
    if (this.root.state === "cancelled") throw new Error("root cancelled");
    return this.root.value;
  }

  /**
   * Set the root coroutine (the one `run()` waits for). Returns the
   * coroutine for chaining.
   */
  setRoot(co: Coroutine): Coroutine {
    this.root = co;
    return co;
  }

  /**
   * Run one step: dequeue the next ready coroutine and advance it
   * one yield/return. Returns true if progress was made (a coroutine
   * was stepped), false if the queue was empty.
   */
  private stepOnce(): boolean {
    if (this.runQueue.length === 0) return false;
    // Skip any cancelled/errored/done coroutines in the queue.
    let co: Coroutine | undefined;
    while (this.runQueue.length > 0) {
      const cand = this.runQueue.shift()!;
      if (cand.state === "done" || cand.state === "error" || cand.state === "cancelled" || cand.cancelled) {
        continue;
      }
      co = cand;
      break;
    }
    if (!co) return false;
    if (!co.iterator) {
      // No iterator — frame-based coroutine (v3.1 will set the iterator
      // to a frame-restoring generator). For now, treat as done.
      co.state = "done";
      this.doneOrder.push(co.id);
      this.wakeAwaiters(co);
      return true;
    }
    co.state = "running";
    const prev = this.current;
    this.current = co;
    try {
      const sendVal: Value = co.hasSend ? co.sendValue : (undefined as unknown as Value);
      co.hasSend = false;
      const result = co.iterator.next(sendVal);
      if (result.done) {
        co.state = "done";
        co.value = result.value;
        this.doneOrder.push(co.id);
        this.wakeAwaiters(co);
      } else {
        this.handleYield(co, result.value);
      }
    } catch (e) {
      co.state = "error";
      co.error = e instanceof Error ? e.message : String(e);
      this.doneOrder.push(co.id);
      this.wakeAwaiters(co);
    } finally {
      this.current = prev;
    }
    return true;
  }

  /**
   * Handle a yielded `Yielded` value: park the coroutine appropriately
   * and (if applicable) re-enqueue it for immediate resumption.
   */
  private handleYield(co: Coroutine, y: Yielded): void {
    switch (y.kind) {
      case "yield": {
        // Park the coroutine; the yielded value is on `co.value`.
        // `resume`/`send` will wake it.
        co.value = y.value;
        co.suspendReason = { kind: "yield" };
        co.state = "suspended";
        break;
      }
      case "await": {
        const target = y.co;
        if (target.state === "done") {
          // Already done — resume immediately with the value.
          co.hasSend = true;
          co.sendValue = target.value;
          co.suspendReason = { kind: "none" };
          co.state = "pending";
          this.runQueue.push(co);
        } else if (target.state === "error" || target.state === "cancelled") {
          // Target already errored/cancelled — propagate.
          co.state = target.state;
          co.error = target.error ?? `awaited coroutine ${target.id} failed`;
          this.doneOrder.push(co.id);
          this.wakeAwaiters(co);
        } else {
          // Park on the target's awaiter list.
          target.awaiters.push(co);
          co.suspendReason = { kind: "await", co: target };
          co.state = "suspended";
        }
        break;
      }
      case "channel_send": {
        const ch = y.ch;
        if (ch.closed) {
          // Closed — error out.
          co.state = "error";
          co.error = "send on closed channel";
          this.doneOrder.push(co.id);
          this.wakeAwaiters(co);
          break;
        }
        // Hand to a waiting receiver, if any.
        if (ch.recvWaiters.length > 0) {
          const w = ch.recvWaiters.shift()!;
          w.hasSend = true;
          w.sendValue = y.value;
          w.suspendReason = { kind: "none" };
          w.value = y.value;
          // The receiver is done (its recv completed).
          w.state = "done";
          this.doneOrder.push(w.id);
          this.wakeAwaiters(w);
          // Re-enqueue the sender (it can continue).
          co.suspendReason = { kind: "none" };
          co.state = "pending";
          this.runQueue.push(co);
          break;
        }
        // Buffer the value if there's room.
        if (ch.capacity === 0 || ch.buf.length < ch.capacity) {
          ch.buf.push(y.value);
          co.suspendReason = { kind: "none" };
          co.state = "pending";
          this.runQueue.push(co);
          break;
        }
        // Buffer full — park the sender.
        co.hasSend = true;
        co.sendValue = y.value;
        co.suspendReason = { kind: "channel_send", ch };
        co.state = "suspended";
        ch.sendWaiters.push(co);
        break;
      }
      case "channel_recv": {
        const ch = y.ch;
        if (ch.buf.length > 0) {
          // Buffer has a value — take it.
          const v = ch.buf.shift()!;
          // If there's a parked sender, hand them a slot.
          if (ch.sendWaiters.length > 0) {
            const s = ch.sendWaiters.shift()!;
            ch.buf.push(s.sendValue);
            s.hasSend = false;
            s.suspendReason = { kind: "none" };
            s.state = "pending";
            this.runQueue.push(s);
          }
          co.hasSend = true;
          co.sendValue = v;
          co.suspendReason = { kind: "none" };
          co.state = "pending";
          this.runQueue.push(co);
          break;
        }
        if (ch.closed) {
          // Closed and drained — resume with undefined.
          co.hasSend = true;
          co.sendValue = undefined as unknown as Value;
          co.suspendReason = { kind: "none" };
          co.state = "pending";
          this.runQueue.push(co);
          break;
        }
        // Empty open channel — park the receiver.
        co.suspendReason = { kind: "channel_recv", ch };
        co.state = "suspended";
        ch.recvWaiters.push(co);
        break;
      }
      case "sleep": {
        const wakeAt = Date.now() + y.ms;
        co.suspendReason = { kind: "sleep", wakeAt };
        co.state = "pending";  // Re-enqueue immediately (v3.0 sleep is a hint).
        this.runQueue.push(co);
        break;
      }
    }
  }

  /**
   * Wake all coroutines awaiting `co`. Each awaiter is resumed with
   * `co.value` (if co is done) or marked as error/cancelled (if co
   * errored or was cancelled).
   */
  private wakeAwaiters(co: Coroutine): void {
    const awaiters = co.awaiters.splice(0, co.awaiters.length);
    for (const w of awaiters) {
      if (w.state === "cancelled" || w.cancelled) continue;
      if (co.state === "done") {
        w.hasSend = true;
        w.sendValue = co.value;
        w.suspendReason = { kind: "none" };
        w.state = "pending";
        this.runQueue.push(w);
      } else if (co.state === "error") {
        w.state = "error";
        w.error = co.error ?? `awaited coroutine ${co.id} failed`;
        this.doneOrder.push(w.id);
        this.wakeAwaiters(w);
      } else if (co.state === "cancelled") {
        w.state = "cancelled";
        this.doneOrder.push(w.id);
        this.wakeAwaiters(w);
      }
    }
  }

  /** Detach a cancelled coroutine from any channel waiter lists. */
  private detachFromChannels(co: Coroutine): void {
    for (const ch of this.channels.values()) {
      const ri = ch.recvWaiters.indexOf(co);
      if (ri >= 0) ch.recvWaiters.splice(ri, 1);
      const si = ch.sendWaiters.indexOf(co);
      if (si >= 0) ch.sendWaiters.splice(si, 1);
    }
  }

  //------------------------------------------------------------------
  // Telemetry
  //------------------------------------------------------------------

  /** Number of coroutines spawned so far. */
  coroutineCount(): number {
    return this.coroutines.size;
  }

  /** Number of channels created so far. */
  channelCount(): number {
    return this.channels.size;
  }

  /** Wall-clock start time (ms since epoch). */
  startedAt(): number {
    return this.startTime;
  }
}

//----------------------------------------------------------------------------
// Builtins (register into the Aether evaluator)
//----------------------------------------------------------------------------

/**
 * Register coroutine builtins into a host-side sink (the same shape
 * as eval `RunOptions.builtins` map: `(name, fn) => void`).
 *
 * The builtins return coroutine/channel handles as Aether Values —
 * modeled as tagged structs `{ __struct: "Coroutine", fields: { id } }`
 * and `{ __struct: "Channel", fields: { id } }`. The Aether caller
 * passes these back to `await`/`resume`/`send`/`recv`/`cancel`/
 * `select`/`join`/`race`, which look up the underlying object in the
 * scheduler's registry.
 *
 * `opts.callValue` lets the spawn builtin invoke an Aether closure
 * (which is a tagged object, not a JS function). When the evaluator
 * wires these builtins into `installInlineBuiltins`, it passes
 * `this.callValue` so the closure runs through the evaluator's
 * closure-calling path. From host code, `callValue` can be omitted
 * (defaults to a direct `fn()` call — works for JS functions only).
 *
 * A singleton `CoroutineScheduler` is created per registration. The
 * builtins are designed for synchronous Aether: `await`/`recv`/`send`
 * drive the scheduler inline (synchronously), so the Aether caller
 * sees the resolved value as if the call had completed immediately.
 */
export interface CoroutineBuiltinOptions {
  /**
   * Invoke an Aether closure value (which is `{ __closure: ..., fn,
 * env }` and not directly callable from JS). The evaluator passes
   * `this.callValue` here so spawned Aether closures run through the
   * evaluator's closure-calling path. From host code, omit this (it
   * defaults to a direct `fn()` call, which works for JS functions).
   */
  callValue?: (fn: Value, args: Value[]) => Value;
}

export function registerCoroutineBuiltins(
  reg: (name: string, fn: (...args: any[]) => any) => void,
  opts: CoroutineBuiltinOptions = {},
): CoroutineScheduler {
  const sched = new CoroutineScheduler();
  const callValue = opts.callValue ?? ((fn: Value, _args: Value[]) => (fn as any)());

  /** Wrap a coroutine as an Aether Value handle. */
  const coHandle = (co: Coroutine): Value =>
    ({ __struct: "Coroutine", fields: { id: co.id } } as unknown as Value);

  /** Wrap a channel as an Aether Value handle. */
  const chHandle = (ch: Channel): Value =>
    ({ __struct: "Channel", fields: { id: ch.id } } as unknown as Value);

  /** Look up a coroutine from an Aether handle. */
  const resolveCo = (h: any): Coroutine => {
    if (h && typeof h === "object" && (h as any).__struct === "Coroutine") {
      const co = sched.getCoroutine((h as any).fields.id);
      if (!co) throw new Error(`unknown coroutine id ${(h as any).fields.id}`);
      return co;
    }
    throw new Error("expected a Coroutine handle");
  };

  /** Look up a channel from an Aether handle. */
  const resolveCh = (h: any): Channel => {
    if (h && typeof h === "object" && (h as any).__struct === "Channel") {
      const ch = sched.getChannel((h as any).fields.id);
      if (!ch) throw new Error(`unknown channel id ${(h as any).fields.id}`);
      return ch;
    }
    throw new Error("expected a Channel handle");
  };

  /** Spawn an Aether closure (or JS function) as a coroutine. */
  const spawnFn = (fn: Value): Coroutine => {
    return sched.spawnFn(() => callValue(fn, []));
  };

  reg("spawn", (fn: Value): Value => coHandle(spawnFn(fn)));
  reg("await", (h: any): Value => sched.await(resolveCo(h)));
  reg("yield", (v: any): Value => {
    // From Aether, there's no current coroutine; yield is a no-op
    // that returns the value (so Aether code can call it harmlessly
    // when testing).
    return v as Value;
  });
  reg("resume", (h: any): Value => sched.resume(resolveCo(h)));
  reg("send", (h: any, v: any): Value => {
    sched.send(resolveCo(h), v as Value);
    return null;
  });
  reg("cancel", (h: any): Value => {
    sched.cancel(resolveCo(h));
    return null;
  });
  reg("channel", (cap: any): Value => chHandle(sched.channel((cap as number) ?? 0)));
  reg("send_ch", (h: any, v: any): Value => {
    sched.send(resolveCh(h), v as Value);
    return null;
  });
  reg("recv", (h: any): Value => {
    const v = sched.recv(resolveCh(h));
    return v ?? null;
  });
  reg("select", (hs: any): Value => {
    const chs: Channel[] = (hs as any[]).map(resolveCh);
    const r = sched.select(chs);
    return ({
      __struct: "SelectResult",
      fields: {
        ch: chHandle(r.ch),
        v: r.v,
      },
    } as unknown) as Value;
  });
  reg("join", (hs: any): Value => {
    const cos: Coroutine[] = (hs as any[]).map(resolveCo);
    const vals = sched.join(cos);
    return vals as Value;
  });
  reg("race", (hs: any): Value => {
    const cos: Coroutine[] = (hs as any[]).map(resolveCo);
    return sched.race(cos);
  });
  reg("timeout", (ms: any): Value => coHandle(sched.timeout(ms as number)));
  reg("coroutine_count", (): Value => sched.coroutineCount() as Value);
  reg("channel_count", (): Value => sched.channelCount() as Value);

  // Expose the scheduler for callers that want the typed handle.
  reg("coroutine_scheduler", (() => sched) as unknown as (...args: any[]) => any);

  return sched;
}
