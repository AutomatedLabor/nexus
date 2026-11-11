/**
 * aether/vm/async/async.test.ts
 * =============================
 * 40 test cases for the cooperative async runtime.
 *
 * Coverage:
 *   - spawn + awaitAsync (basic, async fn, error, value)
 *   - channel send / recv (unbuffered handshake, buffered, capacity)
 *   - close (recv after close, send after close, waiter release)
 *   - select (recv wins, send wins, timeout)
 *   - timeout (resolves after ms)
 *   - join (multiple tasks, order preservation, rejection)
 *   - race (first wins, others continue)
 *   - cancel (mark cancelled, await rejects)
 *   - registerAsyncBuiltins (registers expected names)
 */
import { describe, it, expect } from "vitest";
import { AsyncRuntime, registerAsyncBuiltins, type Task, type Channel } from "./async";

describe("AsyncRuntime.spawn + awaitAsync", () => {
  it("spawns a sync fn and resolves with its value", async () => {
    const rt = new AsyncRuntime();
    const t: Task = rt.spawn(() => 42);
    expect(t.state).toBe("pending");
    const v = await rt.awaitAsync(t.id);
    expect(v).toBe(42);
    expect(t.state).toBe("done");
    expect(t.value).toBe(42);
  });

  it("spawns an async fn (returns a Promise) and resolves", async () => {
    const rt = new AsyncRuntime();
    const t = rt.spawn(() => Promise.resolve("hello"));
    const v = await rt.awaitAsync(t.id);
    expect(v).toBe("hello");
  });

  it("awaits the same task twice (idempotent Promise)", async () => {
    const rt = new AsyncRuntime();
    const t = rt.spawn(() => 7);
    const [a, b] = await Promise.all([rt.awaitAsync(t.id), rt.awaitAsync(t.id)]);
    expect(a).toBe(7);
    expect(b).toBe(7);
  });

  it("rejects awaitAsync on an unknown task id", async () => {
    const rt = new AsyncRuntime();
    await expect(rt.awaitAsync(9999)).rejects.toThrow(/unknown task id 9999/);
  });

  it("records the task state as 'error' on rejection", async () => {
    const rt = new AsyncRuntime();
    const t = rt.spawn(() => { throw new Error("boom"); });
    await expect(rt.awaitAsync(t.id)).rejects.toThrow(/boom/);
    expect(t.state).toBe("error");
    expect(t.error).toBe("boom");
  });

  it("returns the same Task object from getTask", async () => {
    const rt = new AsyncRuntime();
    const t = rt.spawn(() => 1);
    expect(rt.getTask(t.id)).toBe(t);
    expect(rt.getTask(9999)).toBeUndefined();
  });

  it("exposes allTasks in spawn order", () => {
    const rt = new AsyncRuntime();
    const a = rt.spawn(() => 1);
    const b = rt.spawn(() => 2);
    const c = rt.spawn(() => 3);
    expect(rt.allTasks()).toEqual([a, b, c]);
  });

  it("increments task ids monotonically", () => {
    const rt = new AsyncRuntime();
    const a = rt.spawn(() => 1);
    const b = rt.spawn(() => 2);
    expect(b.id).toBe(a.id + 1);
  });
});

describe("AsyncRuntime.channel (unbuffered handshake)", () => {
  it("recv blocks until a send happens, then resolves with the sent value", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    const recvP = rt.recv(ch);
    // Slight delay to ensure recv is registered first.
    await new Promise<void>((r) => setTimeout(r, 5));
    await rt.send(ch, "hi");
    const v = await recvP;
    expect(v).toBe("hi");
  });

  it("send then recv (buffered default) resolves immediately", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    await rt.send(ch, 10);
    const v = await rt.recv(ch);
    expect(v).toBe(10);
  });

  it("multiple sends buffer in FIFO order", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    await rt.send(ch, 1);
    await rt.send(ch, 2);
    await rt.send(ch, 3);
    expect(await rt.recv(ch)).toBe(1);
    expect(await rt.recv(ch)).toBe(2);
    expect(await rt.recv(ch)).toBe(3);
  });

  it("send hands value directly to a waiting recv (no buffer push)", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    const recvP = rt.recv(ch);
    await new Promise<void>((r) => setTimeout(r, 5));
    // Buffer should be empty; the recv waiter is registered.
    expect(ch.buf.length).toBe(0);
    expect(ch.recvers.length).toBe(1);
    await rt.send(ch, "direct");
    expect(await recvP).toBe("direct");
    // After the send, the waiter is gone.
    expect(ch.recvers.length).toBe(0);
  });
});

