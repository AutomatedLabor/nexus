/**
 * aether/vm/async/async.ts
 * ========================
 * A REAL cooperative async runtime for Aether v2.
 *
 * Why this exists
 * ---------------
 * Aether v1's tree-walking evaluator and the v2 bytecode VM are both
 * synchronous: every call returns before the next one starts, there is no
 * event loop, and there is no machinery to suspend a running closure
 * mid-execution. RFC-001 (Async/await for Aether v2) specifies the design
 * for true `async fn`/`await` semantics via suspend/resume in the bytecode
 * VM; that work is large and lands later in v2.
 *
 * This module is the *pragmatic* runtime layer that lets host TypeScript
 * code (the playground's "Run async demo" button, the `aether repl`
 * command, stdlib `async` functions driven from outside the evaluator)
 * schedule real concurrent tasks, communicate over channels, race
 * futures, and join task groups — using host JS Promises under the hood.
 *
 * The cooperative scheduler
 * ------------------------
 * The runtime is a thin layer over JS Promises. `spawn(fn)` wraps `fn` in
 * a Promise that resolves on the microtask queue. `awaitAsync(id)` returns
 * a Promise that resolves when the task resolves. Channels are buffered
 * queues; `send` and `recv` return Promises that block (resolve/reject
 * pending on buffer state). `select` races a list of channel ops.
 *
 * Honest limitation (documented)
 * -----------------------------
 * True *synchronous* `await` is impossible in JS — a synchronous call
 * that blocks until a Promise resolves would deadlock the event loop.
 * RFC-001 § "Runtime: executor and suspend/resume" describes how the v2
 * bytecode VM will support true suspend/resume by capturing the frame's
 * IP and operand stack at each `await` and restoring them when the future
 * resolves. Until that lands, this runtime exposes **async-then**
 * semantics: every operation that "awaits" returns a Promise that the
 * caller (host code, or future `await` keyword) consumes. Aether scripts
 * themselves cannot call these directly — they're host-only — but the
 * API surface is the same shape as RFC-001, so the eventual native v2
 * `await` is a drop-in replacement.
 *
 * Public surface
 * --------------
 *   type Task, Channel, SelectResult
 *   class AsyncRuntime
 *       spawn(fn) -> Task
 *       awaitAsync(taskId) -> Promise<Value>
 *       channel(capacity?) -> Channel
 *       send(ch, v) -> Promise<void>
 *       recv(ch) -> Promise<Value | undefined>
 *       select(ops, timeoutMs?) -> Promise<SelectResult>
 *       timeout(ms) -> Task
 *       join(taskIds) -> Promise<Value[]>
 *       race(taskIds) -> Promise<Value>
 *       cancel(taskId) -> void
 *       close(ch) -> void
 *   function registerAsyncBuiltins(reg): void
 */
import type { Value } from "../../core/eval/eval";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

/**
 * A handle to a running async task. The task wraps a JS Promise; `state`
 * transitions `pending -> running -> done` (or `error`).
 *
 * `value` is the resolved value (when `state === 'done'`).
 * `error` is the rejection message (when `state === 'error'`).
 * `cancelled` is true once `cancel(id)` has been called; the task's
 * Promise still resolves (or rejects) — cancellation just marks the
 * handle so future `awaitAsync` calls reject with a cancelled error.
 */
export interface Task {
  id: number;
  state: "pending" | "running" | "done" | "error";
  value?: Value;
  error?: string;
  cancelled: boolean;
  /** Underlying JS Promise. Resolves with the value, rejects with Error. */
  promise: Promise<Value>;
}

/**
 * A buffered async channel. Capacity 0 means unbounded (RFC-001 default).
 * Capacity >0 means a bounded buffer; `send` blocks (Promise pending)
 * while the buffer is full.
 *
 * `senders` counts pending send waiters; `recvers` counts pending recv
 * waiters. Both are arrays of `{ resolve, reject }` callbacks.
 */
export interface Channel {
  id: number;
  buf: Value[];
  capacity: number;
  /** Waiters blocked on `recv` while the buffer was empty. */
  recvers: Array<{ resolve: (v: Value | undefined) => void; reject: (e: Error) => void }>;
  /** Waiters blocked on `send` while the buffer was full (capacity > 0). */
  senders: Array<{ value: Value; resolve: () => void; reject: (e: Error) => void }>;
  closed: boolean;
}

/** `select` result: which op index won, and the value (for `recv`). */
export interface SelectResult {
  index: number;
  value?: Value;
}

/** Sentinel returned by `recv` when the channel is closed and drained. */
export const CHANNEL_CLOSED: unique symbol = Symbol("aether.channel.closed");

