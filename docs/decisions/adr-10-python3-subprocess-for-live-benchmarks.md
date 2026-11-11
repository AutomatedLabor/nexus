# ADR 10: python3 Subprocess for Live Benchmarks

Date: 2026-11-11
Status: Accepted

## Context

ATLAS's Benchmark Suite view has a "Run Benchmarks" button that
triggers a live measurement of the sandbox's compute profile. The
button POSTs to `/api/benchmarks/run`, which executes a small Python
program under `python3 -c '...'`, captures `time.perf_counter()`
deltas, persists each result as a `BenchmarkRun` row, and returns
the array to the frontend. The benchmarks themselves —
`csv_generate_1m`, `read_sort_1m`, `json_generate_10k`,
`sha256_10k`, `regex_match_1m`, `str_replace_1m`, `matmul_100x100`,
`fib_recursive_30`, `write_10k_files`, `read_delete_10k_files` —
are the exact same battery the Phase 0 env-cartography subagent ran
to produce `seed-data/benchmarks.json` (csv_generate_1m=291.832 ms,
sha256_10k=5.532 ms, fib_recursive_30=122.778 ms, etc.; see
`docs/environment/07-benchmarks.md`). Reusing the same Python
battery gives the dashboard a live number that is directly
comparable to the seeded baseline.

The constraints on the live-benchmark mechanism were four. First,
**isolation**: the benchmark must not interfere with the Next.js
server process; a runaway CPU loop in the same V8 isolate would stall
the dashboard. A subprocess isolates the workload. Second, **real
`perf_counter` timing**: the benchmark needs wall-clock timing
precise to microseconds; `time.perf_counter()` in Python is the
right tool, and `process.hrtime.bigint()` in Node is the equivalent —
but the Phase 0 baseline was in Python, so reusing Python keeps the
numbers directly comparable. Third, **language-agnostic**: future
benchmarks (a Node equivalent, a Bun equivalent) should be addable
without changing the runner architecture; spawning a subprocess by
interpreter name is the most general pattern. Fourth, **the sandbox
has Python 3.12.16** at `/home/z/.venv/bin/python3` (per
`docs/environment/03-software.md`), so `python3 -c '...'` resolves
to a real interpreter.

The forces against were the **Vercel serverless incompatibility**
(Vercel functions don't ship `python3` and can't spawn arbitrary
subprocesses — see ADR 07) and the ~30 s timeout that a
serverless function imposes. The 10-benchmark battery runs in
~1.52 s wall-clock on the 2-vCPU sandbox (per
`docs/environment/07-benchmarks.md`), so the timeout is not the
binding constraint; the absence of `python3` on Vercel is.

## Decision

Use **`python3` subprocess for live benchmarks** with a **30 s
hard timeout**. Specifically: the `POST /api/benchmarks/run` route
handler in `src/app/api/benchmarks/run/route.ts` accepts a JSON
body `{ benchmarks: string[] }` (Zod-validated against the
supported list: `csv_generate_1m`, `sha256_10k`, `fib_recursive_30`,
`matmul_100x100` — a curated subset of the Phase 0 battery, chosen
because each completes in well under the 30 s limit and exercises
a different cost tier: I/O, hashing, recursion, triple-loop compute).
The handler spawns `python3` with `-c '<inline script>'` via
Node's `child_process` (or `Bun.spawn`), pipes the result as JSON on
stdout, captures stderr, and imposes a 30 s hard kill if the
subprocess doesn't exit. Each `BenchmarkRun` row is persisted via
Prisma with the duration in ms, the benchmark name, the timestamp,
and the environment ID. The handler returns the array of `BenchmarkRun`
rows; the frontend's `useMutation` invalidates the
`["benchmarks"]` query so the Benchmarks view updates live. For
**Vercel serverless prod**, the handler is gated behind a
`RUNTIME_ENV` env var: in prod, it returns a 501 with a clear
"live benchmarks disabled in serverless; use the self-hosted Caddy
deploy or the seeded data" message (see ADR 07); the seeded
`BenchmarkRun` rows from `seed-data/benchmarks.json` are always
present so the dashboard is never empty.

## Alternatives Considered

