# Project Nexus — v3 PROMPT (The Self-Hosted, Native, Formally-Verified Aether)

> v1 built a tree-walking interpreter. v2 added a bytecode VM + toolchain.
> v3 makes both look like a warmup: self-hosting compiler, native codegen
> (WASM + x86-64 + ARM64 + RISC-V), full trait system + borrow checker,
> real async coroutines in the VM, a JIT, a package registry with 200+
> packages written IN Aether, 5 compiler ports, formal verification,
> 50,000 tests, 1,500 examples, 1.5M+ doc words, an AI code assistant,
> and a real IDE — all running live.

Repository: https://github.com/AutomatedLabor/nexus (push continuously)
Deploy: Vercel (project linked, project id `prj_Lm4i6O1xs42HG9c9koMserbzNlNj`)
Auth: GitHub PAT and Vercel token are provided in the chat context
      (do NOT paste them into committed files — GitHub Push Protection blocks them).

═══════════════════════════════════════════════════════════════════
THE NON-NEGOTIABLE PROCESSING PROTOCOL (proven across v1 + v2)
═══════════════════════════════════════════════════════════════════

1. Main session = orchestrator ONLY. Never writes large files directly.
2. Dispatch 2-3 parallel subagents per batch (sweet spot; >3 overloads backend).
3. Each subagent prompt is FULLY self-contained: exact paths, exact structures,
   reference data embedded, verification protocol specified.
4. After each batch: dispatch a verify subagent to read ACTUAL files, run tests,
   browser-check. NEVER trust subagent self-reports (they garble under load).
5. Git commit + push after EVERY batch (every 1-2 minutes wall time).
   The sandbox can die any second — push or lose work.
6. Update TodoWrite after every batch with restart-from-scratch-specific entries.
7. Update build-learnings.md with any new lesson discovered.
8. Update PROGRESS.md with cumulative metrics after every wave.
9. If main-session tools fail: switch to subagent-only execution (proven recovery).
10. If a subagent produces wrong output: redispatch with corrected prompt,
    never fix in main session.

For EVERY source file: ALSO create a test file (15+ cases), a doc file
(500+ words with examples), and a benchmark where applicable. 3x multiplier.

═══════════════════════════════════════════════════════════════════
v3 STARTING STATE (from v2 — all verified working + live)
═══════════════════════════════════════════════════════════════════

- 100 Aether TS files, 40,329 LOC, 1,964 passing tests.
- v1 tree-walker + v2 bytecode VM (both working, browser-verified).
  `compileToVm(fib 15)` = 610. VM is 1.88× faster than tree-walker on sum-50k.
- Stdlib: 24 modules, 510 functions.
- 72 examples, all run via compileAndRun.
- Tools: CLI (8 cmds), formatter (idempotent on 72 examples, 220 tests),
  linter (30 rules, 122 tests), LSP (21 methods, 95 tests),
  test runner (snapshot+coverage, 55 tests), 8 optimizer passes.
- Async runtime, module system (regex-preprocessed imports).
- Docs: 77 files, ~187K words, 16 book chapters, 15 ADRs, 7 RFCs.
- Playground live at https://nexus-aip-roj-builder.vercel.app with
  VM toggle, bytecode tab, lint, format, benchmarks.

═══════════════════════════════════════════════════════════════════
WAVE 1: SELF-HOSTING BOOTSTRAP — THE CANONICAL "REAL LANGUAGE" MILESTONE
═══════════════════════════════════════════════════════════════════

The single most important v3 deliverable: rewrite the Aether compiler IN
Aether. The bootstrap. After this, Aether is a "real" language.

Batch 1 (3 parallel subagents):
- aether-bootstrap/lexer.ae — Aether lexer written in Aether (~600 lines).
  Tokenizes the full Aether grammar. Tests: 100 cases (.ae programs that
  lex Aether source and assertEq token streams). Docs: 1500 words.
- aether-bootstrap/parser.ae — Aether parser written in Aether (~1200 lines).
  Recursive descent + Pratt. Produces AST (as Aether structs/enums).
  Tests: 200 cases (parse Aether source, assert AST shape). Docs: 2000 words.
- aether-bootstrap/ast.ae — AST node definitions + printer + visitor
  written in Aether (~500 lines). Tests: 100. Docs: 1000 words.

