/**
 * aether/stdlib/async/index.test.ts
 * =================================
 * Promise behavior tests for the async stdlib. The v1 evaluator is sync,
 * so these run entirely against the TS implementation — they assert that
 * each Promise resolves/rejects with the expected value/timing.
 */
import { describe, it, expect } from "vitest";
import * as Async from "./index";

describe("async: channel", () => {
  it("send then recv delivers the value", async () => {
    const ch = Async.channel();
    await Async.send(ch, 42);
    const v = await Async.recv(ch);
    expect(v).toBe(42);
  });
  it("recv before send blocks then unblocks", async () => {
    const ch = Async.channel();
    const p = Async.recv(ch);
    await Async.send(ch, "hi");
    expect(await p).toBe("hi");
  });
  it("recv on closed channel rejects", async () => {
    const ch = Async.channel();
    Async.close(ch);
    await expect(Async.recv(ch)).rejects.toThrow(/closed/);
  });
  it("send on closed channel rejects", async () => {
    const ch = Async.channel();
    Async.close(ch);
    await expect(Async.send(ch, 1)).rejects.toThrow(/closed/);
  });
});

describe("async: select", () => {
  it("selects the first ready recv", async () => {
    const a = Async.channel();
    const b = Async.channel();
    await Async.send(a, "from-a");
    const r = await Async.select([
      { ch: a, op: "recv" },
      { ch: b, op: "recv" },
    ]);
    expect(r.index).toBe(0);
    expect(r.value).toBe("from-a");
  });
  it("times out when no op is ready", async () => {
    const a = Async.channel();
    const r = await Async.select([{ ch: a, op: "recv" }], 20);
    expect(r.index).toBe(-1);
  });
});

describe("async: timeout", () => {
  it("resolves after the delay", async () => {
    const t0 = Date.now();
    await Async.timeout(20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
  });
});

describe("async: spawn / awaitAll / race", () => {
  it("spawn runs fn and resolves with its value", async () => {
    const v = await Async.spawn(() => 7);
    expect(v).toBe(7);
  });
  it("awaitAll resolves with all values in order", async () => {
    const r = await Async.awaitAll([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)]);
    expect(r).toEqual([1, 2, 3]);
  });
  it("race resolves with the first settled promise", async () => {
    const r = await Async.race([
      Async.timeout(20).then(() => "slow"),
      Promise.resolve("fast"),
    ]);
    expect(r).toBe("fast");
  });
});

describe("async: mapAsync / filterAsync / reduceAsync", () => {
  it("mapAsync applies an async fn", async () => {
    const r = await Async.mapAsync([1, 2, 3], async (x) => x * 10);
    expect(r).toEqual([10, 20, 30]);
  });
  it("filterAsync keeps only truthy results", async () => {
    const r = await Async.filterAsync([1, 2, 3, 4], async (x) => x % 2 === 0);
    expect(r).toEqual([2, 4]);
  });
  it("reduceAsync folds left", async () => {
    const r = await Async.reduceAsync([1, 2, 3, 4], async (a, b) => a + b, 0);
    expect(r).toBe(10);
  });
});

describe("async: retry / defer / debounce", () => {
  it("retry succeeds without retrying when fn works", async () => {
    let calls = 0;
    const r = await Async.retry(3, () => { calls++; return Promise.resolve("ok"); });
    expect(r).toBe("ok");
    expect(calls).toBe(1);
  });
  it("retry retries up to n times then rethrows", async () => {
    let calls = 0;
    await expect(Async.retry(2, () => { calls++; return Promise.reject(new Error("nope")); })).rejects.toThrow("nope");
    expect(calls).toBe(2);
  });
  it("defer fires on the next microtask", async () => {
    let fired = false;
    Async.defer(() => { fired = true; });
    expect(fired).toBe(false);
    await Promise.resolve(); // let microtasks drain
    expect(fired).toBe(true);
  });
  it("debounce coalesces rapid calls", async () => {
    let calls = 0;
    const d = Async.debounce(() => { calls++; }, 15);
    d(); d(); d();
    expect(calls).toBe(0);
    await Async.timeout(25);
    expect(calls).toBe(1);
  });
});

describe("async: register", () => {
  it("throws to prevent accidental wiring into the sync evaluator", () => {
    expect(() => Async.register(() => {})).toThrow(/v2 runtime/);
  });
});
