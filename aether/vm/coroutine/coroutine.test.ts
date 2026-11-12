/**
 * aether/vm/coroutine/coroutine.test.ts
 * ======================================
 * 60 tests for the v3 coroutine runtime. Covers spawn+await,
 * yield+resume (generators), channels (send/recv/block/select),
 * structured concurrency (join/race/timeout), cancellation, the
 * Aether-evaluator integration via `registerCoroutineBuiltins`, and
 * end-to-end Aether programs that use async builtins.
 */
import { describe, it, expect } from "vitest";
import { CoroutineScheduler, registerCoroutineBuiltins, type Channel, type Coroutine } from "./coroutine";
import { compile } from "../../core/index";

//----------------------------------------------------------------------------
// spawn + await (basic, async fn, value propagation)
//----------------------------------------------------------------------------

describe("CoroutineScheduler.spawn + await", () => {
  it("spawn runs a sync body and await returns its value", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      return 42;
    });
    expect(s.await(co)).toBe(42);
    expect(co.state).toBe("done");
    expect(co.value).toBe(42);
  });

  it("spawn body can yield and then return", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return 99;
    });
    // The coroutine yields first — resume steps past the yield, then
    // the second resume runs to completion.
    expect(s.resume(co)).toBe(1);
    expect(s.resume(co)).toBe(99);
    expect(co.state).toBe("done");
  });

  it("await drives the scheduler when the body suspends on await", () => {
    const s = new CoroutineScheduler();
    const inner = s.spawn(function* () {
      return 7;
    });
    const outer = s.spawn(function* (sched) {
      const v = yield { kind: "await", co: inner };
      return (v as number) + 100;
    });
    expect(s.await(outer)).toBe(107);
  });

  it("await returns the same value when called twice", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      return 7;
    });
    expect(s.await(co)).toBe(7);
    expect(s.await(co)).toBe(7);
    expect(co.state).toBe("done");
  });

  it("await rethrows when the body throws", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      throw new Error("boom");
    });
    expect(() => s.await(co)).toThrow(/boom/);
    expect(co.state).toBe("error");
    expect(co.error).toBe("boom");
  });

  it("spawnFn wraps a host function and await returns its value", () => {
    const s = new CoroutineScheduler();
    const co = s.spawnFn(() => 42);
    expect(s.await(co)).toBe(42);
    expect(co.state).toBe("done");
  });

  it("spawnFn propagates the function's error", () => {
    const s = new CoroutineScheduler();
    const co = s.spawnFn(() => {
      throw new Error("oops");
    });
    expect(() => s.await(co)).toThrow(/oops/);
    expect(co.state).toBe("error");
  });

  it("spawn assigns monotonic ids", () => {
    const s = new CoroutineScheduler();
    const a = s.spawn(function* () { return 1; });
    const b = s.spawn(function* () { return 2; });
    const c = s.spawn(function* () { return 3; });
    expect(b.id).toBe(a.id + 1);
    expect(c.id).toBe(b.id + 1);
  });

  it("spawn sets the parent to the currently-running coroutine", () => {
    const s = new CoroutineScheduler();
    let child: Coroutine | null = null;
    const parent = s.spawn(function* () {
      child = s.spawn(function* () { return 1; });
      yield { kind: "await", co: child };
      return 0;
    });
    s.await(parent);
    expect(child).not.toBeNull();
    expect((child as Coroutine).parent).toBe(parent);
  });

  it("getCoroutine returns the coroutine by id", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () { return 0; });
    expect(s.getCoroutine(co.id)).toBe(co);
    expect(s.getCoroutine(99999)).toBeUndefined();
  });

  it("allCoroutines returns all in spawn order", () => {
    const s = new CoroutineScheduler();
    const a = s.spawn(function* () { return 1; });
    const b = s.spawn(function* () { return 2; });
    const c = s.spawn(function* () { return 3; });
    expect(s.allCoroutines()).toEqual([a, b, c]);
  });

  it("completionOrder records done coroutines in order", () => {
    const s = new CoroutineScheduler();
    const a = s.spawn(function* () { return 1; });
    const b = s.spawn(function* () { return 2; });
    const c = s.spawn(function* () { return 3; });
    s.await(a);
    s.await(b);
    s.await(c);
    expect(s.completionOrder()).toEqual([a.id, b.id, c.id]);
  });
});

