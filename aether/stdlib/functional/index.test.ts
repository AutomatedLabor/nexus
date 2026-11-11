import { describe, it, expect, vi } from "vitest";
import * as F from "./index";

describe("functional module", () => {
  it("identity", () => {
    expect(F.identity(42)).toBe(42);
    expect(F.identity("x")).toBe("x");
    expect(F.identity(null)).toBe(null);
  });

  it("constant", () => {
    const f = F.constant(7);
    expect(f()).toBe(7);
    expect(f()).toBe(7);
    expect(F.constant("hi")()).toBe("hi");
  });

  it("compose", () => {
    const inc = (x: number) => x + 1;
    const dbl = (x: number) => x * 2;
    expect(F.compose(inc, dbl)(3)).toBe(7); // inc(dbl(3)) = inc(6) = 7
  });
  it("compose: non-function panics", () => {
    expect(() => F.compose(1 as any, () => 1)).toThrow();
  });

  it("pipe: left-to-right", () => {
    expect(F.pipe(3, (x: number) => x + 1, (x: number) => x * 2)).toBe(8);
  });
  it("pipe: no fns returns x", () => {
    expect(F.pipe(42)).toBe(42);
  });
  it("pipe: non-function panics", () => {
    expect(() => F.pipe(1, 2 as any)).toThrow();
  });

  it("pipeFns: builds reusable piped fn", () => {
    const p = F.pipeFns((x: number) => x + 1, (x: number) => x * 2);
    expect(p(3)).toBe(8);
    expect(p(0)).toBe(2);
  });

  it("curry + uncurry round-trip", () => {
    const add = (a: number, b: number) => a + b;
    const curried = F.curry(add);
    expect(curried(2)(3)).toBe(5);
    const back = F.uncurry(curried);
    expect(back(2, 3)).toBe(5);
  });

  it("partial: leading args", () => {
    const sub = (a: number, b: number, c: number) => a - b - c;
    const f = F.partial(sub, 10, 3);
    expect(f(2)).toBe(5);
  });

  it("flip", () => {
    const div = (a: number, b: number) => a / b;
    const flipped = F.flip(div);
    expect(flipped(2, 10)).toBe(5); // div(10, 2) = 5
  });

  it("memoize: caches by arg", () => {
    let calls = 0;
    const sq = F.memoize((x: number) => { calls++; return x * x; });
    expect(sq(3)).toBe(9);
    expect(sq(3)).toBe(9);
    expect(sq(4)).toBe(16);
    expect(calls).toBe(2);
  });

  it("once: only first call runs", () => {
    let calls = 0;
    const init = F.once(() => { calls++; return "ready"; });
    expect(init()).toBe("ready");
    expect(init()).toBe("ready");
    expect(calls).toBe(1);
  });

  it("debounce: only last call fires (with fake timers)", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = F.debounce(spy, 100);
    d(1); d(2); d(3);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });

  it("throttle: first call fires immediately, next suppressed", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const t = F.throttle(spy, 100);
    t(1); // fires
    t(2); // suppressed (within window); will fire at 100ms boundary
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(1);
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(2);
    vi.useRealTimers();
  });

  it("after: first n-1 calls no-op", () => {
    let calls = 0;
    const f = F.after(3, () => { calls++; return "go"; });
    expect(f()).toBe(undefined);
    expect(f()).toBe(undefined);
    expect(f()).toBe("go");
    expect(f()).toBe("go");
    expect(calls).toBe(2);
  });

  it("before: only first n calls run", () => {
    let calls = 0;
    const f = F.before(2, () => { calls++; return "ok"; });
    expect(f()).toBe("ok");
    expect(f()).toBe("ok");
    expect(f()).toBe(undefined);
    expect(calls).toBe(2);
  });

  it("wrap: wrapper controls invocation", () => {
    const wrapped = F.wrap((x: number) => x * 2, (fn, x) => fn(x) + 1);
    expect(wrapped(3)).toBe(7);
  });

  it("tap: side effect then return", () => {
    let seen: any = null;
    const r = F.tap(42, (x) => { seen = x; });
    expect(r).toBe(42);
    expect(seen).toBe(42);
  });

  it("try_: success path", () => {
    expect(F.try_(() => 5, () => 0)).toBe(5);
  });
  it("try_: handler path", () => {
    const r = F.try_(() => { throw new Error("boom"); }, (e) => e.message);
    expect(r).toBe("boom");
  });

  it("when: truthy calls fn", () => {
    expect(F.when(true, () => "yes")).toBe("yes");
    expect(F.when(false, () => "yes")).toBe(undefined);
    expect(F.when(null, () => "yes")).toBe(undefined);
  });

  it("unless: falsy calls fn", () => {
    expect(F.unless(false, () => "yes")).toBe("yes");
    expect(F.unless(true, () => "yes")).toBe(undefined);
  });

  it("condTuples: returns first truthy match", () => {
    const r = F.condTuples([
      [() => false, () => "a"],
      [() => true, () => "b"],
      [() => true, () => "c"],
    ]);
    expect(r).toBe("b");
  });
  it("condTuples: no match returns undefined", () => {
    expect(F.condTuples([[() => false, () => "x"]])).toBe(undefined);
  });
  it("condTuples: empty list returns undefined", () => {
    expect(F.condTuples([])).toBe(undefined);
  });
  it("condTuples: bad shape panics", () => {
    expect(() => F.condTuples([[1, 2]] as any)).toThrow();
    expect(() => F.condTuples([1, 2] as any)).toThrow();
  });

  it("non-function arg panics throughout", () => {
    expect(() => F.curry(1 as any)).toThrow();
    expect(() => F.flip(1 as any)).toThrow();
    expect(() => F.partial(1 as any)).toThrow();
    expect(() => F.once(1 as any)).toThrow();
    expect(() => F.tap(1, 2 as any)).toThrow();
    expect(() => F.when(true, 1 as any)).toThrow();
  });
});