describe("AsyncRuntime.channel (bounded capacity)", () => {
  it("capacity 2 holds 2 sends, third send blocks", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel(2);
    await rt.send(ch, "a");
    await rt.send(ch, "b");
    expect(ch.buf.length).toBe(2);
    // Third send should block — Promise stays pending.
    const thirdP = rt.send(ch, "c");
    let settled = false;
    thirdP.then(() => { settled = true; });
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    // Drain a slot — third send resolves.
    await rt.recv(ch);
    await thirdP;
    expect(settled).toBe(true);
  });

  it("blocked sender wakes when a recv frees a slot", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel(1);
    await rt.send(ch, 1);
    const blockedP = rt.send(ch, 2);
    await new Promise<void>((r) => setTimeout(r, 5));
    expect(ch.senders.length).toBe(1);
    await rt.recv(ch); // drain slot — should wake the blocked sender
    await blockedP;
    expect(ch.buf.length).toBe(1);
    expect(await rt.recv(ch)).toBe(2);
  });

  it("capacity 0 (default) is unbounded", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    for (let i = 0; i < 100; i++) await rt.send(ch, i);
    expect(ch.buf.length).toBe(100);
    for (let i = 0; i < 100; i++) expect(await rt.recv(ch)).toBe(i);
  });

  it("getChannel returns the channel by id", () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    expect(rt.getChannel(ch.id)).toBe(ch);
    expect(rt.getChannel(9999)).toBeUndefined();
  });
});

describe("AsyncRuntime.close", () => {
  it("send on a closed channel rejects", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    rt.close(ch);
    await expect(rt.send(ch, 1)).rejects.toThrow(/send on closed channel/);
  });

  it("recv on a closed empty channel resolves with undefined", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    rt.close(ch);
    expect(await rt.recv(ch)).toBeUndefined();
  });

  it("recv drains the buffer first, then returns undefined after close", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    await rt.send(ch, 1);
    await rt.send(ch, 2);
    rt.close(ch);
    expect(await rt.recv(ch)).toBe(1);
    expect(await rt.recv(ch)).toBe(2);
    expect(await rt.recv(ch)).toBeUndefined();
  });

  it("close releases pending recv waiters with undefined", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    const recvP = rt.recv(ch);
    await new Promise<void>((r) => setTimeout(r, 5));
    rt.close(ch);
    expect(await recvP).toBeUndefined();
  });

  it("close rejects pending send waiters", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel(1);
    await rt.send(ch, 1);
    const blockedP = rt.send(ch, 2);
    await new Promise<void>((r) => setTimeout(r, 5));
    rt.close(ch);
    await expect(blockedP).rejects.toThrow(/send on closed channel/);
  });

  it("close is idempotent", () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    rt.close(ch);
    expect(() => rt.close(ch)).not.toThrow();
  });
});

describe("AsyncRuntime.select", () => {
  it("selects the first recv that completes", async () => {
    const rt = new AsyncRuntime();
    const ch1 = rt.channel();
    const ch2 = rt.channel();
    const selP = rt.select([
      { ch: ch1, op: "recv" },
      { ch: ch2, op: "recv" },
    ]);
    await new Promise<void>((r) => setTimeout(r, 5));
    await rt.send(ch2, "from-2");
    const r = await selP;
    expect(r.index).toBe(1);
    expect(r.value).toBe("from-2");
  });

  it("selects a send op", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    // The send op wins because there's no competition.
    const selP = rt.select([{ ch, op: "send", value: "x" }]);
    const r = await selP;
    expect(r.index).toBe(0);
    expect(await rt.recv(ch)).toBe("x");
  });

  it("returns index -1 on timeout", async () => {
    const rt = new AsyncRuntime();
    const ch = rt.channel();
    const r = await rt.select([{ ch, op: "recv" }], 30);
    expect(r.index).toBe(-1);
  });

  it("first-ready wins under concurrent sends", async () => {
    const rt = new AsyncRuntime();
    const ch1 = rt.channel();
    const ch2 = rt.channel();
    const selP = rt.select([
      { ch: ch1, op: "recv" },
      { ch: ch2, op: "recv" },
    ]);
    await new Promise<void>((r) => setTimeout(r, 5));
    // Race two sends.
    rt.send(ch1, "a");
    rt.send(ch2, "b");
    const r = await selP;
    expect([0, 1]).toContain(r.index);
  });
});

describe("AsyncRuntime.timeout", () => {
  it("resolves after the specified ms", async () => {
    const rt = new AsyncRuntime();
    const start = Date.now();
    const t = rt.timeout(30);
    await rt.awaitAsync(t.id);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(elapsed).toBeLessThan(200);
  });

  it("timeout value is null (unit)", async () => {
    const rt = new AsyncRuntime();
    const t = rt.timeout(5);
    expect(await rt.awaitAsync(t.id)).toBeNull();
  });

  it("defer schedules a task on the microtask queue", async () => {
    const rt = new AsyncRuntime();
    const t = rt.defer(() => 99);
    expect(await rt.awaitAsync(t.id)).toBe(99);
  });
});