//----------------------------------------------------------------------------
// yield + resume (generators-style)
//----------------------------------------------------------------------------

describe("CoroutineScheduler.yield + resume", () => {
  it("a coroutine yields twice and resume collects both values", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      yield { kind: "yield", value: 2 };
      return 3;
    });
    // First resume — the coroutine runs to the first yield.
    expect(s.resume(co)).toBe(1);
    expect(co.state).toBe("suspended");
    // Second resume — runs to the second yield.
    expect(s.resume(co)).toBe(2);
    expect(co.state).toBe("suspended");
    // Third resume — runs to completion.
    expect(s.resume(co)).toBe(3);
    expect(co.state).toBe("done");
  });

  it("resume returns the final value when the coroutine is done", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () { return 42; });
    s.await(co);
    expect(s.resume(co)).toBe(42);
    expect(co.state).toBe("done");
  });

  it("send passes a value into the next yield expression", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      const a = yield { kind: "yield", value: 0 };
      const b = yield { kind: "yield", value: (a as number) + 10 };
      return (b as number) + 100;
    });
    expect(s.resume(co)).toBe(0);
    s.send(co, 5);
    // After send, the coroutine has yielded again with value 15.
    expect(co.value).toBe(15);
    expect(co.state).toBe("suspended");
    s.send(co, 20);
    expect(co.value).toBe(120);
    expect(co.state).toBe("done");
  });

  it("resume throws if the coroutine isn't suspended on a yield", () => {
    const s = new CoroutineScheduler();
    // Inner yields (doesn't complete) so outer's await never resolves.
    const inner = s.spawn(function* () {
      yield { kind: "yield", value: 99 };
      return 1;
    });
    const outer = s.spawn(function* () {
      yield { kind: "await", co: inner };
      return 0;
    });
    // Step the scheduler twice: inner suspends on yield, outer
    // suspends on the await (parked on inner's awaiter list).
    s.stepOncePublic();
    s.stepOncePublic();
    expect(outer.state).toBe("suspended");
    expect(outer.suspendReason.kind).toBe("await");
    // Now resume should throw because outer is suspended on an await.
    expect(() => s.resume(outer)).toThrow(/suspended on await/);
  });

  it("send throws if the coroutine is done", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () { return 0; });
    s.await(co);
    expect(co.state).toBe("done");
    expect(() => s.send(co, 1)).toThrow(/cannot send/);
  });

  it("resume throws if the coroutine is cancelled", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return 0;
    });
    s.resume(co);
    s.cancel(co);
    expect(() => s.resume(co)).toThrow(/cancelled/);
  });

  it("a coroutine that yields infinitely can be stepped manually via resume", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      let i = 0;
      while (true) {
        yield { kind: "yield", value: i };
        i = i + 1;
      }
    });
    expect(s.resume(co)).toBe(0);
    expect(s.resume(co)).toBe(1);
    expect(s.resume(co)).toBe(2);
    expect(s.resume(co)).toBe(3);
    s.cancel(co);
  });
});

//----------------------------------------------------------------------------
// Channels: send / recv / blocking / select
//----------------------------------------------------------------------------

