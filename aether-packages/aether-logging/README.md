# aether-logging

> Structured logging for Aether — 10 functions covering logger construction (`new`, `silent`, `verbose`), level-filtered emission (`log`, `debug`, `info`, `warn`, `error`), context enrichment (`withContext`), and introspection (`format`).

Aether's stdlib `io` module ships `print(s)` and `println(s)` but no leveled logger, no context propagation, and no level filter. Programs that need real logging — servers, daemons, CLI tools — end up reinventing the same patterns: an `INFO`/`WARN`/`ERROR` enum, a level filter, a context map, a structured emitter. `aether-logging` is the user-space package that ships those patterns under one import.

The package is pure Aether — no host calls, no I/O beyond the existing `print` builtin. Every function returns a value (a `Logger` struct or a formatted string); the only side effect is `print`, which is called when a message passes the logger's level filter. This makes the package trivially testable and portable across every Aether runtime (tree-walker, VM, WASM, x86).

## Logger struct

```aether
struct KV { key: string, value: string }
struct Logger {
  level: int,    // 0=silent, 10=error, 20=warn, 30=info, 40=debug, 50=trace
  context: [KV]  // accumulated key/value pairs from withContext calls
}
```

A `Logger` is immutable. `withContext` returns a *new* `Logger` with the additional context pair appended; the original is unchanged. This makes loggers safe to share across coroutines without coordination.

## Level semantics

A message is emitted iff `msg.level <= logger.level`. So:

| Logger level | Emits TRACE | Emits DEBUG | Emits INFO | Emits WARN | Emits ERROR |
| --- | --- | --- | --- | --- | --- |
| `LEVEL_SILENT = 0` | no | no | no | no | no |
| `LEVEL_ERROR = 10` | no | no | no | no | yes |
| `LEVEL_WARN = 20` | no | no | no | yes | yes |
| `LEVEL_INFO = 30` | no | no | yes | yes | yes |
| `LEVEL_DEBUG = 40` | no | yes | yes | yes | yes |
| `LEVEL_TRACE = 50` | yes | yes | yes | yes | yes |

The convention is the same as Python's `logging` and Rust's `log`: a higher logger level means *more verbose*. `silent()` returns a logger at level 0 (emits nothing); `verbose()` returns a logger at level 50 (emits everything).

## API

All 10 functions are `pub fn` declarations in `src/lib.ae`. Six `pub const` level constants are also exported.

### Logger construction

| Function | Signature | Description |
| --- | --- | --- |
| `new(level)` | `(int) -> Logger` | Create a logger with the given level (an `int`). |
| `silent()` | `() -> Logger` | Create a logger that emits nothing (level `0`). |
| `verbose()` | `() -> Logger` | Create a logger that emits everything (level `50`, trace). |

### Level-filtered emission

| Function | Signature | Description |
| --- | --- | --- |
| `log(logger, level, msg)` | `(Logger, int, string) -> Logger` | Emit `msg` at `level` iff `level <= logger.level`. Returns the logger (unchanged) for chaining. |
| `debug(logger, msg)` | `(Logger, string) -> Logger` | Convenience: `log(logger, LEVEL_DEBUG, msg)`. |
| `info(logger, msg)` | `(Logger, string) -> Logger` | Convenience: `log(logger, LEVEL_INFO, msg)`. |
| `warn(logger, msg)` | `(Logger, string) -> Logger` | Convenience: `log(logger, LEVEL_WARN, msg)`. |
| `error(logger, msg)` | `(Logger, string) -> Logger` | Convenience: `log(logger, LEVEL_ERROR, msg)`. |

### Context enrichment

| Function | Signature | Description |
| --- | --- | --- |
| `withContext(logger, key, value)` | `(Logger, string, string) -> Logger` | Return a new logger with `(key, value)` appended to its context. |

### Introspection

| Function | Signature | Description |
| --- | --- | --- |
| `format(logger)` | `(Logger) -> string` | Render the logger's configuration as `"Logger(level=INFO, context=[user=alice])"`. |

### Level constants

| Constant | Value | Description |
| --- | --- | --- |
| `LEVEL_SILENT` | `0` | Emit nothing. |
| `LEVEL_ERROR` | `10` | Emit only ERROR. |
| `LEVEL_WARN` | `20` | Emit WARN and ERROR. |
| `LEVEL_INFO` | `30` | Emit INFO, WARN, ERROR. |
| `LEVEL_DEBUG` | `40` | Emit DEBUG, INFO, WARN, ERROR. |
| `LEVEL_TRACE` | `50` | Emit everything. |

## How to use

### As a dependency

Add `aether-logging` to your project's `aether.toml`:

```toml
[dependencies]
aether-logging = "0.1.0"
```

Then in your Aether source:

```aether
import {
  new, info, warn, error, withContext, LEVEL_INFO,
} from "aether-logging";

let base = new(LEVEL_INFO);
let log = withContext(base, "service", "api");

info(log, "starting up");
warn(log, "config file not found, using defaults");
error(log, "failed to bind on port 80");

let req_log = withContext(log, "request_id", "abc123");
info(req_log, "request received");
info(req_log, "request served");
```

Output:

```
[INFO] starting up service=api
[WARN] config file not found, using defaults service=api
[ERROR] failed to bind on port 80 service=api
[INFO] request received service=api request_id=abc123
[INFO] request served service=api request_id=abc123
```

### Locally (without the registry)

