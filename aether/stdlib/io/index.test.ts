import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as IO from "./index";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Inject the host fs module so tests can exercise Node-only paths.
IO.setNodeFs(fs);

describe("io: browser-usable", () => {
  let captured: string[] = [];
  beforeEach(() => {
    captured = [];
    IO.setOutputBuffer(captured);
  });
  afterEach(() => {
    IO.setOutputBuffer(null);
  });

  it("print: emits to buffer", () => {
    IO.print("hello");
    expect(captured).toEqual(["hello"]);
  });
  it("println: emits to buffer", () => {
    IO.println("hi");
    expect(captured).toEqual(["hi"]);
  });
  it("print: numbers stringify", () => {
    IO.print(42);
    expect(captured).toEqual(["42"]);
  });
  it("print: objects JSON-encoded", () => {
    IO.print({ a: 1 });
    expect(captured).toEqual(['{"a":1}']);
  });
  it("printList: each element on its own line", () => {
    IO.printList([1, 2, 3]);
    expect(captured).toEqual(["1", "2", "3"]);
  });
  it("printList: non-array panics", () => {
    expect(() => IO.printList(5 as any)).toThrow();
  });
  it("time: returns finite ms", () => {
    const t = IO.time();
    expect(typeof t).toBe("number");
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThan(0);
  });
  it("now: ISO string parses", () => {
    const s = IO.now();
    expect(typeof s).toBe("string");
    expect(() => new Date(s).getTime()).not.toThrow();
    expect(new Date(s).getTime()).toBeGreaterThan(0);
  });
  it("args: array shape", () => {
    const a = IO.args();
    expect(Array.isArray(a)).toBe(true);
  });
  it("env: unknown var is empty", () => {
    expect(IO.env("__VERY_UNLIKELY_VAR__" + Math.random())).toBe("");
  });
  it("env: non-string panics", () => {
    expect(() => IO.env(123 as any)).toThrow();
  });
});

describe("io: Node-only (running under Node)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aether-io-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writeFileSync + readFileSync round-trip", () => {
    const p = path.join(tmp, "hello.txt");
    IO.writeFileSync(p, "Hello, Aether!");
    expect(IO.readFileSync(p)).toBe("Hello, Aether!");
  });
  it("fileExists: true after write, false before", () => {
    const p = path.join(tmp, "x.txt");
    expect(IO.fileExists(p)).toBe(false);
    IO.writeFileSync(p, "x");
    expect(IO.fileExists(p)).toBe(true);
  });
  it("fileExists: nonexistent returns false", () => {
    expect(IO.fileExists(path.join(tmp, "no-such-file"))).toBe(false);
  });
  it("readFileSync: bad path throws", () => {
    expect(() => IO.readFileSync(path.join(tmp, "no-such"))).toThrow();
  });
  it("exit: throws when suppressed", () => {
    // We can't actually exit a vitest worker.  Instead test that the
    // argument-validation path panics on non-integer input.
    expect(() => IO.exit(1.5 as any)).toThrow();
  });
  it("sleep: non-integer panics", () => {
    expect(() => IO.sleep(1.5 as any)).toThrow();
  });
  it("sleep: negative panics", () => {
    expect(() => IO.sleep(-1)).toThrow();
  });
  it("sleep: small duration returns (Node path)", () => {
    // A 1ms sleep should return quickly.  We accept any duration as success
    // here because we just want to exercise the Node code path; the next test
    // asserts timing more carefully.
    IO.sleep(1);
    expect(true).toBe(true);
  });
  it("sleep: actually waits roughly the requested time", () => {
    const start = Date.now();
    IO.sleep(40);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(500);
  });
  it("writeFileSync: non-string content panics", () => {
    expect(() => IO.writeFileSync(path.join(tmp, "z"), 5 as any)).toThrow();
  });
});

describe("io: browser-shim path (forced)", () => {
  it("writeFileSync throws when fs is unavailable", () => {
    // Inject a "broken" fs that throws on every call.  We simulate the
    // browser this way because vitest runs under Node and `require` is
    // available globally — without the injected fs we'd still find the
    // real one and write the file.  In the actual playground browser the
    // module-level injection never happens, so `requireNodeFs` falls through
    // to `throw new Error("io: fs unavailable")`.
    IO.setNodeFs(null);
    // Patch globalThis.require to throw — this exercises the catch branch.
    const orig = (globalThis as any).require;
    (globalThis as any).require = () => {
      throw new Error("not available");
    };
    try {
      expect(() => IO.writeFileSync("/tmp/x", "z")).toThrow();
    } finally {
      (globalThis as any).require = orig;
      IO.setNodeFs(fs);
    }
  });
});