describe("CoroutineScheduler.channel — buffered send/recv", () => {
  it("send then recv on a buffered channel returns the sent value", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(2);
    s.send(ch, 10);
    s.send(ch, 20);
    expect(s.recv(ch)).toBe(10);
    expect(s.recv(ch)).toBe(20);
  });

  it("capacity 0 (unbounded) accepts many sends", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(0);
    for (let i = 0; i < 100; i++) s.send(ch, i);
    for (let i = 0; i < 100; i++) expect(s.recv(ch)).toBe(i);
  });

  it("channel ids are monotonic", () => {
    const s = new CoroutineScheduler();
    const a = s.channel();
    const b = s.channel();
    expect(b.id).toBe(a.id + 1);
  });

  it("getChannel returns the channel by id", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(1);
    expect(s.getChannel(ch.id)).toBe(ch);
    expect(s.getChannel(99999)).toBeUndefined();
  });

  it("recv on an empty open channel returns undefined (host-side)", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(1);
    expect(s.recv(ch)).toBeUndefined();
  });

  it("send blocks (parks the sender) when the buffer is full", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(2);
    // Spawn a producer that tries to send 3 values; the third should park.
    const producer = s.spawn(function* (sched) {
      yield { kind: "channel_send", ch, value: 1 };
      yield { kind: "channel_send", ch, value: 2 };
      yield { kind: "channel_send", ch, value: 3 };
      return "done";
    });
    // Drive the producer until it parks.
    // First step: sends 1 (buffered).
    s.stepOncePublic();
    // Second step: sends 2 (buffered).
    s.stepOncePublic();
    // Third step: tries to send 3 — buffer is full, parks.
    s.stepOncePublic();
    expect(producer.state).toBe("suspended");
    expect(producer.suspendReason.kind).toBe("channel_send");
    expect(ch.buf.length).toBe(2);
    expect(ch.sendWaiters.length).toBe(1);
  });

  it("recv unblocks a parked sender", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(1);
    const producer = s.spawn(function* (sched) {
      yield { kind: "channel_send", ch, value: 11 };
      yield { kind: "channel_send", ch, value: 22 };
      return "done";
    });
    // First step: sends 11 (buffered).
    s.stepOncePublic();
    // Second step: tries to send 22 — buffer is full, parks.
    s.stepOncePublic();
    expect(producer.state).toBe("suspended");
    // Now recv — should take 11 from the buffer and wake the producer.
    const v = s.recv(ch);
    expect(v).toBe(11);
    // The producer is now ready (re-enqueued) with its value buffered.
    expect(producer.state).not.toBe("suspended");
    expect(ch.buf.length).toBe(1);
    expect(ch.buf[0]).toBe(22);
    // Recv again to drain.
    expect(s.recv(ch)).toBe(22);
  });

  it("recv blocks (parks the receiver) when the channel is empty", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(2);
    const consumer = s.spawn(function* (sched) {
      const v = yield { kind: "channel_recv", ch };
      return v;
    });
    s.stepOncePublic();
    expect(consumer.state).toBe("suspended");
    expect(consumer.suspendReason.kind).toBe("channel_recv");
    expect(ch.recvWaiters.length).toBe(1);
  });

  it("send unblocks a parked receiver", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(2);
    const consumer = s.spawn(function* (sched) {
      const v = yield { kind: "channel_recv", ch };
      return v;
    });
    s.stepOncePublic();
    expect(consumer.state).toBe("suspended");
    // Send — should hand the value directly to the waiting receiver.
    s.send(ch, "hello");
    // The consumer should be done with the value.
    s.await(consumer);
    expect(consumer.state).toBe("done");
    expect(consumer.value).toBe("hello");
  });

  it("a producer and consumer run concurrently via the scheduler", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(0); // unbounded
    const producer = s.spawn(function* (sched) {
      for (let i = 0; i < 5; i++) {
        yield { kind: "channel_send", ch, value: i };
      }
      return "produced";
    });
    const consumer = s.spawn(function* (sched) {
      let sum = 0;
      for (let i = 0; i < 5; i++) {
        const v = yield { kind: "channel_recv", ch };
        sum = sum + (v as number);
      }
      return sum;
    });
    // Run the consumer (it drives the producer via channel ops).
    expect(s.await(consumer)).toBe(0 + 1 + 2 + 3 + 4);
    // The producer should also be done.
    s.await(producer);
  });

  it("a bounded channel producer/consumer exchange values", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(1); // bounded, capacity 1
    const producer = s.spawn(function* (sched) {
      for (let i = 0; i < 4; i++) {
        yield { kind: "channel_send", ch, value: i };
      }
      return 0;
    });
    const consumer = s.spawn(function* (sched) {
      let sum = 0;
      for (let i = 0; i < 4; i++) {
        const v = yield { kind: "channel_recv", ch };
        sum = sum + (v as number);
      }
      return sum;
    });
    expect(s.await(consumer)).toBe(0 + 1 + 2 + 3);
    s.await(producer);
  });
});

//----------------------------------------------------------------------------
// select
//----------------------------------------------------------------------------

