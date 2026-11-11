# 15 — Conformance & Tests

> **Status:** 🔒 Stable
> **Subsystem:** `aether/tools/test`, `tests/aether/`
> **Spec version:** 0.1

This section specifies the **conformance model** for Aether
implementations: what it means to be a conformant compiler, VM,
stdlib, and toolchain; how conformance is tested; and how
implementations may extend the language without breaking the
contract.

## 1. Conformance classes

Aether defines four conformance classes:

1. **Conformant compiler** — accepts every well-formed program,
   rejects every ill-formed program with the correct diagnostic
   code, and produces bytecode matching the spec's dynamic
   semantics.
2. **Conformant VM** — executes conformant compiler output with
   the observable behavior described in the spec.
3. **Conformant stdlib** — provides every documented item with
   the documented signature and semantics.
4. **Conformant toolchain** — provides every documented
   subcommand with the documented flags and exit codes.

An **implementation** is conformant iff it conforms in all four
classes. Implementations MAY be partially conformant (e.g. the
compiler may conform while a third-party stdlib does not); the
documentation of any implementation MUST state which classes it
conforms to.

## 2. Observable behavior

Aether programs have a well-defined **observable behavior**
consisting of:

1. **Output** written to `stdout` and `stderr` (in byte order,
   modulo buffering that the program flushes).
2. **Files** written or modified via `std::io`.
3. **Network** connections established via `std::net` (in 0.1:
   no `std::net`; deferred to 0.2).
4. **Host calls** to `extern "host"` functions, in order.
5. **Exit code** returned by `main`.
6. **Panics** that escape `main` (the panic payload's message
   and location).
