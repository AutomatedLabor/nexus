/**
 * aether/stdlib/async/index.ts
 * ============================
 * Promise-based async primitives for Aether host code.
 *
 * NOT CALLABLE FROM THE V1 SYNC EVALUATOR.
 * ----------------------------------------
 * The runtime in `aether/core/eval/eval.ts` is synchronous: every value is a
 * JS value, every call returns synchronously. There is no event loop, no
 * scheduler, no continuations, and no way to suspend a running closure mid-
 * execution. The functions in this module return Promises, which the v1
 * evaluator has no machinery to `await`.
 *
 * They ARE callable from host TypeScript/JavaScript code that wants to demo
 * concurrent patterns (e.g. a playground "Run async demo" button that
 * drives `runAsync` from outside the evaluator).
 *
 * Why a stub register() that throws?
 * ----------------------------------
 * The registry in `aether/stdlib/index.ts` doesn't call `Async.register`
 * because we don't want users to accidentally invoke `await channel()`
 * inside a sync Aether script and get a confusing `Promise` object back.
 * If you DO want to wire async into the registry (e.g. for a future v2
 * evaluator that supports `await`), `register()` here throws on every call
 * with a clear "async requires the v2 runtime" message — honest failure
 * instead of silent corruption.
 *
 * Concurrency model
 * -----------------
 * - `channel()` returns an unbounded async channel.
 * - `send(ch, v)` and `recv(ch)` return Promises that resolve immediately
 *   for an unbounded channel; `recv` blocks (via a queued promise) if empty.
 * - `select(ops)` races a list of `{ ch, op: 'send'|'recv', value? }`
 *   operations and resolves with the first one ready.
 * - `timeout(ms)` resolves after `ms` milliseconds.
 * - `spawn(fn)` schedules `fn()` on the microtask queue and returns a
 *   promise that resolves with fn's return value (or rejects with fn's
 *   error). There is no preemption — `spawn` is `Promise.resolve().then(fn)`
 *   under the hood, so it only "concurrent" between awaits.
 * - `awaitAll(ps)` / `race(ps)` wrap `Promise.all` / `Promise.race`.
 * - `mapAsync(arr, fn)` / `filterAsync(arr, fn)` / `reduceAsync(arr, fn, init)`
 *   are the async parallels of `map`/`filter`/`reduce`.
 * - `defer(fn)` runs `fn` after the current microtask drains
 *   (`queueMicrotask`).
 * - `retry(n, fn)` retries `fn` up to `n` times on rejection, returning the
 *   first success or the last rejection.
 * - `debounce(fn, ms)` returns a debounced wrapper that delays invocation
 *   until `ms` ms have elapsed since the last call.
 * - `runAsync(fn)` is the demo entrypoint — call from host code.
 */

//----------------------------------------------------------------------------
// Channels — unbounded async queues.
//----------------------------------------------------------------------------
export interface Channel<T = any> {
  __channel: "channel";
  buf: T[];
  waiters: Array<(v: T) => void>;
  closed: boolean;
}

export function channel<T = any>(): Channel<T> {
  return { __channel: "channel", buf: [], waiters: [], closed: false };
}

export function send<T>(ch: Channel<T>, v: T): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ch.closed) { reject(new Error("send on closed channel")); return; }
    if (ch.waiters.length > 0) {
      const w = ch.waiters.shift()!;
      w(v);
      resolve();
      return;
    }
    ch.buf.push(v);
    resolve();
  });
}

export function recv<T>(ch: Channel<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (ch.buf.length > 0) {
      resolve(ch.buf.shift() as T);
      return;
    }
    if (ch.closed) { reject(new Error("recv on closed channel")); return; }
    ch.waiters.push(resolve as (v: T) => void);
  });
}

export function close<T>(ch: Channel<T>): void {
  ch.closed = true;
  // Reject pending recv waiters with the closed-channel error.
  const ws = ch.waiters.splice(0, ch.waiters.length);
  for (const w of ws) {
    // They'll never resolve normally; resolve with `undefined as any` to
    // unblock them and let the caller check `ch.closed` if needed.
    (w as any)(undefined);
  }
}

//----------------------------------------------------------------------------
// select — race a list of channel ops + optional timeout.
//----------------------------------------------------------------------------
export interface SelectOp {
  ch: Channel<any>;
  op: "send" | "recv";
  value?: any;
}

export interface SelectResult {
  index: number;
  value?: any;
}

export function select(ops: SelectOp[], timeoutMs?: number): Promise<SelectResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (i: number, value?: any) => {
      if (settled) return;
      settled = true;
      resolve({ index: i, value });
    };
    if (timeoutMs !== undefined) {
      setTimeout(() => finish(-1), timeoutMs);
    }
    ops.forEach((op, i) => {
      if (op.op === "recv") {
        recv(op.ch).then((v) => finish(i, v)).catch(() => {/* channel closed */});
      } else if (op.op === "send" && op.value !== undefined) {
        send(op.ch, op.value).then(() => finish(i)).catch(() => {/* closed */});
      }
    });
  });
}