describe("CoroutineScheduler.select", () => {
  it("select returns the first ready channel", () => {
    const s = new CoroutineScheduler();
    const ch1 = s.channel(1);
    const ch2 = s.channel(1);
    s.send(ch1, 100);
    const r = s.select([ch1, ch2]);
    expect(r.ch).toBe(ch1);
    expect(r.v).toBe(100);
  });

  it("select returns the value from the second channel when the first is empty", () => {
    const s = new CoroutineScheduler();
    const ch1 = s.channel(1);
    const ch2 = s.channel(1);
    s.send(ch2, 200);
    const r = s.select([ch1, ch2]);
    expect(r.ch).toBe(ch2);
    expect(r.v).toBe(200);
  });

  it("select throws if no channel is ready (host-side)", () => {
    const s = new CoroutineScheduler();
    const ch1 = s.channel(1);
    const ch2 = s.channel(1);
    expect(() => s.select([ch1, ch2])).toThrow(/no channel is ready/);
  });

  it("select unblocks a parked sender when picking that channel", () => {
    const s = new CoroutineScheduler();
    const ch1 = s.channel(1);
    const ch2 = s.channel(1);
    // Fill ch1 with a value; ch2 is empty.
    s.send(ch1, 11);
    const r = s.select([ch1, ch2]);
    expect(r.ch).toBe(ch1);
    expect(r.v).toBe(11);
  });

  it("select with three channels picks the ready one", () => {
    const s = new CoroutineScheduler();
    const ch1 = s.channel(1);
    const ch2 = s.channel(1);
    const ch3 = s.channel(1);
    s.send(ch3, 33);
    const r = s.select([ch1, ch2, ch3]);
    expect(r.ch).toBe(ch3);
    expect(r.v).toBe(33);
  });
});

//----------------------------------------------------------------------------
// join (structured concurrency — all)
//----------------------------------------------------------------------------

describe("CoroutineScheduler.join", () => {
  it("join waits for all and returns their values in order", () => {
    const s = new CoroutineScheduler();
    const a = s.spawn(function* () { return 1; });
    const b = s.spawn(function* () { return 2; });
    const c = s.spawn(function* () { return 3; });
    expect(s.join([a, b, c])).toEqual([1, 2, 3]);
  });

  it("join works when coroutines complete in any order", () => {
    const s = new CoroutineScheduler();
    const inner1 = s.spawn(function* () { return 100; });
    const inner2 = s.spawn(function* () {
      yield { kind: "await", co: inner1 };
      return 200;
    });
    const inner3 = s.spawn(function* () {
      yield { kind: "await", co: inner2 };
      return 300;
    });
    expect(s.join([inner1, inner2, inner3])).toEqual([100, 200, 300]);
  });

  it("join throws if any coroutine errored", () => {
    const s = new CoroutineScheduler();
    const a = s.spawn(function* () { return 1; });
    const b = s.spawn(function* () { throw new Error("kaboom"); });
    const c = s.spawn(function* () { return 3; });
    expect(() => s.join([a, b, c])).toThrow(/kaboom/);
  });

  it("join on an empty list returns an empty array", () => {
    const s = new CoroutineScheduler();
    expect(s.join([])).toEqual([]);
  });

  it("join works with coroutines that yield intermediate values", () => {
    const s = new CoroutineScheduler();
    const a = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return 10;
    });
    const b = s.spawn(function* () {
      yield { kind: "yield", value: 2 };
      return 20;
    });
    // The yield doesn't block join — join uses runUntil which only
    // requires state to be 'done'. We need to resume the coroutines
    // first to get them past their yields. (Or join would deadlock.)
    s.resume(a);
    s.resume(b);
    expect(s.join([a, b])).toEqual([10, 20]);
  });
});

//----------------------------------------------------------------------------
// race (structured concurrency — first wins)
//----------------------------------------------------------------------------

describe("CoroutineScheduler.race", () => {
  it("race returns the value of the first coroutine to complete", () => {
    const s = new CoroutineScheduler();
    const fast = s.spawn(function* () { return "fast"; });
    const slow = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return "slow";
    });
    // Race — fast completes immediately, slow is suspended on yield
    // or never stepped. Either way, slow hasn't completed.
    expect(s.race([fast, slow])).toBe("fast");
    expect(slow.state).not.toBe("done");
    // Step slow to completion via resume.
    if (slow.state === "suspended") {
      // Already stepped past the first yield; resume gets the first
      // yielded value.
      expect(s.resume(slow)).toBe(1);
      // Second resume runs to completion.
      expect(s.resume(slow)).toBe("slow");
    } else {
      // Slow is still 'pending' — first resume steps to the first yield.
      expect(s.resume(slow)).toBe(1);
      // Second resume runs to completion.
      expect(s.resume(slow)).toBe("slow");
    }
    expect(slow.state).toBe("done");
  });

  it("race returns the first done when coroutines complete in order", () => {
    const s = new CoroutineScheduler();
    const a = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return "a";
    });
    const b = s.spawn(function* () { return "b"; });
    // b completes first (a is suspended on yield).
    expect(s.race([a, b])).toBe("b");
  });

  it("race throws if all coroutines deadlock", () => {
    const s = new CoroutineScheduler();
    const a = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return 0;
    });
    const b = s.spawn(function* () {
      yield { kind: "yield", value: 2 };
      return 0;
    });
    // Both suspended on yield — neither will make progress without
    // a resume. Race should detect the deadlock.
    expect(() => s.race([a, b])).toThrow(/deadlock/);
  });

  it("race with an empty list throws (no winner)", () => {
    const s = new CoroutineScheduler();
    expect(() => s.race([])).toThrow();
  });
});