//----------------------------------------------------------------------------
// AsyncRuntime
//----------------------------------------------------------------------------

/**
 * The cooperative async runtime. Holds task and channel registries;
 * exposes spawn / channel / select / join / race / cancel.
 *
 * One runtime per logical "demo" or program; the playground creates one
 * fresh per Run, the CLI `aether repl` creates one for the session.
 */
export class AsyncRuntime {
  private tasks = new Map<number, Task>();
  private channels = new Map<number, Channel>();
  private nextTaskId = 1;
  private nextChannelId = 1;

  //------------------------------------------------------------------
  // Tasks
  //------------------------------------------------------------------

  /**
   * Spawn `fn` on the microtask queue. Returns a Task handle immediately;
   * the underlying Promise resolves (or rejects) on the microtask.
   *
   * `fn` may be sync (returns Value) or async (returns Promise<Value>).
   * Either way we wrap it in `Promise.resolve().then(fn)` so it runs on
   * the next microtask tick.
   *
   * The underlying Promise resolves (or rejects) with whatever `fn`
   * returns (or throws). Cancellation is tracked separately on the
   * `cancelled` flag — `awaitAsync`/`join`/`race` check the flag and
   * reject with `task cancelled` if set, *without* rejecting the
   * underlying Promise (which would create an unhandled rejection if
   * the spawned closure has already resolved by the time cancel() runs).
   */
  spawn(fn: () => Value | Promise<Value>): Task {
    const id = this.nextTaskId++;
    const task: Task = {
      id,
      state: "pending",
      cancelled: false,
      promise: Promise.resolve()
        .then(() => {
          task.state = "running";
          return fn();
        })
        .then(
          (v: Value) => {
            task.state = "done";
            task.value = v;
            return v;
          },
          (e: unknown) => {
            task.state = "error";
            task.error = e instanceof Error ? e.message : String(e);
            throw e;
          },
        ),
    };
    this.tasks.set(id, task);
    return task;
  }

  /**
   * Resolve a task to its value, asynchronously.
   *
   * Returns a Promise that resolves with the task's value (or rejects
   * with the task's error). This is the *only* way to consume a task's
   * result — there is no synchronous `await` in JS (see file header).
   *
   * If the task was cancelled, rejects with `task cancelled`.
   * If the task id is unknown, rejects with `unknown task id`.
   */
  awaitAsync(taskId: number): Promise<Value> {
    const task = this.tasks.get(taskId);
    if (!task) return Promise.reject(new Error(`unknown task id ${taskId}`));
    if (task.cancelled) return Promise.reject(new Error("task cancelled"));
    return task.promise;
  }

  /**
   * Synonym for `awaitAsync` exposed under the name RFC-001 uses for the
   * synchronous `await` keyword. **This is not synchronous** — see the
   * file header. The synchronous name is reserved for the v2 bytecode
   * VM's native `await` (which will capture the frame and resume it).
   *
   * For host code that wants the "block until done" pattern without
   * writing `await` everywhere, use `await runtime.awaitAsync(id)`.
   */
  await(taskId: number): Promise<Value> {
    return this.awaitAsync(taskId);
  }

  /**
   * Wait for all of `taskIds` to resolve. Returns their values in order.
   * Rejects on the first rejection (mirrors `Promise.all`).
   *
   * Unknown or cancelled task ids produce a *rejection* (not a sync
   * throw) so callers can use `await`/`.catch` uniformly.
   */
  join(taskIds: number[]): Promise<Value[]> {
    const tasks = taskIds.map((id) => {
      const t = this.tasks.get(id);
      if (!t) return Promise.reject(new Error(`unknown task id ${id}`));
      if (t.cancelled) return Promise.reject(new Error(`task ${id} cancelled`));
      return t.promise;
    });
    return Promise.all(tasks);
  }

  /**
   * Wait for the first of `taskIds` to resolve. Returns its value.
   * Mirrors `Promise.race`. The losing tasks continue running (they're
   * not cancelled — use `cancel(id)` explicitly to stop them).
   *
   * Unknown or cancelled task ids produce a *rejection* (not a sync
   * throw).
   */
  race(taskIds: number[]): Promise<Value> {
    const tasks = taskIds.map((id) => {
      const t = this.tasks.get(id);
      if (!t) return Promise.reject(new Error(`unknown task id ${id}`));
      if (t.cancelled) return Promise.reject(new Error(`task ${id} cancelled`));
      return t.promise;
    });
    return Promise.race(tasks);
  }