Batch 2 (3 parallel subagents):
- aether-bootstrap/sema.ae — name resolution + type checker in Aether
  (~1500 lines). Tests: 300. Docs: 2500 words.
- aether-bootstrap/ir.ae — IR + lowerToIr in Aether (~800 lines).
  Tests: 150. Docs: 1500 words.
- aether-bootstrap/codegen.ae — IR → bytecode compiler in Aether
  (~700 lines). Tests: 150. Docs: 1500 words.

Batch 3 (2 parallel subagents):
- aether-bootstrap/vm.ae — the bytecode VM written in Aether
  (~1200 lines). Tests: 300. Docs: 2500 words.
- aether-bootstrap/main.ae — the bootstrap driver: reads .ae, lexes,
  parses, checks, lowers, compiles, runs — ALL in Aether.
  Tests: 50 end-to-end (compile+run each of the 72 existing examples
  via the bootstrap compiler, assert output matches the TS compiler).

VERIFY BATCH: compile the bootstrap compiler with the TS compiler,
then use the bootstrap to compile+run all 72 examples. Output must match
the TS compiler exactly. This is the bootstrap milestone.

WAVE 1 TOTAL: 8 subagent dispatches. ~25K LOC of Aether.

═══════════════════════════════════════════════════════════════════
WAVE 2: NATIVE CODEGEN BACKENDS — WASM + x86-64 + ARM64 + RISC-V
═══════════════════════════════════════════════════════════════════

The IR → real machine code. The playground runs Aether at native speed.

Batch 4 (3 parallel subagents):
- aether/vm/wasm/ — IR → WebAssembly text + binary. The playground
  compiles Aether to WASM and runs it at near-native speed. Tests: 300
  (compile each of 50 programs to WASM, run in Node's WASM runtime,
  verify output). Docs: 4000 words.
- aether/vm/x86/ — IR → x86-64 assembly + ELF object emission.
  Assemble with `nasm`/`gas`, link with system `ld`, execute. Tests: 200
  (compile 30 programs, run, verify). Docs: 5000 words.
- aether/vm/arm64/ — IR → AArch64 assembly. Cross-compile, run under
  `qemu-aarch64` if available. Tests: 150. Docs: 4000 words.

Batch 5 (2 parallel subagents):
- aether/vm/riscv/ — IR → RISC-V assembly. Tests: 150. Docs: 3000 words.
- aether/vm/codegen-shared/ — instruction selection, register allocation
  (linear scan + graph coloring), calling conventions (System V AMD64,
  AAPCS64, RISC-V E), ABI. Shared across all backends. Tests: 200.
  Docs: 4000 words.

VERIFY BATCH: compile 20 programs through EACH backend, verify output
matches the tree-walker + VM exactly. Performance comparison: VM vs WASM
vs native. Write to docs/reference/native-perf.md.

WAVE 2 TOTAL: 7 subagent dispatches. ~35K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 3: TRAIT SYSTEM + BORROW CHECKER — THE "REAL LANGUAGE" FEATURES
═══════════════════════════════════════════════════════════════════

RFC-004 borrow checker + a full Rust-like trait system with coherence,
associated types, default impls. This is what makes Aether a "serious"
typed language, not a teaching toy.

Batch 6 (3 parallel subagents):
- aether/core/traits/ — trait declarations, impls, coherence checking,
  associated types, default methods, super-traits, object safety (dyn Trait),
  #[derive] automation. Tests: 400. Docs: 5000 words.
- aether/core/borrow/ — ownership, borrowing rules, lifetime annotations,
  the borrow checker (a real one — tracks moves, borrows, lifetimes),
  NLL (non-lexical lifetimes) basic, drop semantics. Tests: 350. Docs: 5000.
- aether/core/monomorph/ — generic instantiation, monomorphization,
  vtables for dyn Trait, static vs dynamic dispatch. Tests: 200. Docs: 2500.

Batch 7 (2 parallel subagents):
- Update parser/sema to support the new syntax: `trait Ord<T> { fn cmp(self, other: T) -> int; }`, `impl Ord<int> { ... }`, `&T`, `&mut T`, `'a` lifetimes, `move x`, `Box<T>`. Tests: 250 parser, 250 sema. Docs: 2000.
- Update stdlib to use traits (Ord, Eq, Hash, Show, Default, Clone, Iterator). Tests: 200. Docs: 2000.

