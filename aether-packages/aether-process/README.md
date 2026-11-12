# aether-process

> Process interface for Aether — 8 functions covering process introspection (`argv`, `env`, `exit`, `cwd`, `pid`, `spawn`) and timing (`sleep`, `time`, `now`), with host-bound functions delegated to host builtins via the `_host_process.ae` helper module.

Aether's stdlib `io` module ships `args()` (command-line arguments), `env(name)` (environment variables), `exit(code)` (terminate the process), `sleep(ms)` (synchronous sleep), and `now()` (wall clock). It does not ship `cwd`, `pid`, or `spawn` — and the names are short, generic, and easy to grab by accident in user code. `aether-process` is the user-space package that collects all eight under a single `import { ... } from "aether-process"`, re-exporting the host builtins under their natural names and providing clear stubs (with descriptive panic messages) for the operations the host doesn't ship.

The split between host-bound and stub functions is deliberate. The host-bound functions (`argv`, `env`, `exit`, `sleep`, `time`, `now`) delegate to the host builtins and work everywhere those builtins work — Node, Bun, deno; on browsers they return their browser-defaults (empty argv, empty env, throw on exit/sleep). The stub functions (`cwd`, `pid`, `spawn`) always panic; they document the gap and surface the limitation to the caller immediately, rather than silently returning wrong values.

## API