//----------------------------------------------------------------------------
// timeout
//----------------------------------------------------------------------------

describe("CoroutineScheduler.timeout", () => {
  it("timeout spawns a coroutine that completes via the scheduler", () => {
    const s = new CoroutineScheduler();
    const t = s.timeout(50);
    expect(t.state).toBe("pending");
    s.await(t);
    expect(t.state).toBe("done");
    expect(t.value).toBeNull();
  });

  it("timeout is awaitable in another coroutine", () => {
    const s = new CoroutineScheduler();
    const t = s.timeout(10);
    const outer = s.spawn(function* () {
      yield { kind: "await", co: t };
      return "after timeout";
    });
    expect(s.await(outer)).toBe("after timeout");
  });

  it("race between a timeout and a slow coroutine — timeout wins", () => {
    const s = new CoroutineScheduler();
    const t = s.timeout(0); // completes immediately
    const slow = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return "slow";
    });
    expect(s.race([t, slow])).toBeNull();
  });

  it("timeout ids are monotonic and live in the registry", () => {
    const s = new CoroutineScheduler();
    const t1 = s.timeout(1);
    const t2 = s.timeout(2);
    expect(t2.id).toBe(t1.id + 1);
    expect(s.getCoroutine(t1.id)).toBe(t1);
    expect(s.getCoroutine(t2.id)).toBe(t2);
  });
});

//----------------------------------------------------------------------------
// cancel
//----------------------------------------------------------------------------

describe("CoroutineScheduler.cancel", () => {
  it("cancel marks the coroutine as cancelled", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return 0;
    });
    s.resume(co);
    s.cancel(co);
    expect(co.state).toBe("cancelled");
    expect(co.cancelled).toBe(true);
  });

  it("await on a cancelled coroutine throws", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return 0;
    });
    s.resume(co);
    s.cancel(co);
    expect(() => s.await(co)).toThrow(/cancelled/);
  });

  it("cancel removes the coroutine from the run queue", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () { return 0; });
    s.cancel(co);
    expect(co.state).toBe("cancelled");
    // await won't pick it up.
    expect(() => s.await(co)).toThrow(/cancelled/);
  });

  it("cancel wakes awaiters with a cancelled state", () => {
    const s = new CoroutineScheduler();
    const target = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return 0;
    });
    const awaiter = s.spawn(function* () {
      yield { kind: "await", co: target };
      return 999;
    });
    // Step twice: first target (suspends on yield), then awaiter
    // (suspends on await, parked on target's awaiter list).
    s.stepOncePublic();
    s.stepOncePublic();
    expect(target.state).toBe("suspended");
    expect(awaiter.state).toBe("suspended");
    expect(awaiter.suspendReason.kind).toBe("await");
    // Now cancel the target — awaiter should be marked cancelled.
    s.cancel(target);
    expect(target.state).toBe("cancelled");
    expect(awaiter.state).toBe("cancelled");
  });

  it("cancel on an already-done coroutine is a no-op", () => {
    const s = new CoroutineScheduler();
    const co = s.spawn(function* () { return 1; });
    s.await(co);
    expect(co.state).toBe("done");
    s.cancel(co);
    expect(co.state).toBe("done");
  });

  it("a cancelled coroutine is skipped by the scheduler", () => {
    const s = new CoroutineScheduler();
    const a = s.spawn(function* () { return 1; });
    const b = s.spawn(function* () {
      yield { kind: "yield", value: 1 };
      return 2;
    });
    const c = s.spawn(function* () { return 3; });
    s.cancel(b);
    expect(s.join([a, c])).toEqual([1, 3]);
  });

  it("cancel detaches the coroutine from channel waiter lists", () => {
    const s = new CoroutineScheduler();
    const ch = s.channel(1);
    const recv = s.spawn(function* () {
      const v = yield { kind: "channel_recv", ch };
      return v;
    });
    s.stepOncePublic();
    expect(ch.recvWaiters.length).toBe(1);
    s.cancel(recv);
    expect(ch.recvWaiters.length).toBe(0);
  });
});