```aether
import { silent, verbose, info, error, format } from "./aether-packages/aether-logging/src/lib.ae";

let l = silent();
info(l, "this won't print");

let v = verbose();
info(v, "this will print");

print(format(v));   // Logger(level=TRACE, context=[])
```

### Running the test suite

```sh
aether test aether-packages/aether-logging/tests
# PASS aether-packages/aether-logging/tests/tests.ae
# 1 passed, 0 failed
```

The test file has 20+ `assert_eq` cases covering every `pub fn`, plus struct-equality assertions on the `Logger` and `KV` types. The emission functions are tested by observing their `print` output via the module loader's `stdout` capture.

### Running the example

```sh
aether run aether-packages/aether-logging/examples/example.ae
```

The example exercises silent, verbose, and info loggers; demonstrates `withContext` chaining; and prints `format(logger)` for several configurations.

## Design notes

### Why is the logger immutable?

Each `withContext` call returns a *new* `Logger` with the extra context appended; the original is unchanged. This makes loggers safe to share across coroutines (the v3 async runtime) without locks: if coroutine A has `log1` and coroutine B does `withContext(log1, ...)`, coroutine A's `log1` is unaffected. This is the same pattern Rust's `tracing` library uses with its `Span` type.

The cost is a small allocation per `withContext` call (a new `context` array with all the old entries plus one new entry). For most programs this is fine; if you're logging in a tight loop with thousands of contexts, you'd hoist the `withContext` call out of the loop.

### Why are levels integers and not strings?

Integers make the level filter (`if level <= logger.level`) a single integer comparison. Strings would need a `level_from_name` call at every emission, or a lookup table. The `level_name` helper exists for formatting only.

### Why does `log()` return the logger?

For chaining:

```aether
let log = withContext(new(LEVEL_INFO), "user", "alice");
info(log, "hello");
warn(log, "warning");
```

vs.

```aether
let log = new(LEVEL_INFO);
warn(info(withContext(log, "user", "alice"), "hello"), "warning");
```

The first form is more readable. Both work; the second uses the return value of `info()` to thread the logger through. Returning the logger is a tiny convenience that costs nothing.

### Why is the context a `[KV]` array and not a `map<string, string>`?

Mostly for simplicity. A list of key/value pairs preserves insertion order (which matters for log readability — `user=alice request=GET` reads differently from `request=GET user=alice`). A map would lose the order. A list also makes `withContext` O(1) (append) vs. a map's O(log n) insertion. The cost is O(n) lookup, but loggers don't typically look up context entries — they just iterate to format.

### Why is `print` the only side effect?

To keep the package portable. If we wrote to a file, we'd need `aether-fs`; if we wrote to a network socket, we'd need a socket API. By using `print`, the package works on every Aether runtime — tree-walker, VM, WASM, x86 — without modification. Programs that need to redirect logs to a file or network can override the `print` builtin in the runtime, or wrap `aether-logging` in their own package that calls `writeFile`/`send` instead of `print`.

### Why are levels 0/10/20/30/40/50 and not 0/1/2/3/4/5?

Decades give room to add levels in between (e.g., `LEVEL_FATAL = 5` below ERROR, `LEVEL_NOTICE = 25` between INFO and WARN) without renumbering. The convention is borrowed from Python's `logging` module and syslog's `severity` codes.

## Implementation patterns

### Pattern 1: immutable struct + copy-on-write

`withContext` doesn't mutate `logger.context`; it builds a *new* array with all the old entries plus one new entry, and returns a new `Logger` with the new array. The pattern:

```aether
pub fn withContext(logger: Logger, key: string, value: string) -> Logger {
  let mut newCtx = [];
  let mut i = 0;
  while i < len(logger.context) {
    push(newCtx, logger.context[i]);
    i = i + 1;
  }
  push(newCtx, KV { key: key, value: value });
  Logger { level: logger.level, context: newCtx }
}
```

is the standard "copy then append" pattern. The cost is O(n) per call, where n is the context length; for typical n (1-5), it's negligible.

### Pattern 2: level filter as a single integer comparison

```aether
pub fn log(logger: Logger, level: int, msg: string) -> Logger {
  if level <= logger.level {
    let ctx = format_context(logger.context);
    print("[" + level_name(level) + "] " + msg + ctx);
  };
  logger
}
```

The filter is `if level <= logger.level`. One comparison; no function calls; no lookup. The `level_name(level)` call only happens when the filter passes, so the hot path (filtering) is cheap.

### Pattern 3: level constants exported, not magic numbers

`LEVEL_INFO` is exported as a `pub const`. Callers write `new(LEVEL_INFO)`, not `new(30)`. This makes the code self-documenting and refactoring-safe (if we renumber levels, only the constants change).

## Future work

- **Async logger.** A variant that batches messages and flushes on a timer, for high-throughput logging. Needs the v3 async coroutines.
- **Structured output.** A `formatJSON(logger)` that emits `{"level": "INFO", "msg": "...", "context": {...}}` for log aggregators. Trivial to add (call `aether-json`).
- **Multiple sinks.** A `withSink(logger, sink)` that lets callers route messages to a file, a network socket, or a custom function. Currently, all output goes to `print`.
- **Hierarchical loggers.** A `withName(logger, name)` that prefixes the logger name to every message (`"[api] [INFO] ..."`). Useful for large applications with sub-components.
- **Rate limiting.** A `withRateLimit(logger, per_second)` that drops messages above a rate. Useful for noisy subsystems.

## License

MIT — same as the Aether language.