7. **Finalization order** for `Drop` impls on values that
   outlive `main` (specified to be reverse declaration order
   per [§11 §4.1](./11-memory-and-gc.md#finalizer-order)).

Anything not in this list is **unobservable** for conformance
purposes. In particular:

- The exact order of GC collections.
- The exact layout of heap objects.
- The exact bytecode of a given program.
- The order of evaluation of subexpressions that have no
  observable side effect (the compiler may reorder these, see
  [§04 §16](./04-expressions.md#evaluation-order)).
- Wall-clock timing.
- Memory consumption (within the documented limits).

## 3. The conformance test suite

The Aether project ships a **conformance test suite** under
`tests/aether/`. The suite is the source of truth for "is this
implementation conformant?". It consists of:

### 3.1 `tests/aether/pass/`

Programs that MUST compile and run with the documented
observable behavior. Each test is a single `.ae` file plus an
`expected.stdout` and an `expected.exit`. The harness runs:

```
aether run <file>   > got.stdout 2> got.stderr
diff expected.stdout got.stdout
[ "$?" -eq expected.exit ]
```

A passing test matches both files exactly.

### 3.2 `tests/aether/parse-err/`

Programs that MUST fail to parse, with at least one diagnostic
whose code matches the expected code listed in `expected.codes`
(one code per line). The harness runs `aether check` and verifies
that the listed codes are present.

### 3.3 `tests/aether/type-err/`

Programs that MUST fail at sema or checker with the documented
codes. Same harness as `parse-err`.

### 3.4 `tests/aether/run-err/`

Programs that MUST compile, run, and panic with a documented
panic kind (e.g. `StackOverflow`, `HeapLimit`, `DivideByZero`,
`UnwrapNone`). The harness checks that the panic message
contains the expected substring.

### 3.5 `tests/aether/diagnostics/`

Programs that MUST compile, run, and emit specific diagnostics
to stderr (warnings, deprecations). The harness checks
`expected.stderr` for substring matches.

### 3.6 `tests/aether/snapshot/`

Programs whose output is large or non-deterministic-bytes but
should be stable across conformant implementations. Each test
has a snapshot file in `tests/snapshots/`; mismatches are
reviewed via `aether test --snapshot --review`.

### 3.7 `tests/aether/perf/` (informational)

Programs used by `aether bench` to measure performance.
Not part of conformance, but tracked to detect regressions.

## 4. Test harness

The harness is `aether test` (see [§13 §5](./13-tooling.md#aether-test))
with the conformance profile enabled:

```
aether test --conformance --junit conformance.xml
```

The conformance profile:

- runs every test in `tests/aether/`,
- treats `pass`, `parse-err`, `type-err`, `run-err`, and
  `diagnostics` failures as **hard failures** (exit 102),
- treats `snapshot` mismatches as **soft failures** (exit 102
  unless `--snapshot --review` was run in the last commit),
- writes a JUnit XML report at `--junit <path>` for CI
  integration,
- counts tests: total, passed, failed, skipped.

## 5. Coverage

Conformance requires *test* coverage, not *line* coverage:

- Every diagnostic code (`E0xxx`, `W1xxx`, etc.) documented in
  this spec MUST be exercised by at least one test.
- Every documented stdlib function MUST be exercised by at least
  one test that calls it.
- Every documented VM opcode MUST be exercised by at least one
  test that the compiler emits it for.

The `aether test --coverage` mode reports conformance coverage
and fails the build if it falls below 100%.

## 6. Snapshot policy

Snapshots are *the canonical output of conformant
implementations*. They are produced by the reference
implementation, reviewed by humans, and committed under
`tests/snapshots/`. A new implementation that wishes to be
certified as conformant MUST match every snapshot exactly.

Snapshots are versioned with the spec version; a snapshot for
`0.1` is invalid against a `0.2` implementation. The snapshot
tree contains a `version.txt` that declares the spec version
each snapshot was generated against.

## 7. Stability tiers

Implementations MAY extend Aether, but extensions must respect
the stability tiers:

| Tier | Items | Promise |
|---|---|---|
| **A** (locked) | documented `E`/`W` codes, documented stdlib signatures, documented opcodes (§10 §4) | Stable across minor versions; changes require major-version bump. |
| **B** (locked-with-caveats) | warning messages, diagnostic *wording*, error *recovery*, performance budgets | Stable in spirit; minor wording changes are OK. |
| **C** (implementation-defined) | exact GC pause times, exact bytecode, exact heap layout | Unspecified; changes between minor versions are expected. |

A conformant implementation MAY add extensions at tier **D**
(non-spec), but they MUST be opt-in (behind a flag, a feature,
or a `#![feature(...)]` attribute). A program that uses a tier-D
extension is *not* a conformant program.

## 8. Self-hosting status

In 0.1, the Aether compiler is *not* self-hosting: it is
implemented in the host language of the reference implementation.
A self-hosted Aether compiler is a goal for 1.0; the design of
the language in this spec is shaped to make that feasible, but
no part of 0.1's conformance model depends on self-hosting.

## 9. Versioning and evolution

The conformance model is itself versioned with the spec:

- A `0.1` conformant implementation passes the `0.1` conformance
  suite.
- The `0.1` suite is frozen at the moment `0.1` ships; further
  changes go into `0.2` (which adds tests but does not remove or
  modify `0.1` tests).
- An implementation that targets `0.1` MUST continue to pass the
  `0.1` suite, even after `0.2` is released.
- An implementation that targets `0.2` MUST pass both the `0.1`
  and `0.2` suites.

The conformance suite is the contract. Implementations that
disagree with the prose spec defer to the suite; suite bugs are
fixed via the ADR process (see
[`docs/decisions/`](../decisions/)).

## 10. Submitting conformance results

A third-party implementation that wishes to be listed as
conformant MUST:

1. Run the conformance suite and produce a JUnit XML report.
2. Submit the report, the implementation's `--version` output,
   and the spec version targeted.
3. Re-run on every minor spec release and submit a new report.

The Aether project maintains a public registry of conformant
implementations at `aether-lang.org/registry` (URL is
illustrative; the actual location is decided by the project).