VERIFY BATCH: compile+run all 72 examples through the new trait-aware
compiler. Add 20 new examples using traits + borrowing. Verify they
run on tree-walker + VM + WASM.

WAVE 3 TOTAL: 7 dispatches. ~30K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 4: REAL ASYNC COROUTINES IN THE VM (suspend/resume)
═══════════════════════════════════════════════════════════════════

v2's async was JS Promises (no real suspend/resume). v3 makes the VM
itself suspendable: the `await` opcode saves the frame to a heap snapshot
and the scheduler resumes it later. Real coroutines.

Batch 8 (3 parallel subagents):
- aether/vm/coroutine/ — suspend/resume machinery. The VM frame is
  serializable; `await` snapshots it; the scheduler resumes. Tests: 300.
  Docs: 4000 words.
- aether/vm/scheduler/ — work-stealing scheduler, executor, task queue,
  structured concurrency (spawn/join/cancel/timeout), backpressure.
  Tests: 250. Docs: 3000 words.
- aether/vm/io-async/ — non-blocking I/O integration (file, network via
  libuv-style hooks), select(), polling. Tests: 200. Docs: 2500 words.

Batch 9 (2 parallel subagents):
- aether/stdlib/async-v2/ — Future, Stream, Channel (multi-producer
  multi-consumer), Sink, select!, join!, try_join!. Tests: 300. Docs: 3000.
- aether/examples/async/ — 25 async example programs (echo server, file
  watcher, pipeline, chat, rate limiter). Each verified running. Docs: 2000.

WAVE 4 TOTAL: 7 dispatches. ~25K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 5: TIERED JIT COMPILER (profile-guided)
═══════════════════════════════════════════════════════════════════

Tier 1: tree-walker (slow, no warmup). Tier 2: bytecode VM (medium).
Tier 3: JIT — profile hot loops, type-specialize, compile to native (x86)
in-memory, execute. With deoptimization.

Batch 10 (3 parallel subagents):
- aether/vm/jit/profiler/ — hot-loop detection, call-frequency tracking,
  type profiling (int/float/string/struct shapes seen at each site).
  Tests: 150. Docs: 2500.
- aether/vm/jit/x86-jit/ — emit x86-64 machine code into a JIT buffer
  (use a tiny x86 encoder; mmap executable). Compile hot loops. Tests:
  200 (compile 20 hot loops, run, verify output matches VM). Docs: 4000.