  /**
   * Mark a task as cancelled. The task's underlying Promise still
   * resolves (or rejects) — cancellation doesn't kill the microtask —
   * but future `awaitAsync` / `join` / `race` calls on this id reject
   * with `task cancelled`.
   *
   * This is the v2 cancellation semantics from RFC-001 § "Open questions
   * (1. Cancellation)" — the spawned future itself has to observe the
   * cancellation flag via its own polling (e.g. via a `CancellationToken`
   * passed to the spawned closure).
   */
  cancel(taskId: number): void {
    const t = this.tasks.get(taskId);
    if (!t) return;
    t.cancelled = true;
  }

  /**
   * Look up a task by id (or `undefined` if unknown). Useful for tests
   * and for the playground's task-status UI.
   */
  getTask(id: number): Task | undefined {
    return this.tasks.get(id);
  }

  //------------------------------------------------------------------
  // Channels
  //------------------------------------------------------------------

  /**
   * Create a buffered channel. `capacity = 0` (default) means an
   * unbounded buffer (RFC-001 default). `capacity > 0` means sends
   * block when the buffer is full.
   */
  channel(capacity = 0): Channel {
    const id = this.nextChannelId++;
    const ch: Channel = {
      id,
      buf: [],
      capacity,
      recvers: [],
      senders: [],
      closed: false,
    };
    this.channels.set(id, ch);
    return ch;
  }

  /**
   * Get a channel by id. Returns `undefined` if unknown.
   */
  getChannel(id: number): Channel | undefined {
    return this.channels.get(id);
  }

  /**
   * Send `v` on `ch`.
   *
   * - If the channel has a pending `recv` waiter, hand the value
   *   directly to that waiter (no buffering); resolves immediately.
   * - Else if the buffer is unbounded (capacity === 0) or has room,
   *   push to the buffer; resolves immediately.
   * - Else (bounded buffer full), the send Promise *blocks*: it
   *   resolves when a future `recv` frees a slot.
   *
   * Rejects with `send on closed channel` if the channel is closed.
   */
  send(ch: Channel, v: Value): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (ch.closed) {
        reject(new Error("send on closed channel"));
        return;
      }
      // Hand to a waiting receiver, if any.
      if (ch.recvers.length > 0) {
        const w = ch.recvers.shift()!;
        w.resolve(v);
        resolve();
        return;
      }
      // Buffer the value if there's room.
      if (ch.capacity === 0 || ch.buf.length < ch.capacity) {
        ch.buf.push(v);
        resolve();
        return;
      }
      // Buffer full — block the send.
      ch.senders.push({ value: v, resolve, reject });
    });
  }

  /**
   * Receive a value from `ch`.
   *
   * - If the buffer is non-empty, shift the next value; if there's a
   *   blocked sender (bounded buffer), wake one and push its value.
   *   Resolves immediately with the value.
   * - Else if the channel is closed, resolves with `undefined` (the
   *   RFC-001 `Option::None` shape — represented here as JS undefined).
   * - Else (empty open channel), the recv Promise *blocks*: it
   *   resolves when a future `send` provides a value.
   */
  recv(ch: Channel): Promise<Value | undefined> {
    return new Promise<Value | undefined>((resolve, reject) => {
      if (ch.buf.length > 0) {
        const v = ch.buf.shift() as Value;
        // If there's a blocked sender, hand them a slot.
        if (ch.senders.length > 0) {
          const s = ch.senders.shift()!;
          ch.buf.push(s.value);
          s.resolve();
        }
        resolve(v);
        return;
      }
      if (ch.closed) {
        resolve(undefined);
        return;
      }
      // Empty open channel — block the recv.
      ch.recvers.push({ resolve, reject });
    });
  }

  /**
   * Close `ch`. Future `send` rejects with `send on closed channel`.
   * Pending `recv` waiters resolve with `undefined` (channel-closed
   * sentinel). Pending `send` waiters reject with `send on closed
   * channel`.
   */
  close(ch: Channel): void {
    if (ch.closed) return;
    ch.closed = true;
    // Resolve pending recv waiters with undefined.
    const rs = ch.recvers.splice(0, ch.recvers.length);
    for (const w of rs) w.resolve(undefined);
    // Reject pending send waiters.
    const ss = ch.senders.splice(0, ch.senders.length);
    for (const w of ss) w.reject(new Error("send on closed channel"));
  }

  /**
   * Race a list of channel operations. Resolves with the first op that
   * completes (a successful `recv` or `send`), or rejects with a
   * timeout if `timeoutMs` is provided and elapses first.
   *
   * Each op is `{ ch, op: 'recv' }` or `{ ch, op: 'send', value }`.
   * The result has `{ index, value? }`: `index` is the winning op's
   * position in the list, `value` is the received value (for `recv`),
   * and `index === -1` means timeout.
   *
   * On timeout or settle, the losing ops' channel waiters are *not*
   * cancelled (we can't cancel a pending Promise.resolve in JS). This
   * is a known limitation; the v2 bytecode VM will support true op
   * cancellation via `CancellationToken`.
   */
  select(ops: Array<{ ch: Channel; op: "recv" | "send"; value?: Value }>, timeoutMs?: number): Promise<SelectResult> {
    return new Promise<SelectResult>((resolve) => {
      let settled = false;
      const finish = (i: number, value?: Value): void => {
        if (settled) return;
        settled = true;
        resolve({ index: i, value });
      };
      if (timeoutMs !== undefined) {
        setTimeout(() => finish(-1), timeoutMs);
      }
      ops.forEach((op, i) => {
        if (op.op === "recv") {
          this.recv(op.ch).then((v) => finish(i, v)).catch(() => {/* channel closed: finish with undefined */});
        } else if (op.op === "send") {
          if (op.value === undefined) {
            // No value supplied — treat as no-op (shouldn't happen).
            return;
          }
          this.send(op.ch, op.value).then(() => finish(i)).catch(() => {/* closed */});
        }
      });
    });
  }

  //------------------------------------------------------------------
  // Timeouts
  //------------------------------------------------------------------

  /**
   * Spawn a task that resolves after `ms` milliseconds. Useful as a
   * primitive timeout / sleep / debounce.
   *
   * Returns a Task; the value is `null` (the Aether `unit`).
   */
  timeout(ms: number): Task {
    return this.spawn(() => new Promise<Value>((resolve) => setTimeout(() => resolve(null), ms)));
  }

  /**
   * Schedule `fn` to run after the microtask queue drains. Returns a
   * Task. This is the `defer` primitive (RFC-001 mentions it as the
   * cleanup hook for `scope { ... }`).
   */
  defer(fn: () => Value | Promise<Value>): Task {
    return this.spawn(fn);
  }

  //------------------------------------------------------------------
  // Telemetry
  //------------------------------------------------------------------

  /** Number of tasks spawned so far (including cancelled and errored). */
  taskCount(): number {
    return this.tasks.size;
  }

  /** Number of channels created so far. */
  channelCount(): number {
    return this.channels.size;
  }

  /** All known tasks, in spawn order. */
  allTasks(): Task[] {
    return Array.from(this.tasks.values());
  }
}