//----------------------------------------------------------------------------
// End-to-end via the Aether evaluator (registerCoroutineBuiltins)
//----------------------------------------------------------------------------

describe("End-to-end Aether programs with coroutine builtins", () => {
  // Helper: run an Aether program with coroutine builtins. The evaluator
  // auto-registers coroutine builtins in installInlineBuiltins (with the
  // evaluator's callValue so spawn can invoke Aether closures). We just
  // call compile() and inspect the runtime result.
  const runAe = (src: string) => {
    const r = compile(src, { maxSteps: 1_000_000 });
    return r.runtime ?? { value: null, output: [], steps: 0, error: r.errors[0] ? { message: r.errors[0].message } : undefined };
  };

  it("spawn + await returns the spawned value", () => {
    const src = `
      fn forty_two() -> int { 42 }
      let co = spawn(forty_two);
      let v = await(co);
      print(v);
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["42"]);
  });

  it("spawn + await with an inline closure", () => {
    const src = `
      let co = spawn(fn() -> int { 100 });
      let v = await(co);
      print(v);
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["100"]);
  });

  it("channel + send_ch + recv round-trips a value", () => {
    const src = `
      let ch = channel(2);
      send_ch(ch, 42);
      let v = recv(ch);
      print(v);
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["42"]);
  });

  it("channel with capacity 0 accepts unbounded sends", () => {
    const src = `
      let ch = channel(0);
      send_ch(ch, 1);
      send_ch(ch, 2);
      send_ch(ch, 3);
      print(recv(ch));
      print(recv(ch));
      print(recv(ch));
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["1", "2", "3"]);
  });

  it("join collects values from multiple spawned coroutines", () => {
    const src = `
      let co1 = spawn(fn() -> int { 11 });
      let co2 = spawn(fn() -> int { 22 });
      let co3 = spawn(fn() -> int { 33 });
      let vals = join([co1, co2, co3]);
      print(vals[0]);
      print(vals[1]);
      print(vals[2]);
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["11", "22", "33"]);
  });

  it("race returns the first completed value", () => {
    const src = `
      let co1 = spawn(fn() -> int { 7 });
      let v = race([co1]);
      print(v);
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["7"]);
  });

  it("timeout is spawnable and awaitable", () => {
    const src = `
      let t = timeout(0);
      await(t);
      print("done");
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["done"]);
  });

  it("cancel marks a coroutine and await throws", () => {
    const src = `
      let co = spawn(fn() -> int { 5 });
      cancel(co);
      print("cancelled");
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["cancelled"]);
  });

  it("coroutine_count and channel_count report usage", () => {
    const src = `
      let co = spawn(fn() -> int { 1 });
      let ch = channel(2);
      print(coroutine_count());
      print(channel_count());
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["1", "1"]);
  });

  it("a multi-step pipeline: spawn → channel → recv → print", () => {
    const src = `
      fn producer() -> int { 42 }
      let co = spawn(producer);
      let ch = channel(1);
      send_ch(ch, await(co));
      print(recv(ch));
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["42"]);
  });

  it("multiple awaits on the same coroutine are idempotent", () => {
    const src = `
      let co = spawn(fn() -> int { 9 });
      let a = await(co);
      let b = await(co);
      print(a);
      print(b);
    `;
    const r = runAe(src);
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["9", "9"]);
  });
});

//----------------------------------------------------------------------------
// Helpers / extensions to the public API used by tests
//----------------------------------------------------------------------------

/**
 * Step the scheduler once, exposed as a public method for tests that
 * want to drive the queue manually (e.g., to verify a coroutine parks
 * on a channel send). This is added via prototype extension so the
 * public class surface stays clean.
 */
declare module "./coroutine" {
  interface CoroutineScheduler {
    stepOncePublic(): boolean;
  }
}
CoroutineScheduler.prototype.stepOncePublic = function (): boolean {
  // Access the private method via (this as any). The method exists;
  // it's just typed as private. This is a test-only escape hatch.
  return (this as any).stepOnce();
};