All 8 functions are `pub fn` declarations in `src/lib.ae`. The host-bound functions are not pure (they read the host's process state or terminate the process); the stub functions always panic.

### Process introspection

| Function | Signature | Description |
| --- | --- | --- |
| `argv()` | `() -> [string]` | Command-line arguments, minus the binary and script path. `[]` in browser. |
| `env(name)` | `(string) -> string` | Environment variable value, or `""` if unset. `""` in browser. |
| `exit(code)` | `(int) -> ()` | Terminate the process with exit code. Never returns. Throws on hosts without a process model. |
| `cwd()` | `() -> string` | Current working directory. Always panics in current build. |
| `pid()` | `() -> int` | Current process ID. Always panics in current build. |
| `spawn(cmd, args)` | `(string, [string]) -> int` | Spawn a child process. Always panics in current build. |

### Timing

| Function | Signature | Description |
| --- | --- | --- |
| `sleep(ms)` | `(int) -> ()` | Synchronously block for `ms` milliseconds. Throws on hosts without a process model. |
| `time()` | `() -> int` | Current Unix timestamp in ms. Always available. |
| `now()` | `() -> int` | Alias of `time()`. Both return the same wall-clock value. |

## How to use

### As a dependency

Add `aether-process` to your project's `aether.toml`:

```toml
[dependencies]
aether-process = "0.1.0"
```

Then in your Aether source:

```aether
import { argv, env, time, sleep, exit } from "aether-process";

print("args: " + argv());
print("HOME: " + env("HOME"));
print("now:  " + str(time()));

if len(argv()) > 0 && argv()[0] == "--help" {
  print("usage: ...");
  exit(0);
}

sleep(1000);   // pause 1s
print("waited 1s");
```

### Locally (without the registry)

```aether
import { time, now } from "./aether-packages/aether-process/src/lib.ae";

print(time());   // ms since epoch
print(now());    // alias of time()
```

### Running the test suite

```sh
aether test aether-packages/aether-process/tests
# PASS aether-packages/aether-process/tests/tests.ae
# 1 passed, 0 failed
```

The test file has 20+ `assert_eq` cases covering the safe-to-test functions (`argv`, `env`, `time`, `now`). The host-bound process-terminating functions (`exit`, `sleep`) and the always-panic stubs (`cwd`, `pid`, `spawn`) are documented in the README but not exercised — calling `exit` would terminate the test runner, calling `sleep` would stall it, and the stubs would abort on panic (Aether's `try_` builtin doesn't accept closures, so we can't catch the panic cleanly).

### Running the example

```sh
aether run aether-packages/aether-process/examples/example.ae
```

The example prints `argv()`, the length of common environment variables, and the current wall-clock time, then notes that the host-bound and stub functions are not exercised.

## Design notes

### Why is `exit` in the package if it can never be tested?

Because real programs need it. A CLI tool that finishes successfully calls `exit(0)`; one that hits a fatal error calls `exit(1)`. Without `exit` in the package, callers would have to reach for the bare `exit` builtin — which works but loses the package's documentation. The package's `exit` is a thin wrapper that delegates to the host builtin via the helper module; the wrapper is what makes the package's public surface complete, even though it can't be exercised in the test suite.

### Why are `cwd`, `pid`, `spawn` stubs?

The host's stdlib `io` module ships `args`, `env`, `exit`, `sleep`, `now` but not `cwd`, `pid`, or `spawn`. Adding them would require new host builtins (`process.cwd()`, `process.pid`, `child_process.spawn`) and corresponding runtime changes. For v3, the package documents the gap explicitly and panics with a clear message; a future `aether-process-extra` may wire the host calls.

### Why does `_host_process.ae` exist?

For the same reason `aether-datetime`'s `_host_clock.ae` exists: to capture same-named host builtins (`exit`, `sleep`, `now`) before the package's own declarations shadow them. The pattern is:

```aether
// _host_process.ae
pub const HOST_EXIT = exit;
pub const HOST_SLEEP = sleep;
pub const HOST_NOW = now;
```

```aether
// lib.ae
import { HOST_EXIT, HOST_SLEEP, HOST_NOW } from "./_host_process.ae";
pub fn exit(code: int) -> () { HOST_EXIT(code) }
pub fn sleep(ms: int) -> () { HOST_SLEEP(ms) }
pub fn time() -> int { HOST_NOW() }
pub fn now() -> int { HOST_NOW() }
```

Without the helper module, `pub fn exit(code: int) -> () { exit(code) }` would be infinite recursion.

### Why are `time` and `now` aliases?

The host ships `now()` (the datetime version, returning ms) but its `time` builtin is the 3-argument `time(h, m, s)` (which builds a timestamp for that clock time today). That builtin is overridden in the stdlib registration order, so calling `time()` with zero arguments throws `"time: expected integer, got undefined"`. The package's `time()` delegates to the wall-clock `now` builtin instead, and `now()` is an alias for the same call. This way both `time()` and `now()` work as wall clocks, matching the conventional Unix `time()` system call's semantics.

### Why doesn't the package expose `args()` and `env(name)` directly?

The package's `argv()` delegates to the host's `args()` builtin (renamed for clarity — `argv` is the conventional Unix name, `args` is generic). The package's `env(name)` is a thin wrapper around the host's `env(name)` builtin — same name, same semantics. Both are exposed under their natural names from the package's namespace, so callers don't have to know which builtins the stdlib ships.

## Implementation patterns

### Pattern 1: const-capture of same-named builtins

The `_host_process.ae` / `lib.ae` pattern (see "Why does `_host_process.ae` exist?" above) is the canonical way to wrap same-named host builtins. The same pattern is used by `aether-datetime` for `now`/`today` and `aether-fs` for `readFileSync`/`writeFileSync`/`fileExists`.

### Pattern 2: stub-with-clear-panic for missing builtins

`cwd`, `pid`, and `spawn` have no corresponding host builtins. Rather than return wrong values (e.g., `""` for `cwd`), the package panics with a descriptive message. This forces callers to handle the gap explicitly — they can't accidentally depend on a silent fallback that would produce wrong results on a different host.

### Pattern 3: aliases for renamed operations

`time()` and `now()` both return the same wall-clock value because the conventional Unix `time()` system call and the more modern `now()` naming both make sense. The package exposes both as aliases — caller preference wins. Same for `argv()` vs. `args()` (we chose `argv` as the more conventional name).

## Future work

- **Wire `cwd`, `pid`, `spawn` to host calls.** A future `aether-process-extra` could delegate to `process.cwd()`, `process.pid`, and `child_process.spawn` in Node; equivalent builtins would need to be added to the runtime for browser contexts.
- **Async `spawn`.** A `spawnAsync(cmd, args)` that returns a Future, with stdout/stderr pipes. Needs the v3 async coroutines.
- **Signal handling.** `onSignal(sig, fn)` to register a handler. Host-bound; only works on hosts with a process model.
- **Resource limits.** `rss()`, `heapUsed()`, `cpuTime()` for introspection. Useful for benchmarking.

## License

MIT — same as the Aether language.