- **In-process JS benchmarks** — run the same algorithms in
  V8/Node, time with `process.hrtime.bigint()`. Pros: no subprocess,
  works on Vercel serverless, faster startup. Cons: the numbers
  aren't directly comparable to the Phase 0 Python baseline (V8's
  JIT inlines loops differently; Node's `crypto` is C++-backed for
  SHA-256); a runaway loop in V8 stalls the dashboard's event loop
  with no isolation. Rejected for the comparability and isolation
  losses. A future v2 could add a "JS-mode" benchmark set alongside
  the Python set.
- **`Bun.spawn` of a Bun script** — Bun is faster at startup than
  Node's `child_process`, and `bun` is installed at 1.3.14. Cons:
  less portable (the same script run under Bun vs Node vs Python
  gives different perf numbers); the Phase 0 baseline was Python.
  Rejected as the primary; could be added as a second runner.
- **WASI / WASM benchmark module** — compile the benchmarks to WASM
  and run them in the Node process. Pros: portable, fast, isolated.
  Cons: requires a build step (compile C/Rust/AssemblyScript to
  WASM), the toolchain isn't installed (no `rustc`, no `clang`, no
  `wasi-sdk`), and the numbers would not be Python-comparable.
  Rejected for the toolchain cost.
- **External benchmark service** (e.g., call a /benchmark endpoint
  on a long-running worker). Pros: works in serverless. Cons:
  requires a separate always-on host, which the sandbox isn't.
  Rejected for v1; could be the v2 path (a Fly.io worker running
  `python3` and exposing an HTTP endpoint the Vercel-deployed
  dashboard calls).
- **No live benchmarks, seeded data only** — ship only the
  `seed-data/benchmarks.json` numbers. Pros: trivial, works
  everywhere. Cons: the dashboard loses its "test AND product"
  character — the live run is the proof the sandbox is real.
  Rejected.

## Consequences

**Positive.** Live benchmarks give the dashboard a real, reproducible
measurement that is directly comparable to the Phase 0 baseline —
the seeded `csv_generate_1m=291.832 ms` and the live
`csv_generate_1m` should be within a few percent on the same
hardware. The subprocess isolates the workload (a runaway loop in
the benchmark kills the subprocess, not the dashboard). The
`python3 -c` form keeps the benchmark script inline in the route
handler, so the benchmark definition lives next to the API. The 30
s timeout is generous (the full battery runs in ~1.52 s) but
guards against a stuck Python process. The Zod-validated input
restricts the runnable benchmarks to a curated list, preventing
arbitrary code execution.

**Negative.** **Won't work on Vercel serverless** — Vercel functions
don't ship `python3` and can't spawn arbitrary subprocesses. This is
the binding constraint and the reason for the `RUNTIME_ENV` gate. The
live-benchmark endpoint is **disabled in Vercel prod** and the
dashboard falls back to seeded data — a real loss of functionality
for the deployed product, mitigated only by the self-host Caddy
fallback (see ADR 07). **Subprocess startup overhead** — spawning
`python3` and importing `csv`/`hashlib`/`json`/`re` adds ~50–100 ms
before the first benchmark runs; the inline script amortizes this
across all benchmarks in the request, but a single-benchmark run
pays the full startup cost. **Security**: the `python3 -c '<inline
script>'` form must not interpolate user input — the handler
hardcodes the script and only accepts a Zod-validated list of
benchmark names, so there's no injection vector, but any future
"custom benchmark" feature would need a sandbox (e.g., a restricted
Python via `subprocess` with `--isolated` and a `seccomp` filter).
**Cold start**: the first benchmark run after server idle pays the
Python startup; subsequent runs are faster (the Python interpreter
is in the OS cache).

**Neutral.** The `python3` path is the same interpreter that
produced the seeded data, so the comparison is fair. The 30 s
timeout is a Vercel-constraints artifact, not a sandbox constraint
(the sandbox's `Bash` tool allows up to 600 s, and the benchmark
script itself runs in ~1.5 s). The curated subset
(`csv_generate_1m`, `sha256_10k`, `fib_recursive_30`,
`matmul_100x100`) is intentionally one benchmark per cost tier so
the dashboard shows four bars, not ten.