//----------------------------------------------------------------------------
// Builtins
//----------------------------------------------------------------------------

/**
 * Register async builtins into a host-side sink. The sink is the same
 * shape as the eval `RunOptions.builtins` map (or the stdlib `register`
 * callback): `(name, fn) => void`.
 *
 * The registered functions are JS functions that operate on a fresh
 * `AsyncRuntime` instance bound to this call. Aether scripts cannot
 * call these directly from the v1 sync evaluator — they'd return
 * Promises, which display as `[object Promise]`. They're for host
 * code that wants to drive async patterns (e.g. the playground's
 * "Run async demo" button).
 *
 * When the v2 bytecode VM lands, these builtins map 1:1 to the language
 * `async`/`await`/`spawn`/`channel`/`select` keywords (RFC-001).
 */
export function registerAsyncBuiltins(reg: (name: string, fn: (...args: any[]) => any) => void): void {
  const rt = new AsyncRuntime();

  reg("async_spawn", (fn: () => Value | Promise<Value>): number => rt.spawn(fn).id);
  reg("async_await", (id: number): Promise<Value> => rt.awaitAsync(id));
  reg("async_join", (ids: number[]): Promise<Value[]> => rt.join(ids));
  reg("async_race", (ids: number[]): Promise<Value> => rt.race(ids));
  reg("async_cancel", (id: number): void => { rt.cancel(id); });
  reg("async_channel", (capacity = 0): Channel => rt.channel(capacity));
  reg("async_send", (ch: Channel, v: Value): Promise<void> => rt.send(ch, v));
  reg("async_recv", (ch: Channel): Promise<Value | undefined> => rt.recv(ch));
  reg("async_close", (ch: Channel): void => { rt.close(ch); });
  reg("async_select", (ops: any[], timeoutMs?: number): Promise<SelectResult> => rt.select(ops, timeoutMs));
  reg("async_timeout", (ms: number): number => rt.timeout(ms).id);
  reg("async_defer", (fn: () => Value | Promise<Value>): number => rt.defer(fn).id);

  // Expose the runtime itself for callers that want the typed handle
  // (e.g. to call `getTask` for status inspection).
  reg("async_runtime", rt as unknown as (...args: any[]) => any);
}