- aether/vm/jit/deopt/ — deoptimization (bail back to VM when the JIT'd
  code's type assumptions break). Tests: 150. Docs: 2500.

Batch 11 (2 parallel subagents):
- aether/vm/jit/inliner/ — profile-guided inlining at JIT time. Tests:
  150. Docs: 2000.
- aether/vm/jit/gc-integration/ — the JIT'd code must cooperate with the
  GC (write barriers, safepoints). Tests: 100. Docs: 2000.

VERIFY BATCH: benchmarks — tree-walker vs VM vs JIT. fib(35), sum 1M,
matrix 100x100. Target: JIT within 2× of hand-written C. Write to
docs/reference/jit-perf.md.

WAVE 5 TOTAL: 7 dispatches. ~20K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 6: PACKAGE REGISTRY + 200 PACKAGES WRITTEN IN AETHER
═══════════════════════════════════════════════════════════════════

A real package registry: server (HTTP API) + client (the `aether pkg` CLI).
200 packages written IN Aether, each with source + tests + README + aether.toml.

Batch 12 (2 parallel subagents):
- aether/tools/pkg/ — package manager: manifest (aether.toml), semver
  resolution, lockfile, registry HTTP client, local cache, dependency
  graph, conflict resolution, vulnerability scan, publish/install/update.
  Tests: 300. Docs: 4000 words.
- aether/registry/server.ts — a real HTTP registry server (Next.js API
  route or standalone). Endpoints: publish, fetch, search, versions,
  auth. Storage: SQLite via Prisma. Tests: 200. Docs: 3000.

Batch 13-22 (10 batches × 3 parallel subagents = 30 dispatches):
Build 200 Aether packages, 3 packages per subagent (so ~20 packages per
batch). Each package: 200-1000 lines of Aether, full tests, README 5K
words, aether.toml, examples, CHANGELOG. Categories:

WEB (40 packages): http-client, http-server, websocket, rest-framework,
  graphql-server, grpc, smtp, dns, url, cookie, session, cors, rate-limit,
  middleware, router, openapi, json-rpc, sse, webhook, jwt-auth, oauth2,
  csrf, helmet, helmet-extra, compression, multipart, static-files,
  templating, sitemap, robots, basic-auth, digest-auth, auth-passport,
  i18n, cache, cdn-client, form-parser, querystring, fetch-polyfill,
  server-send, websocket-extra.
DATA (35): json-schema, csv-toolkit, sqlite-driver, postgres-driver,
  redis-client, s3-client, mongo-client, elasticsearch, mysql-driver,
  cache-layer, event-store, orm, migration, seed, repository, query-builder,
  paginator, fulltext-search, b-tree, lsm-tree, wal, replication, etcd-client,
  dynamodb, firestore, supabase, prisma-extra, sql-builder, kv-store,
  timeseries, columnar, olap, etl, dataframes.
CLI (30): arg-parser, table-renderer, progress-ui, color-output,
  prompt-ui, file-watcher, task-runner, config-manager, log-fmt, spinner,
  help-gen, completion, shell-complete, glob, walkdir, diff-cli, grep,
  find, tree-cli, less, more, tail, head, xargs, tee, parallel, cron-cli,
  env-manager, dotfile, dotenv.
ALGORITHMS (30): graph-algorithms, sorting-suite, compression, encoding,
  numeric, string-algos, crypto-suite, random-engine, geometry, linear-algebra,
  fft, bignum, rational, interval, optimization, sat-solver, constraint,
  linear-programming, simplex, branch-and-bound, genetic-algo, simulated-anneal,
  gradient-descent, backprop, clustering, regression, classification, neural-net,
  decision-tree, kmeans.
AUTH (20): jwt-lib, oauth2-lib, password-hashing, rate-limiter, validator,
  session, api-auth, cors-handler, bcrypt, argon2, scrypt, totp, webauthn,
  saml, openid, passkey, captcha, audit-log, permissions, rbac.
GAME (15): sprite-engine, tilemap, physics-2d, audio-mixer, input-handler,
  particle, animation, scene-graph, ecs, collision, pathfinding, ai-behavior,
  dialogue, save-state, replay.
DEV (15): logger, profiler, tracer, metrics, feature-flags, migration-tool,
  seed-faker, mock-server, test-faker, fixture-lib, snapshot-lib, fuzz-lib,
  bench-lib, debug-lib, sourcemap.
MISC (15): state-machine, workflow, job-queue, cron-scheduler, template-engine,
  markdown-parser, diff-tool, backup, sync, retry, circuit-breaker,
  bulkhead, ratelimit-token, ratelimit-leaky, hedged-request.

Each batch: verify subagent installs + tests the 20 packages, reports pass rate.

WAVE 6 TOTAL: 32 dispatches. ~150K LOC of Aether packages.

═══════════════════════════════════════════════════════════════════
WAVE 7: FORMAL VERIFICATION + VERIFIED COMPILER
═══════════════════════════════════════════════════════════════════

CompCert-style verified compiler. Operational semantics, type-safety proofs,
a verified bytecode verifier.

Batch 23 (3 parallel subagents):
- docs/formal/operational-semantics.md (30K words) — small-step + big-step
  semantics for EVERY Aether construct, in inference-rule notation.
- docs/formal/type-safety.md (20K words) — progress + preservation proofs
  for the type system, with the borrow checker's safety argument.
- docs/formal/bytecode-verifier.md (15K words) — a formal spec of the
  bytecode verifier + a Coq/Lean-style proof outline that verified
  bytecode = type-safe execution.

Batch 24 (2 parallel subagents):
- aether/vm/verifier/ — a REAL verified bytecode verifier (in TS),
  proving type safety + stack discipline + memory safety of every
  bytecode module before execution. Tests: 300 (well-formed + malformed).
- docs/formal/proofs/ — 10 proof outlines (mechanized-verification
  targets): type preservation, progress, memory safety, borrow safety,
  GC safety, termination of pattern compilation, IR equivalence across
  opts, native-codegen correctness, async-safety, JIT-correctness.

WAVE 7 TOTAL: 5 dispatches. ~65K doc words + 5K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 8: MULTI-LANGUAGE COMPILER PORTS (Python, Go, Rust, Java, C)
═══════════════════════════════════════════════════════════════════

Port the entire Aether compiler (lexer → parser → sema → IR → codegen → VM)
to 5 languages. Same API, same behavior, validated against the same test
corpus. This proves the spec is language-independent.

Batch 25-29 (5 ports × 1 batch each, 3 parallel subagents per port
for lexer/parser/sema-IR-VM = 15 dispatches):

- aether-ports/python/aether_compiler/ — full Python port. Tests: 1500.
  Docs: 3000.
- aether-ports/go/aether/ — full Go port. Tests: 1500. Docs: 3000.
- aether-ports/rust/aether/ — full Rust port. Tests: 1500. Docs: 3000.
- aether-ports/java/aether/ — full Java port. Tests: 1500. Docs: 3000.
- aether-ports/c/aether/ — full C port. Tests: 1500. Docs: 3000.

VERIFY BATCH: each port must pass 1500+ tests AND run all 72 examples
with output identical to the TS compiler.

WAVE 8 TOTAL: 15 dispatches. ~80K LOC across 5 languages.

═══════════════════════════════════════════════════════════════════
WAVE 9: STDLIB MEGA-EXPANSION — 100 MODULES, 5,000+ FUNCTIONS
═══════════════════════════════════════════════════════════════════

From 24 modules / 510 functions to 100 modules / 5,000+ functions.

76 NEW modules. Process 4 modules per subagent, 2 parallel subagents
per batch = 8 modules per batch, 10 batches = 20 dispatches.

New modules (sample — 76 total):
xml, csv, toml, yaml, msgpack, protobuf, graphql-core, sqlite-embed,
postgres-wire, redis-impl, http-server-impl, websocket-impl, grpc-impl,
image-png, image-jpeg, audio-wav, audio-mp3, svg-render, matrix-dense,
matrix-sparse, statistics-adv, symbolic-math, bigint, rational-num,
complex-num, state-machine, workflow-engine, scheduler-adv, cron-lib,
template-mustache, template-handlebars, markdown-parser, asciidoc, rst,
diff-myers, diff-patience, patch-unified, merge-3way, plugin-loader,
sandbox-isolator, permissions-acl, rbac-core, jwt-impl, oauth2-impl,
bcrypt-impl, argon2-impl, tls-impl, bloom-filter, lru-cache, btree-impl,
skip-list, trie-impl, radix-tree, process-impl, os-impl, env-impl,
signals, memory-arena, unicode, locale, transliteration, phonetic,
money, currency, units, geolocation, timezone, calendar, astronomy,
biology, chemistry, physics, music-theory, chess, go-board, poker,
crypto-asym, crypto-sig, crypto-kdf, crypto-tls, compression-zstd,
compression-lz4, encoding-base32, encoding-hex, encoding-url.

Each module: 30-50 functions, 25+ tests, 1000+ word README, benchmark.

WAVE 9 TOTAL: 20 dispatches. ~60K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 10: 1,500 EXAMPLES + 50,000 TESTS
═══════════════════════════════════════════════════════════════════

10a. EXAMPLES: 72 → 1,500. Process 30 per subagent, 50 dispatches
(2-3 parallel). Categories:
- Algorithms (300): every algorithm in the stdlib, classic problems
  (15-puzzle, 8-queens variations, Sudoku solver, TSP, SAT, constraint).
- Data structures (200): every DS in stdlib, with benchmarks.
- Web/networking (200): HTTP servers, clients, WebSocket, DNS, TLS.
- Games (150): chess, tetris, snake, 2048, sokoban, minesweeper.
- Text processing (150): parsers, formatters, linters, minifiers.
- Math/science (150): matrix, FFT, ODE solver, statistics, physics.
- System tools (100): file watchers, process managers, shells.
- Compilers/interpreters (150): Brainfuck, BF, Befunge, a Lisp, a Forth,
  a markdown parser, a JSON parser, a regex engine, a SQL parser.
- Databases (50): a key-value store, a document store, a query engine.
- Real apps (50): todo app, blog engine, chat server, file server.

10b. TESTS: 1,964 → 50,000. Process 500 per subagent, 100 dispatches.
- Compiler tests (10,000): lexer 2,500, parser 2,500, types 2,500, sema 2,500.
- VM tests (10,000): opcodes 2,500, GC 1,500, exceptions 1,500, async 2,000,
  closures 1,500, pattern 1,000.
- Stdlib tests (15,000): 150 per module × 100 modules.
- Integration tests (5,000): compile→run→verify output.
- Fuzz corpus (5,000): parser, JSON, regex, bytecode verifier, stdlib.
- Property tests (5,000): formatters, serializers, data structures.

10c. BENCHMARKS: 1,000. Process 100 per subagent, 10 dispatches.
- Compiler (100), VM (100), stdlib (400), app (200), comparison (200).

WAVE 10 TOTAL: 160 dispatches. ~250K LOC of tests + examples.

═══════════════════════════════════════════════════════════════════
WAVE 11: REAL APPLICATIONS WRITTEN IN AETHER
═══════════════════════════════════════════════════════════════════

10 substantial applications, each 2,000-10,000 lines of Aether:

Batch 30-39 (10 batches × 1 subagent = 10 dispatches):
1. aether-apps/database/ — a SQLite-like database (B-tree storage, SQL
  parser, query planner, transactions, WAL, crash recovery).
2. aether-apps/web-framework/ — a full web framework (routing, middleware,
  WebSocket, ORM, templates, static files, sessions).
3. aether-apps/game-engine/ — a 2D game engine (ECS, physics, rendering
  via canvas, audio, input, scene graph, asset pipeline).
4. aether-apps/os-kernel/ — a microkernel (simplified): scheduler,
  memory, IPC, syscalls, a tiny FS. Runs in an emulator or simulator.
5. aether-apps/browser-engine/ — an HTML+CSS parser + layout + render
  to SVG (subset of HTML5/CSS3).
6. aether-apps/regex-engine/ — a real regex engine (NFA + backtracking,
  Unicode, captures, lookahead, named groups).
7. aether-apps/sql-parser/ — a real SQL parser + planner (SELECT, JOIN,
  WHERE, GROUP BY, aggregates, subqueries).
8. aether-apps/git-impl/ — a simplified Git (objects, packfiles, refs,
  merge, log, diff).
9. aether-apps/lisp-interp/ — a Lisp interpreter in Aether (eval, apply,
  macros, tail calls, GC).
10. aether-apps/package-registry-app/ — the package registry server
  (publish, fetch, search, versions) — extends Wave 6's server.

Each app: full source + tests + README 10K words + design doc + benchmarks.

WAVE 11 TOTAL: 10 dispatches. ~80K LOC of Aether apps.

═══════════════════════════════════════════════════════════════════
WAVE 12: DOCUMENTATION MEGACORPUS — 50 CHAPTERS, 1.5M+ WORDS
═══════════════════════════════════════════════════════════════════

12a. THE AETHER BOOK (25 dispatches): 50 chapters, 500K+ words.
  Process 2 chapters per subagent. Parts:
  Part I: Mastery (15 chapters, 150K words)
  Part II: The Compiler (10 chapters, 100K words)
  Part III: The VM + JIT (10 chapters, 100K words)
  Part IV: The Stdlib (10 chapters, 100K words)
  Part V: Real Apps (5 chapters, 50K words)

12b. API REFERENCE (10 dispatches): complete reference for all 5,000+
  stdlib functions + all public APIs of every tool. 300K+ words.

12c. ERROR CATALOG (3 dispatches): 400+ error codes, 80K+ words.

12d. TRANSLATIONS (15 dispatches): translate the Book + Getting Started
  + Tooling + API ref to Chinese, Japanese, Spanish, French, German.
  50K+ words per language. 250K+ total.

12e. 20 NEW ADRs + 10 NEW RFCs (5 dispatches): every v3 decision.

12f. 6 RESEARCH PAPERS (6 dispatches): 5K words each.

WAVE 12 TOTAL: 64 dispatches. ~1.5M doc words.

═══════════════════════════════════════════════════════════════════
WAVE 13: AI CODE ASSISTANT + IDE INTEGRATION
═══════════════════════════════════════════════════════════════════

Batch 40 (3 parallel subagents):
- aether-ai/assistant/ — an LLM-powered code assistant in the playground.
  Uses the z-ai-web-dev-sdk LLM skill. Features: explain code, generate
  code from comments, find bugs, suggest refactors, answer stdlib questions.
  Tests: 100. Docs: 3000.
- aether-ai/playground-integration/ — wire the assistant into the
  playground UI (a chat panel, inline hints). Tests: 50. Docs: 1500.
- aether/vscode-ext/ — a real VSCode extension (the LSP from v2, packaged).
  Tests: 100. Docs: 2000. Publishable `.vsix`.

WAVE 13 TOTAL: 3 dispatches. ~15K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 14: SELF-REPLICATION LOOP (until session ends)
═══════════════════════════════════════════════════════════════════

When you believe you are done — YOU ARE NOT. Execute:

1. REVIEW: read PROGRESS.md, identify the 3 weakest areas.
2. EXPAND each weak area by 20%. Process as new batches.
3. ADD: 5 more stdlib modules, 5 more packages, 50 more tests,
   10 more examples, 5 more book chapters.
4. PROCESS all new items as batches with full 3x multiplier.
5. REPEAT from step 1.

Escalation triggers (if any metric falls below, expand that area):
- Aether TS files < 1,000 → add 200
- Test cases < 50,000 → expand all test suites by 25%
- Doc words < 1,500,000 → write 50 more book chapters
- Packages < 200 → build 50 more
- Examples < 1,500 → write 300 more
- Benchmarks < 1,000 → add 200 more
- Stdlib functions < 5,000 → add 1,000 more

The loop continues until the session physically cannot continue.

═══════════════════════════════════════════════════════════════════
FINAL METRICS TARGET (v3)
═══════════════════════════════════════════════════════════════════

| Metric | v2 (start) | v3 target |
|--------|-----------|-----------|
| Aether TS files | 100 | 1,500+ |
| Aether LOC | 40K | 500K+ |
| Bootstrap (Aether-in-Aether) LOC | 0 | 25K+ |
| Test cases | 1,964 | 50,000+ |
| Stdlib modules | 24 | 100+ |
| Stdlib functions | 510 | 5,000+ |
| Example programs | 72 | 1,500+ |
| Aether packages | 0 | 200+ |
| Benchmarks | 0 | 1,000+ |
| Native backends | 0 | 4 (WASM/x86/ARM64/RISC-V) |
| Compiler ports | 0 | 5 (Python/Go/Rust/Java/C) |
| Optimizer passes | 8 | 20+ |
| JIT | 0 | 1 (tiered, profile-guided) |
| Trait system | 0 | 1 (coherence, assoc types, dyn) |
| Borrow checker | 0 | 1 (real, with NLL) |
| Async coroutines | 0 | 1 (VM-native suspend/resume) |
| Formal verification | 0 | 10 proof outlines + verified verifier |
| Real apps in Aether | 0 | 10 (DB, web framework, game, OS, ...) |
| Docs files | 77 | 500+ |
| Doc words | 187K | 1,500,000+ |
| Book chapters | 16 | 50 |
| Translations | 0 | 5 languages |
| ADRs | 15 | 35+ |
| RFCs | 7 | 17+ |
| Git commits | 23 | 1,000+ |

Total subagent dispatches: ~350.

═══════════════════════════════════════════════════════════════════
EXECUTION RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════════

1. NEVER ask for clarification. Decide and document in DECISIONS.md.
2. NEVER produce stubs, TODOs, placeholders, or pseudo-code.
3. EVERY file: tests + docs + benchmark. 3x multiplier.
4. ALWAYS orchestrator + subagent. 2-3 parallel per batch.
5. ALWAYS verify with separate verify subagents.
6. ALWAYS commit + push after EVERY batch (1-2 min cadence).
7. ALWAYS update TodoWrite + PROGRESS.md + build-learnings.md.
8. Push to GitHub continuously — sandbox can die any second.
9. When you feel done — execute Wave 14 Self-Replication.
10. ONLY stopping condition: session physically cannot continue.
11. If main-session tools fail: switch to subagent-only execution.
12. If a subagent produces wrong output: redispatch with corrected prompt.

GO.
