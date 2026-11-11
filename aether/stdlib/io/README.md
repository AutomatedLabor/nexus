# Aether stdlib — `io`

The `io` module is the bridge between an Aether program and the outside world.  Because Aether is designed to run both inside a browser playground (the primary delivery surface) and on Node-based hosts, the module is split into two tiers:

1. **Browser-usable** — `print`, `println`, `printList`, `time`, `now`, `args`, `env`.  These functions work identically in every environment.  `args` and `env` degrade gracefully: `args` returns an empty array when `process.argv` is unavailable, and `env(name)` returns `""` for unset (or unavailable) variables.
2. **Node-only** — `readLine`, `writeFileSync`, `readFileSync`, `fileExists`, `sleep`, `exit`.  When invoked in a browser these throw a clear `io.<name>: not available in browser` error — and **this throw IS the implementation**, by design.  The evaluator catches the throw and surfaces it to the user as an Aether panic with the explanatory message, so users see exactly what went wrong rather than a silent no-op.

## Output capture

The playground host calls `io.setOutputBuffer([])` to capture every `print`/`println`/`printList` line into a shared array.  When a buffer is set, `_emit` pushes into it without touching `console`.  When no buffer is set (Node REPL, CLI tool, tests outside the playground), output goes to `console.log`.  This dual-mode behaviour means the same `print` call works in a CLI build, a server log, and a browser canvas without recompilation.

For the Node-only functions the module uses an injectable `fs` (`setNodeFs(mod)`).  The host runtime calls `setNodeFs(require("fs"))` once on startup; tests do the same.  In a browser the inject never happens, so any attempt to reach the filesystem cascades into a clear panic.

## Browser-usable functions

### `print(x: any) -> void`
Prints a single value.  Strings are emitted verbatim; numbers and booleans use their JS string form; `null`/`undefined` become `"null"`/`"undefined"`; objects and arrays are JSON-encoded.

```aether
io.print("hello")
io.print(42)
io.print({a: 1, b: 2})
```

### `println(x: any) -> void`
Like `print` but conceptually ends a line.  In the captured-buffer model each `println` call is one entry in the array (the playground inserts visual line breaks between entries).

```aether
io.println("first")
io.println("second")
```

### `printList(arr: any[]) -> void`
Prints each element of `arr` on its own line.  Panics when called with a non-array.

```aether
io.printList([1, 2, 3])
// 1
// 2
// 3
```

### `time() -> int`
Returns the number of milliseconds since the Unix epoch (1 January 1970 UTC).  Use `datetime` helpers to convert into calendar fields.

```aether
io.time()   // 1697000000000-ish
```

### `now() -> string`
Returns the current instant as an ISO 8601 string with milliseconds, e.g. `"2024-04-12T11:23:45.678Z"`.  Equivalent to `new Date().toISOString()`.

```aether
io.now()    // "2024-04-12T11:23:45.678Z"
```

### `args() -> string[]`
Returns the process command-line arguments (excluding the runtime binary and the script path).  In a browser this is `[]`.

```aether
io.args()    // ["--port=8080", "config.json"] under Node; [] in browser
```

### `env(name: string) -> string`
Returns the value of the environment variable `name`, or `""` when it is unset (or when environment access is unavailable, as in the browser).

```aether
io.env("HOME")          // "/home/z"
io.env("__NONE__")       // ""
```

## Node-only functions

These throw `io.<name>: not available in browser` when invoked outside Node.  The throw is the implementation — the evaluator surfaces it as a runtime panic with the message.

### `readLine() -> string`
Reads a single line from stdin (up to and excluding the newline).  Implemented via `fs.readFileSync(0, "utf8")` (fd 0 is stdin).  Throws when called in the browser.

```aether
let name = io.readLine()
io.println("Hello, " + name)
```

### `writeFileSync(path: string, content: string) -> void`
Writes `content` to `path`, replacing any existing file.  Uses UTF-8 encoding.  Throws on a non-string `path` or `content`; throws in the browser.

```aether
io.writeFileSync("/tmp/x.txt", "hello")
```

### `readFileSync(path: string) -> string`
Reads the entire file at `path` as a UTF-8 string.  Throws when the file does not exist; throws in the browser.

```aether
let text = io.readFileSync("/tmp/x.txt")
```

### `fileExists(path: string) -> bool`
Returns `true` when `path` is accessible, `false` otherwise.  Implemented via `fs.accessSync` so it follows symlinks.  Throws in the browser.

```aether
if (io.fileExists("/tmp/x.txt")) {
  io.println("found")
}
```

### `sleep(ms: int) -> void`
Synchronously sleeps for `ms` milliseconds.  Implemented with `Atomics.wait` on a shared buffer (Node only — `SharedArrayBuffer` is not generally available in browser workers).  Panics for negative `ms`.

```aether
io.sleep(500)   // half a second
```

### `exit(code: int) -> void`
Terminates the Node process with exit code `code`.  Throws in the browser (there is no process to exit).  Panics for non-integer `code`.

```aether
if (something_went_wrong) {
  io.exit(1)
}
```

## Diagnostics and how the playground handles failure

The playground evaluator runs every Aether program inside a sandboxed worker and catches thrown errors at every builtin call.  When a Node-only builtin is invoked from a browser program, the panic message the user sees is the exact error string the module throws (`io.sleep: not available in browser`), which makes the cause immediately obvious without the user having to dig into stack traces.  This is why every "not available" message names both the module and the function.

For browser-usable functions the design is intentionally forgiving: `args() == []`, `env(name) == ""`, and `time()`/`now()` return useful values rather than panicking.  This lets the same program produce sensible output in either environment without conditional code.

## A small CLI example

```aether
fn main() {
  io.println("Aether CLI demo")
  let a = io.args()
  for (s in a) {
    io.println("arg: " + s)
  }
  if (a.length > 0 && io.fileExists(a[0])) {
    io.println(io.readFileSync(a[0]))
  }
  io.println("now is " + io.now())
}
```

Under Node this opens the file given as the first argument, prints it, and prints the current ISO timestamp.  In the browser it prints the args (empty), skips the file branch (because `args() == []`), and still prints the timestamp.  The program degrades gracefully without a single conditional for "am I in a browser?" — `args`, `env`, `time`, and `now` already absorb the difference, and the Node-only `fileExists`/`readFileSync` panic only fires when actually called.