//----------------------------------------------------------------------------
// timeout
//----------------------------------------------------------------------------
export function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

//----------------------------------------------------------------------------
// spawn — schedule fn on the microtask queue.
//----------------------------------------------------------------------------
export function spawn<T>(fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve().then(fn);
}

//----------------------------------------------------------------------------
// awaitAll / race
//----------------------------------------------------------------------------
export function awaitAll<T>(ps: Array<Promise<T>>): Promise<T[]> {
  return Promise.all(ps);
}

export function race<T>(ps: Array<Promise<T>>): Promise<T> {
  return Promise.race(ps);
}

//----------------------------------------------------------------------------
// mapAsync / filterAsync / reduceAsync
//----------------------------------------------------------------------------
export async function mapAsync<T, U>(arr: T[], fn: (x: T, i: number) => Promise<U> | U): Promise<U[]> {
  const out: U[] = [];
  for (let i = 0; i < arr.length; i++) out.push(await fn(arr[i], i));
  return out;
}

export async function filterAsync<T>(arr: T[], fn: (x: T, i: number) => Promise<boolean> | boolean): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (await fn(arr[i], i)) out.push(arr[i]);
  }
  return out;
}

export async function reduceAsync<T, U>(arr: T[], fn: (acc: U, x: T, i: number) => Promise<U> | U, init: U): Promise<U> {
  let acc = init;
  for (let i = 0; i < arr.length; i++) acc = await fn(acc, arr[i], i);
  return acc;
}

//----------------------------------------------------------------------------
// defer — queueMicrotask.
//----------------------------------------------------------------------------
export function defer(fn: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
  } else {
    Promise.resolve().then(fn);
  }
}

//----------------------------------------------------------------------------
// retry — retry up to n times.
//----------------------------------------------------------------------------
export async function retry<T>(n: number, fn: () => Promise<T> | T): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

//----------------------------------------------------------------------------
// debounce — wait `ms` after the last call before invoking.
//----------------------------------------------------------------------------
export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: any = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { fn(...args); timer = null; }, ms);
  }) as T;
}

//----------------------------------------------------------------------------
// runAsync — the demo entry point. Call from host code, NOT from sync Aether.
//----------------------------------------------------------------------------
export async function runAsync<T>(fn: () => Promise<T> | T): Promise<T> {
  return Promise.resolve().then(fn);
}

//----------------------------------------------------------------------------
// MANIFEST — listed for parity with other stdlib modules; the v1 evaluator
// won't actually call these (register throws).
//----------------------------------------------------------------------------
export const MANIFEST = {
  module: "async",
  fns: [
    { name: "channel", sig: "() -> Channel", desc: "Create an unbounded async channel." },
    { name: "send", sig: "(ch: Channel, v: any) -> Promise<void>", desc: "Send a value on a channel." },
    { name: "recv", sig: "(ch: Channel) -> Promise<any>", desc: "Receive a value from a channel." },
    { name: "close", sig: "(ch: Channel) -> void", desc: "Close a channel; future recv rejects." },
    { name: "select", sig: "(ops: SelectOp[], timeout?: int) -> Promise<SelectResult>", desc: "Race channel ops; resolves with first ready." },
    { name: "timeout", sig: "(ms: int) -> Promise<void>", desc: "Promise that resolves after ms." },
    { name: "spawn", sig: "(fn: () -> T) -> Promise<T>", desc: "Schedule fn on the microtask queue." },
    { name: "awaitAll", sig: "(ps: Promise<T>[]) -> Promise<T[]>", desc: "Promise.all wrapper." },
    { name: "race", sig: "(ps: Promise<T>[]) -> Promise<T>", desc: "Promise.race wrapper." },
    { name: "mapAsync", sig: "(arr: T[], fn: (T) -> Promise<U>) -> Promise<U[]>", desc: "Async map (sequential)." },
    { name: "filterAsync", sig: "(arr: T[], fn: (T) -> Promise<bool>) -> Promise<T[]>", desc: "Async filter (sequential)." },
    { name: "reduceAsync", sig: "(arr: T[], fn, init: U) -> Promise<U>", desc: "Async reduce (sequential)." },
    { name: "defer", sig: "(fn: () -> void) -> void", desc: "Queue a microtask." },
    { name: "retry", sig: "(n: int, fn: () -> Promise<T>) -> Promise<T>", desc: "Retry up to n times on rejection." },
    { name: "debounce", sig: "(fn: T, ms: int) -> T", desc: "Debounced wrapper; fires after ms of quiet." },
    { name: "runAsync", sig: "(fn: () => Promise<T>) -> Promise<T>", desc: "Host-only demo entry point." },
  ],
};

//----------------------------------------------------------------------------
// register — throws on every call. See file header for rationale.
//----------------------------------------------------------------------------
export function register(_registerBuiltin: (name: string, fn: any) => void): void {
  throw new Error(
    "aether/stdlib/async: async primitives require the v2 runtime. " +
      "The v1 evaluator is synchronous. Use `import * as Async from 'aether/stdlib/async'` " +
      "from host code if you want to drive Promises directly."
  );
}