describe("AsyncRuntime.join", () => {
  it("resolves with values in order", async () => {
    const rt = new AsyncRuntime();
    const a = rt.spawn(() => 1);
    const b = rt.spawn(() => 2);
    const c = rt.spawn(() => 3);
    expect(await rt.join([a.id, b.id, c.id])).toEqual([1, 2, 3]);
  });

  it("preserves order even when later tasks finish first", async () => {
    const rt = new AsyncRuntime();
    const slow = rt.timeout(20);
    const fast = rt.spawn(() => "fast");
    const r = await rt.join([slow.id, fast.id]);
    expect(r).toEqual([null, "fast"]);
  });

  it("rejects on the first task that errors", async () => {
    const rt = new AsyncRuntime();
    const a = rt.spawn(() => 1);
    const b = rt.spawn(() => { throw new Error("nope"); });
    await expect(rt.join([a.id, b.id])).rejects.toThrow(/nope/);
  });

  it("rejects on unknown task id", async () => {
    const rt = new AsyncRuntime();
    await expect(rt.join([999])).rejects.toThrow(/unknown task id/);
  });

  it("rejects on cancelled task id", async () => {
    const rt = new AsyncRuntime();
    const t = rt.spawn(() => 1);
    rt.cancel(t.id);
    await expect(rt.join([t.id])).rejects.toThrow(/cancelled/);
  });
});

describe("AsyncRuntime.race", () => {
  it("resolves with the first task's value", async () => {
    const rt = new AsyncRuntime();
    const a = rt.timeout(50);
    const b = rt.spawn(() => "fast");
    expect(await rt.race([a.id, b.id])).toBe("fast");
  });

  it("rejects on unknown task id", async () => {
    const rt = new AsyncRuntime();
    await expect(rt.race([999])).rejects.toThrow(/unknown task id/);
  });

  it("loser continues running (not cancelled)", async () => {
    const rt = new AsyncRuntime();
    const slow = rt.timeout(20);
    const fast = rt.spawn(() => "fast");
    await rt.race([slow.id, fast.id]);
    // Slow is still pending; await it to confirm.
    await rt.awaitAsync(slow.id);
    expect(slow.state).toBe("done");
  });
});

describe("AsyncRuntime.cancel", () => {
  it("marks the task as cancelled", () => {
    const rt = new AsyncRuntime();
    const t = rt.spawn(() => 1);
    rt.cancel(t.id);
    expect(t.cancelled).toBe(true);
  });

  it("awaitAsync rejects with 'task cancelled'", async () => {
    const rt = new AsyncRuntime();
    const t = rt.spawn(() => 1);
    rt.cancel(t.id);
    await expect(rt.awaitAsync(t.id)).rejects.toThrow(/cancelled/);
  });

  it("cancel is a no-op for an unknown id", () => {
    const rt = new AsyncRuntime();
    expect(() => rt.cancel(9999)).not.toThrow();
  });

  it("cancelling a finished task still rejects awaitAsync", async () => {
    const rt = new AsyncRuntime();
    const t = rt.spawn(() => 5);
    await rt.awaitAsync(t.id); // finish first
    rt.cancel(t.id);
    await expect(rt.awaitAsync(t.id)).rejects.toThrow(/cancelled/);
  });
});

describe("AsyncRuntime telemetry", () => {
  it("taskCount and channelCount track totals", () => {
    const rt = new AsyncRuntime();
    rt.spawn(() => 1);
    rt.spawn(() => 2);
    rt.channel();
    rt.channel();
    expect(rt.taskCount()).toBe(2);
    expect(rt.channelCount()).toBe(2);
  });
});

describe("registerAsyncBuiltins", () => {
  it("registers all expected builtin names", () => {
    const names: string[] = [];
    registerAsyncBuiltins((n) => names.push(n));
    expect(names).toContain("async_spawn");
    expect(names).toContain("async_await");
    expect(names).toContain("async_join");
    expect(names).toContain("async_race");
    expect(names).toContain("async_cancel");
    expect(names).toContain("async_channel");
    expect(names).toContain("async_send");
    expect(names).toContain("async_recv");
    expect(names).toContain("async_close");
    expect(names).toContain("async_select");
    expect(names).toContain("async_timeout");
    expect(names).toContain("async_defer");
    expect(names).toContain("async_runtime");
  });

  it("the registered builtins drive a fresh AsyncRuntime end-to-end", async () => {
    const sink: Record<string, (...args: any[]) => any> = {};
    registerAsyncBuiltins((n, fn) => { sink[n] = fn; });

    // Spawn a task and await it.
    const id: number = sink["async_spawn"](() => 42);
    const v = await sink["async_await"](id);
    expect(v).toBe(42);

    // Use a channel.
    const ch: Channel = sink["async_channel"](0);
    await sink["async_send"](ch, "x");
    expect(await sink["async_recv"](ch)).toBe("x");
    sink["async_close"](ch);
    expect(await sink["async_recv"](ch)).toBeUndefined();
  });
});
