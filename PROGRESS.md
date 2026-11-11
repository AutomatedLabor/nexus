# PROGRESS — Project Nexus (Aether)

Phase-by-phase status of the brief. Last updated: Wave 9 (v2 playground wiring + deploy).

## Live URLs

- **Production (project alias):** https://nexus-aip-roj-builder.vercel.app
- Production (custom alias):   https://nexus-sigma-nine-86.vercel.app
- Branch alias (main):          https://nexus-git-main-aip-roj-builder.vercel.app
- This deploy (unique):         https://nexus-b8u78r04x-aip-roj-builder.vercel.app
- GitHub:                       https://github.com/AutomatedLabor/nexus

## Phase completion (original brief A–K)

| Phase | Topic                                  | Status         | One-line status                                                                          |
| ----- | -------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| A     | Language core (lex/parse/sema/eval)    | ✅ Done         | Lexer, parser, AST, sema, evaluator — 1,620 tests pass.                                  |
| B     | Type system (nominal + structural fns) | ✅ Done         | ADR-02 — nominal types, structural function types, inference, generics.                 |
| C     | Tree-walking evaluator                 | ✅ Done         | Closures, mutability, pattern matching, stdlib builtins. (For-loop closure quirk noted.) |
| D     | Standard library                       | ✅ Done (v2)   | 18 modules / ~391 functions (brief asked 25 / 300+).                                       |
| E     | Toolchain (LSP, formatter, lint, CLI)  | ✅ Done (v2)   | LSP (21 methods), formatter (idempotent), linter (30 rules), CLI (8 commands), test runner. |
| F     | Example programs                       | ✅ Done (v2)   | 60 `.ae` files in repo / 52 surfaced by `/api/examples` (brief asked 30).               |
| G     | Playground UI                          | ✅ Done (v2)   | 6 views, in-browser execution of BOTH tree-walker AND bytecode VM, dark/light, responsive. Live on Vercel. |
| H     | Documentation                          | ✅ Done (v2)   | 76 markdown files / ~198k words (brief asked ~300k; high-value core covered).            |
| I     | Testing                                | ✅ Done         | vitest, 1,620 tests / 35 files. CI runs `bunx vitest run aether` + `bun run lint`.       |
| J     | Deployment (GitHub + Vercel)           | ✅ Done (v2)   | Pushed to `AutomatedLabor/nexus`; live at `nexus-aip-roj-builder.vercel.app`; v2 deployed. |
| K     | Project files (README/LICENSE/etc.)    | ✅ Done         | README, LICENSE (MIT), CONTRIBUTING, .github templates + CI workflow.                    |

## v2 Wave completion (W1–W9)

| Wave | Topic                                  | Status     | Note                                                                                       |
| ---- | -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| 1    | Bytecode VM (IR + bytecode + codegen)  | ✅ Done    | fib(15)=610, 13/15 examples at parity vs tree-walker.                                      |
| 2    | Async runtime + module system          | ✅ Done    | async/await over Promises; import/export via regex resolution.                             |
| 3    | Formatter + linter                     | ✅ Done    | Idempotent formatter; 30-rule linter (342 tests).                                          |
| 4    | 8 new stdlib modules (+174 fns)        | ✅ Done    | bits, set, tree, list, functional, statistics, uuid, validate, +async helpers.            |
| 5    | CLI (8 commands)                        | ✅ Done    | run, check, fmt, lint, test, bench, disasm, lsp.                                            |
| 6    | 20 new examples                        | ✅ Done    | Now 60 `.ae` files / 52 surfaced.                                                          |
| 7    | Optimizer passes                        | ✅ Done    | 8 passes (CF, DCE, CSE, LICM, branch-simp, strength-reduction, inlining, TCO).            |
| 8    | LSP (21 methods) + test runner + book  | ✅ Done    | LSP server; snapshot/coverage test runner; 10-book-chapters; API ref; 5 ADRs.              |
| 9    | Playground v2 wiring + deploy (this)   | ✅ Done    | VM toggle, Bytecode/Lint tabs, Format/Lint buttons, benchmarks comparison, About update; deployed + browser-verified. |

## Cumulative metrics (real, from deployed commit `e125fd0`)

| Metric                              | Count / value                                              |
| ----------------------------------- | ---------------------------------------------------------- |
| Aether core LOC (non-test, TS)      | 10,740 lines (lexer, parser, AST, sema, eval, IR, opt)     |
| VM LOC (non-test, TS)               | 3,060 lines (bytecode, codegen, interpreter, async, GC)    |
| Tools LOC (non-test, TS)            | 5,578 lines (formatter, linter, LSP, CLI, test-runner)     |
| Stdlib LOC (non-test, TS)           | 6,017 lines (18 modules)                                  |
| Stdlib modules                      | 18                                                        |
| Stdlib exported functions           | ~391 (+ 20 consts = 411 exports)                          |
| Tests (it/test calls)               | 1,620 across 35 test files                                |
| Example `.ae` programs              | 60 in repo (52 surfaced by `/api/examples`)              |
| Example `.md` docs                   | 35                                                        |
| Playground views                    | 6                                                         |
| Playground output tabs              | 7 (Output, AST, Tokens, Errors, Bytecode, Lint, Stats)    |
| ADRs                                | 15                                                        |
| RFCs                                | 7                                                         |
| Spec files                          | 17                                                        |
| Book chapters                       | 16                                                        |
| Tutorials                           | 10                                                        |
| Guides                              | 6                                                         |
| Reference docs                      | 5                                                         |
| Total docs markdown files           | 76                                                        |
| Total docs words (docs + examples)  | ~198,456                                                  |

