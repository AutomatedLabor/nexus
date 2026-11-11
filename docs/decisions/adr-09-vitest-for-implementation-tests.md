# ADR-09 — Vitest for implementation tests

> Status: Accepted
> Date: 2023-09-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: none

## Context

Aether v1 is a TypeScript project. The compiler
(`aether/core/`), the stdlib (`aether/stdlib/`), and the
playground (Next.js app) are all TypeScript. The question
was: what test framework to use for the implementation
tests?

The options were:

1. **Jest.** The standard JavaScript test framework. Big,
   well-supported, lots of plugins. Slower than alternatives.
2. **Vitest.** A modern test framework built on Vite.
   Same API as Jest, faster, better ESM support, native
   TypeScript.
3. **Node's built-in `node:test` (Node 18+).** No
   dependency, no configuration, no fancy features. The
   bare-bones option.
4. **Bun's built-in `bun test`.** Bun is the project's
   package manager (see the README's `bun install`); its
   test runner is built-in and very fast.

The constraints on the decision were:

- **TypeScript native.** The tests are TypeScript; the
  framework should not require a compile step.
- **Fast.** The test suite has 700+ tests; a 10-second
  run is fine, a 60-second run is annoying.
- **ESM.** The project uses ESM (Next.js does, the
  playground does); the test framework should support ESM
  without configuration.
- **Watch mode.** Tests should re-run on file changes
  during development.
- **Familiar API.** The team knows Jest's `describe` /
  `it` / `expect` API. A framework that uses the same API
  is preferable.
- **Bun-friendly.** The project uses Bun for installs; a
  framework that works with Bun is preferable.

## Decision

**Aether v1 uses Vitest for implementation tests.** The
configuration is in `vitest.config.ts` at the project
root. The tests live next to the source (e.g.,
`aether/core/lexer/lexer.test.ts`), following the Vitest
convention.

The test suite is run with `bun test` (which uses Vitest
under the hood, since `vitest` is installed) or `npx
vitest` directly. The CI runs `bun test`.

## Alternatives considered

### Jest

Jest is the historical standard, but it has problems
with ESM (requires `--experimental-vm-modules` or a
transform), is slower than Vitest, and has a heavier
configuration. The team knows the Jest API; Vitest uses
the same API, so the migration was trivial. For a new
TypeScript project in 2023, Vitest is the better choice.

### Node's built-in `node:test`

`node:test` is the bare-bones option: no dependencies, no
configuration, no fancy features. It is fast and simple.
The downside: the API is not as polished as Vitest's (no
built-in `describe`/`it` nesting, no watch mode by
default, fewer matchers). For a project with 700+ tests
that is actively growing, the polish matters.

For a small project (under 50 tests), `node:test` would
be a fine choice. Aether v1 is past that point.

### Bun's built-in `bun test`

Bun's test runner is very fast (faster than Vitest) and
has a Jest-compatible API. The downside: it only works
with Bun, which means CI and any contributor who does not
use Bun cannot run the tests. The project uses Bun for
package management but does not require it for running
tests.

Vitest with Bun-as-test-runner is the best of both
worlds: same API, same tests, can be run with Bun (for
speed) or with `npx vitest` (for portability).

## Consequences

### Positive

- **Fast.** Vitest on Bun is sub-second for the 700-test
  suite. Watch mode is instant.
- **Familiar API.** The team knows Jest; Vitest uses the
  same `describe`/`it`/`expect` API. No learning curve.
- **TypeScript native.** No compile step; the tests are
  TypeScript, Vitest runs them as TypeScript.
- **ESM native.** No `--experimental-vm-modules` flag; ESM
  imports just work.
- **Watch mode.** `vitest --watch` re-runs on file changes,
  with sub-second feedback.
- **Good reporters.** Default reporter is clean; `vitest
  --ui` opens a browser-based UI for inspecting failures.
- **Coverage.** `vitest --coverage` produces a coverage
  report. The v2 plan is to enforce a coverage threshold.

### Negative

- **One more dependency.** Vitest is ~10 MB installed (with
  its Vite dependency). For a project that already has
  Next.js, React, Tailwind, Recharts, and shadcn/ui, this
  is a small addition.
- **Bun compatibility quirks.** Bun's test runner is
  mostly Vitest-compatible, but there are edge cases
  (e.g., some `vi.fn()` behaviors differ). The team runs
  `vitest` directly in CI to ensure compatibility.
- **Coverage tool is slow.** `vitest --coverage` is 2-3x
  slower than the bare test run. The team runs coverage
  on demand, not on every save.

## Mitigations

- The `vitest.config.ts` is minimal (~20 lines); it just
  sets the test pattern and the coverage configuration.
- The tests live next to the source, which makes them
  easy to find and easy to keep up to date.
- The CI runs `bun test` (which uses Vitest); a
  contributor without Bun can run `npx vitest` and get
  the same result.

## Reversibility

The decision is **easily reversible**. Vitest uses the
Jest API; switching to Jest would be a configuration
change, not a code change. Switching to `node:test` or
Bun's built-in would require some API adjustments (the
matchers are slightly different), but the test logic
would stay the same.

The team does not anticipate switching. Vitest is working
well.

## Cross-references

- [../decisions/adr-01-tree-walking-interpreter-for-v1.md](adr-01-tree-walking-interpreter-for-v1.md)
  — the tree-walker decision that drives the test count
  (each AST node kind needs tests).
- [../tutorials/testing.md](../tutorials/testing.md) §10
  — the implementation test suite, with run instructions.
- [../tutorials/tooling.md](../tutorials/tooling.md) §4
  — the test suite in the tooling tour.
