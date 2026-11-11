/**
 * Aether stdlib — `io` module.
 *
 * The io module is split into two tiers:
 *
 * 1. Browser-usable (safe to call from the playground): print, println,
 *    printList, time, now, args, env.  These work everywhere.
 * 2. Node-only: readLine, writeFileSync, readFileSync, fileExists, sleep, exit.
 *    When called in a browser context (no `process`, no `fs`), these throw
 *    "io.<name>: not available in browser" — this IS the implementation.
 *
 * The playground's evaluator catches thrown errors and surfaces them as
 * Aether panics so the user sees a clear message instead of a crash.
 */

// ---------------------------------------------------------------------------
// Browser-usable
// ---------------------------------------------------------------------------

/** Output buffer used when no live console is available (playground). */
let _buffer: string[] | null = null;

/** Set by the host (playground) so print output can be captured. */
export function setOutputBuffer(buf: string[] | null): void {
  _buffer = buf;
}

/** Inject a Node `fs` module (used by tests and by host runtime). */
let _fs: any = null;
export function setNodeFs(mod: any): void {
  _fs = mod;
}

function _emit(line: string): void {
  if (_buffer !== null) {
    _buffer.push(line);
    return;
  }
  // No buffer set (Node host) — write to stdout.
  if (typeof console !== "undefined" && console.log) console.log(line);
}

export function print(x: any): void {
  _emit(toDisplay(x));
}

export function println(x: any): void {
  _emit(toDisplay(x));
}

export function printList(arr: any[]): void {
  if (!Array.isArray(arr)) throw new Error("printList: expected array");
  for (const x of arr) _emit(toDisplay(x));
}

/**
 * readLine: returns "" in browser, blocks on stdin in Node.
 * The Node implementation uses the readline module to read a single line
 * synchronously from /dev/stdin (no third-party dependency required).
 */
export function readLine(): string {
  if (!isNode()) throw new Error("io.readLine: not available in browser");
  // Synchronous read from stdin via fs (Node-only).
  const fs = requireNodeFs();
  const buf = fs.readFileSync(0, "utf8"); // fd 0 = stdin
  const nl = buf.indexOf("\n");
  return nl === -1 ? buf : buf.slice(0, nl);
}

/** writeFileSync: Node only. */
export function writeFileSync(path: string, content: string): void {
  assertString(path, "writeFileSync");
  assertString(content, "writeFileSync");
  if (!isNode()) throw new Error("io.writeFileSync: not available in browser");
  const fs = requireNodeFs();
  fs.writeFileSync(path, content, "utf8");
}

/** readFileSync: Node only. */
export function readFileSync(path: string): string {
  assertString(path, "readFileSync");
  if (!isNode()) throw new Error("io.readFileSync: not available in browser");
  const fs = requireNodeFs();
  return fs.readFileSync(path, "utf8");
}

/** fileExists: Node only. */
export function fileExists(path: string): boolean {
  assertString(path, "fileExists");
  if (!isNode()) throw new Error("io.fileExists: not available in browser");
  const fs = requireNodeFs();
  try {
    fs.accessSync(path, fs.constants ? fs.constants.F_OK : 0);
    return true;
  } catch {
    return false;
  }
}

/** args(): returns process.argv in Node, empty array in browser. */
export function args(): string[] {
  if (typeof process !== "undefined" && process.argv) {
    // Skip node binary and script path.
    return process.argv.slice(2);
  }
  return [];
}

/** env(name): returns process.env[name] or "" in browser. */
export function env(name: string): string {
  assertString(name, "env");
  if (typeof process !== "undefined" && process.env) {
    return process.env[name] ?? "";
  }
  return "";
}

/** time(): milliseconds since the Unix epoch. */
export function time(): number {
  return Date.now();
}

/** now(): ISO 8601 timestamp for the current instant. */
export function now(): string {
  return new Date().toISOString();
}

/** sleep(ms): synchronous sleep — Node only.  Throws in browser. */
export function sleep(ms: number): void {
  assertInt(ms, "sleep");
  if (ms < 0) throw new Error("sleep: negative duration");
  if (!isNode()) throw new Error("io.sleep: not available in browser");
  // Synchronous sleep using Atomics.wait on a shared buffer.
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, Math.min(ms, 0x7fffffff));
}

/** exit(code): terminates the process (Node) or throws in browser. */
export function exit(code: number): void {
  assertInt(code, "exit");
  if (!isNode()) throw new Error("io.exit: not available in browser");
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNode(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions !== "undefined" &&
    !!process.versions.node
  );
}

function requireNodeFs(): any {
  if (_fs) return _fs;
  // Try the standard require function (Node CJS, Bun).
  const g = globalThis as any;
  if (typeof g.require === "function") {
    try {
      return g.require("fs");
    } catch {
      // fall through
    }
  }
  // Try Node's `module.createRequire` (ESM contexts with import.meta).
  try {
    const m = g.require("module");
    return m.createRequire(import.meta.url)("fs");
  } catch {
    // fall through
  }
  // Last-ditch: dynamic require via Function (some bundlers preserve this).
  try {
    const r = new Function("return require")();
    if (typeof r === "function") return r("fs");
  } catch {
    // fall through
  }
  throw new Error("io: fs unavailable");
}

function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") throw new Error(fn + ": expected string, got " + typeof x);
}
function assertInt(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x) || !Number.isInteger(x)) {
    throw new Error(fn + ": expected integer, got " + String(x));
  }
}

function toDisplay(x: any): string {
  if (typeof x === "string") return x;
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (typeof x === "object") {
    try {
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  }
  return String(x);
}

// ---------------------------------------------------------------------------
export const MANIFEST = {
  module: "io",
  fns: [
    { name: "print", sig: "(x: any) -> void", desc: "Print value (no trailing newline)." },
    { name: "println", sig: "(x: any) -> void", desc: "Print value followed by newline." },
    { name: "printList", sig: "(arr: any[]) -> void", desc: "Print each element on its own line." },
    { name: "readLine", sig: "() -> string", desc: "Read a line from stdin (Node only)." },
    { name: "writeFileSync", sig: "(path: string, content: string) -> void", desc: "Write file (Node only)." },
    { name: "readFileSync", sig: "(path: string) -> string", desc: "Read file (Node only)." },
    { name: "fileExists", sig: "(path: string) -> bool", desc: "Test file existence (Node only)." },
    { name: "args", sig: "() -> string[]", desc: "Process args (excludes binary + script)." },
    { name: "env", sig: "(name: string) -> string", desc: "Environment variable (\"\" if unset)." },
    { name: "time", sig: "() -> int", desc: "Milliseconds since Unix epoch." },
    { name: "sleep", sig: "(ms: int) -> void", desc: "Synchronous sleep (Node only)." },
    { name: "now", sig: "() -> string", desc: "ISO 8601 timestamp for now." },
    { name: "exit", sig: "(code: int) -> void", desc: "Terminate process (Node only)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("print", print);
  registerBuiltin("println", println);
  registerBuiltin("printList", printList);
  registerBuiltin("readLine", readLine);
  registerBuiltin("writeFileSync", writeFileSync);
  registerBuiltin("readFileSync", readFileSync);
  registerBuiltin("fileExists", fileExists);
  registerBuiltin("args", args);
  registerBuiltin("env", env);
  registerBuiltin("time", time);
  registerBuiltin("sleep", sleep);
  registerBuiltin("now", now);
  registerBuiltin("exit", exit);
}