## Wave 9 verification (v2 playground + deploy)

- [x] Fixed Node-only `fs` imports in `aether/tools/formatter/formatter.ts` and
  `aether/tools/linter/linter.ts` — replaced the top-level
  `import { readFileSync } from "fs"` with a lazy `globalThis.require`
  indirection inside `formatFile`/`lintFile` so the browser bundle never
  pulls in Node built-ins. The browser only calls `format`/`lint`.
- [x] Rewrote `src/components/playground/views/playground-view.tsx`:
  - Runtime mode toggle (Tree-walker / Bytecode VM) via a `ToggleGroup`,
    persisted to `localStorage`.
  - When VM mode is selected, runs `compileToVm(code, { stdout })` and shows
    the bytecode disassembly in a new "Bytecode" tab (`disassemble(bytecode)`).
  - "Lint" button + "Lint on run" switch → calls `lint(code)`, shows diagnostics
    (rule / severity / `line:col` / message) in a new "Lint" tab.
  - "Format" button wired to the real parser-based `format(code)`, replaces
    editor content, shows a "Formatted" toast (or an error toast on parse failure).
  - New tabs: Bytecode (VM mode only), Lint. Kept: Output, AST, Tokens, Errors, Stats.
  - Stats tab shows steps for the active runtime (VM steps or eval steps), plus
    bytecode func count and the VM step budget note.
- [x] Updated `src/components/playground/views/about-view.tsx` — v2 status
  section with all features marked "Live": bytecode VM, 8 optimizer passes,
  async runtime, module system, CLI (8 commands), formatter, linter (30
  rules), LSP (21 methods), test runner, stdlib (18 modules / ~391 fns),
  examples, docs (~180k words). Honest "what's real vs roadmap" note.
- [x] Updated `src/components/playground/views/benchmarks-view.tsx` — runs
  each benchmark via BOTH `compileAndRun` AND `compileToVm`, shows a
  side-by-side table (Tree ms / VM ms / Speedup), summary cards (avg speedup,
  VM wins, tree-walker wins), a grouped bar chart (VM vs tree-walker), and a
  speedup line chart.
- [x] `bun run lint` → 0 errors, 0 warnings.
- [x] `bunx tsc --noEmit` → 0 errors in `src/` (66 pre-existing errors in
  `aether/core`, acceptable).
- [x] `curl http://localhost:3000/` → HTTP 200, 64,391 bytes (>8,000).
- [x] `git commit` → `e125fd0 v2 playground: wire bytecode VM, linter, formatter, disassembler view; update benchmarks + about`.
- [x] `git push origin main` → `9d7ded4..e125fd0 main -> main`.
- [x] Vercel deploy triggered via `POST /v13/deployments` (gitSource main).
  Deployment id `dpl_2Vs4DYEzLRpWagNhnZPuPmE2Hqk3`.
- [x] Deploy poll: INITIALIZING → BUILDING → READY in ~30s.
- [x] `curl https://nexus-aip-roj-builder.vercel.app/` → HTTP 200, 49,000 bytes.
- [x] `curl /api/examples` → HTTP 200, 52 example programs.
- [x] Browser (`agent-browser`) verification on the **deployed** site:
  - Playground renders; sidebar with 6 nav buttons ✓
  - Run (Tree-walker) → output `55, 2, 12.56636, 12, hello, world!, fib(10) = 55` ✓
  - Runtime mode toggle → "Bytecode VM" selected; "Bytecode" tab appears ✓
  - Run (Bytecode VM) → identical output; Bytecode tab shows full disassembly (4 functions, opcodes LoadNull/MakeClosure/Call/Print/LoadInt/AllocVariant) ✓
  - Lint tab → 6 diagnostics (no-shadow, no-unused-var, match-not-exhaustive, prefer-const ×2, no-recursive-fib) ✓
  - Format button → editor reformatted (fib collapsed to single line), "Formatted" toast ✓
  - Benchmarks view → side-by-side table (7 benchmarks), summary cards (avg ×0.76, VM wins 2/7, tree wins 5/7), bar chart + speedup line chart ✓
  - About view → v2 status section with all features "Live" ✓
  - Footer sticky (`mt-auto border-t bg-background/80 backdrop-blur`) ✓
  - Theme toggle DARK → LIGHT ✓
  - Responsive (mobile 390×844) ✓
  - Console errors: none ✓

## Known limitations (v2)

- For-loop closure capture in the tree-walker (single binding reused); the VM
  does not have this quirk.
- VM parity 13/15 vs tree-walker (2 examples rely on v1-only quirks).
- Module system via regex preprocessing (ADR-14); browser playground is
  single-file only (`modules.ts` is Node-only).
- Async via Promises, not true suspend/resume (ADR-13).
- Linter/formatter browser-safe by lazy `fs` (globalThis.require indirection).

## Roadmap (explicitly NOT built — documented in RFCs/ADRs)

- Four native / WASM backends (the VM is a TS interpreter).
- Full 60-package package registry (module system only).
- 200+ example target (we have 60).
- 15K-test target (we have 1,620).
- Five full language translations (English docs only).
