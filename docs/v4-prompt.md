# Project Nexus — v4 PROMPT (The Self-Hosted, Distributed, AI-Native, Formally-Mechanized Aether)

> v1 built a tree-walking interpreter (~12K LOC).
> v2 added a bytecode VM + toolchain (~40K LOC, 1964 tests).
> v3 added WASM/x86/JIT backends + traits + borrow + async + 37 packages + 2 ports + formal docs (~127K LOC, 3010 tests).
> **v4 is 1000× of v1+v2+v3 combined**: a FULLY self-hosted compiler (Aether compiles Aether end-to-end in Aether), a distributed runtime, an AI-native toolchain (the language understands itself), mechanized formal proofs (Coq/Lean), a package registry with a THOUSAND packages, 5 more native backends (ARM64, RISC-V, MIPS, PowerPC, WebGPU), 5 more compiler ports (Rust, Java, C, Zig, Kotlin), a tier-3 JIT with real in-memory native codegen, a real OS kernel written in Aether, a browser engine, a database engine, a distributed KV store with Raft, and 5M+ words of docs in 10 languages. All running live.

Repository: https://github.com/AutomatedLabor/nexus (push continuously — every batch)
Deploy: Vercel (project `prj_Lm4i6O1xs42HG9c9koMserbzNlNj`)
Auth: GitHub PAT + Vercel token are in the chat context (NEVER commit them — Push Protection blocks).

═══════════════════════════════════════════════════════════════════
THE NON-NEGOTIABLE PROCESSING PROTOCOL (proven across v1+v2+v3)
═══════════════════════════════════════════════════════════════════

1. Main session = orchestrator ONLY. Never writes large files directly.
2. Dispatch 2-3 parallel subagents per batch (sweet spot; >3 overloads backend).
3. Each subagent prompt FULLY self-contained: exact paths, exact structures, reference data embedded, verification protocol specified.
4. After each batch: verify by reading ACTUAL files (never trust self-reports — they garble under load).
5. **Git commit + push after EVERY batch (1-2 min cadence).** The sandbox can die any second.
6. Update TodoWrite after every batch. Update build-learnings.md + PROGRESS.md.
7. If main-session tools fail: switch to subagent-only execution (proven recovery).
8. If a subagent exceeds 200 turns or hits `context deadline exceeded`: check the filesystem (work usually landed), commit the partial progress, retry with a tighter prompt. NEVER lose work.
9. NEVER paste real tokens into committed files (GitHub Push Protection blocks).

For EVERY source file: ALSO create a test file (15+ cases), a doc file (500+ words), a benchmark where applicable. 3x multiplier.

═══════════════════════════════════════════════════════════════════
v4 STARTING STATE (from v3 — all verified working + live)
═══════════════════════════════════════════════════════════════════

- ~127K total LOC (166 TS files/67K LOC + 278 .ae files/50K LOC + Go 5.6K + Python 4.4K).
- 5 runtimes (tree-walker, bytecode VM, WASM, x86, JIT) — all run fib(10)=55 in the browser.
- Trait system, borrow checker, async coroutines, AI code assistant.
- 53 stdlib modules, 806 functions. 37 Aether packages. 6 apps. 187 examples. 2 compiler ports.
- Formal docs (50.5K words, outlines only). ~298K doc words total. 25 ADRs, 12 RFCs, 26 book chapters.
- Self-hosting: lexer.ae + ast.ae + parser.ae written in Aether (648 tests). Sema/IR/codegen/VM-in-Aether NOT YET DONE — this is v4 Wave 1.
- Live playground at https://nexus-aip-roj-builder.vercel.app.

═══════════════════════════════════════════════════════════════════
WAVE 1: FULL SELF-HOSTING BOOTSTRAP — THE CANONICAL MILESTONE
═══════════════════════════════════════════════════════════════════

Complete what v3 started: rewrite the ENTIRE compiler + VM in Aether. After this, Aether is a "real" language by the canonical definition (it compiles itself end-to-end).

Batch 1 (3 parallel subagents):
- aether-bootstrap/sema.ae — name resolution + type checker in Aether (~1800 lines). Mirrors aether/core/sema/sema.ts. Tests: 400. Docs: 2500 words.
- aether-bootstrap/ir.ae — IR + lowerToIr in Aether (~1000 lines). Mirrors aether/core/ir/ir.ts. Tests: 200. Docs: 1500 words.
- aether-bootstrap/codegen.ae — IR → bytecode compiler in Aether (~800 lines). Mirrors aether/vm/codegen/codegen.ts. Tests: 200. Docs: 1500 words.

Batch 2 (2 parallel subagents):
- aether-bootstrap/vm.ae — the bytecode VM written in Aether (~1500 lines). Mirrors aether/vm/interpreter/vm.ts. Tests: 400. Docs: 3000 words.
- aether-bootstrap/main.ae — the bootstrap driver: reads .ae, lexes, parses, checks, lowers, compiles, runs — ALL in Aether. Tests: 50 end-to-end (compile+run all 187 existing examples via the bootstrap, output matches the TS compiler).

VERIFY BATCH: compile the bootstrap compiler with the TS compiler, then use the bootstrap to compile+run all 187 examples. Output must match. THIS IS THE BOOTSTRAP MILESTONE.

WAVE 1 TOTAL: 7 subagent dispatches. ~30K LOC of Aether.

═══════════════════════════════════════════════════════════════════
WAVE 2: 5 MORE NATIVE BACKENDS — ARM64 + RISC-V + MIPS + PowerPC + WebGPU
═══════════════════════════════════════════════════════════════════

5 batches (1 subagent each, but can parallelize 2-3):
- aether/vm/arm64/ — IR → AArch64 assembly + structured interpreter. fib(10)=55. Tests: 200. Docs: 4000 words.
- aether/vm/riscv/ — IR → RISC-V assembly + structured interpreter. fib(10)=55. Tests: 200. Docs: 3000.
- aether/vm/mips/ — IR → MIPS assembly. Tests: 150. Docs: 3000.
- aether/vm/ppc/ — IR → PowerPC assembly. Tests: 150. Docs: 3000.
- aether/vm/webgpu/ — IR → WGSL (WebGPU Shading Language) for GPU compute. Tests: 100. Docs: 4000.

VERIFY BATCH: compile 20 programs through EACH backend, verify output matches the tree-walker. Performance: 7-way comparison (tree/VM/WASM/x86/ARM64/RISC-V/JIT).

WAVE 2 TOTAL: 7 dispatches. ~40K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 3: 5 MORE COMPILER PORTS — Rust + Java + C + Zig + Kotlin
═══════════════════════════════════════════════════════════════════

5 batches (1 subagent each):
- aether-ports/rust/aether_compiler/ — full Rust port (lexer→parser→sema→ir→codegen→vm). Tests: 1500. Docs: 3000.
- aether-ports/java/aether_compiler/ — full Java port. Tests: 1500. Docs: 3000.
- aether-ports/c/aether_compiler/ — full C port. Tests: 1500. Docs: 3000.
- aether-ports/zig/aether_compiler/ — full Zig port. Tests: 1500. Docs: 3000.
- aether-ports/kotlin/aether_compiler/ — full Kotlin port. Tests: 1500. Docs: 3000.

VERIFY: each port passes 1500+ tests AND runs all 187 examples with output identical to the TS compiler. 7 compiler implementations (TS + Python + Go + Rust + Java + C + Zig + Kotlin) — proves the spec is language-independent.

WAVE 3 TOTAL: 5 dispatches. ~100K LOC across 5 languages.

═══════════════════════════════════════════════════════════════════
WAVE 4: TIER-3 JIT WITH REAL IN-MEMORY NATIVE CODEGEN + DEOPT
═══════════════════════════════════════════════════════════════════

The v3 JIT was tier-2 (specialized JS codegen). v4 adds tier-3: emit real x86-64 machine code into an mmap'd executable buffer, with deoptimization back to the VM.

Batch (3 subagents):
- aether/vm/jit/x86-emit/ — a real x86-64 instruction encoder (mov, add, sub, cmp, jmp, call, ret, push, pop, etc.). Tests: 200. Docs: 4000.
- aether/vm/jit/tier3/ — profile-guided tier-3 compiler: hot loops → x86 machine code in an mmap'd buffer, execute. Deopt side-table. Tests: 200. Docs: 5000.
- aether/vm/jit/inliner-v2/ — profile-guided inlining + escape analysis + allocation elision at JIT time. Tests: 150. Docs: 3000.

VERIFY: benchmarks — tree/VM/WASM/x86/JIT-tier2/JIT-tier3. Target: tier-3 within 2× of hand-written C.

WAVE 4 TOTAL: 3 dispatches. ~25K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 5: PACKAGE REGISTRY + 1000 PACKAGES WRITTEN IN AETHER
═══════════════════════════════════════════════════════════════════

A real package registry (server + client) hosting 1000 Aether packages.

Batch (2 subagents):
- aether-registry/server.ts — a real HTTP registry server (Next.js API routes): publish, fetch, search, versions, auth, dependency resolution, SemVer, tarball storage. Storage: SQLite via Prisma. Tests: 300. Docs: 4000.
- aether-registry/client/ — the `aether pkg` CLI: add, remove, update, publish, search, info, lockfile, cache. Tests: 200. Docs: 3000.

Batches for 1000 packages (process 20 per subagent, 50 batches):
Each package: 200-1000 lines of Aether, full tests, README 5K words, aether.toml, CHANGELOG. Categories: web (200), data (150), cli (100), algorithms (100), auth (50), game (50), dev (50), science (100), crypto (50), net (50), misc (100).

WAVE 5 TOTAL: 52 dispatches. ~500K LOC of Aether packages.

═══════════════════════════════════════════════════════════════════
WAVE 6: REAL OPERATING SYSTEM KERNEL IN AETHER
═══════════════════════════════════════════════════════════════════

A microkernel written in Aether (runs in a simulator/emulator since Aether runs in a VM, not on bare metal).

Batches (5):
- aether-os/kernel/ — scheduler, context switching (simulated), syscalls, interrupts (simulated). Tests: 200. Docs: 5000.
- aether-os/mm/ — memory management (bump allocator, page-frame allocator, virtual memory simulation). Tests: 150. Docs: 4000.
- aether-os/ipc/ — IPC (message passing, channels, shared memory). Tests: 100. Docs: 3000.
- aether-os/fs/ — a tiny filesystem (in-memory: inodes, directory tree, read/write/ls/mkdir). Tests: 150. Docs: 4000.
- aether-os/shell/ — a shell (pipes, redirection, globbing, scripting). Tests: 150. Docs: 3000.

WAVE 6 TOTAL: 5 dispatches. ~40K LOC of Aether.

═══════════════════════════════════════════════════════════════════
WAVE 7: DISTRIBUTED SYSTEMS — RAFT + KV STORE + MAPREDUCE
═══════════════════════════════════════════════════════════════════

Real distributed algorithms implemented in Aether, tested with simulated networks.

Batches (4):
- aether-distributed/raft/ — Raft consensus (leader election, log replication, commit, snapshot). Simulated 5-node cluster. Tests: 300. Docs: 5000.
- aether-distributed/kv/ — a distributed KV store built on Raft. Tests: 200. Docs: 4000.
- aether-distributed/mapreduce/ — MapReduce (map, shuffle, reduce, word count demo). Tests: 150. Docs: 3000.
- aether-distributed/paxos/ — Paxos (basic Paxos + multi-Paxos). Tests: 150. Docs: 3000.

WAVE 7 TOTAL: 4 dispatches. ~30K LOC of Aether.

═══════════════════════════════════════════════════════════════════
WAVE 8: AI-NATIVE TOOLCHAIN — THE LANGUAGE UNDERSTANDS ITSELF
═══════════════════════════════════════════════════════════════════

The v3 AI assistant answered questions. v4 makes the AI a first-class citizen: the compiler, LSP, linter, formatter, and test runner all use LLM calls.

Batches (5):
- aether-ai/codegen/ — generate Aether from natural language ("write a function that sorts an array"). Tests: 100. Docs: 3000.
- aether-ai/refactor/ — AI-driven refactoring (extract function, inline, rename). Tests: 100. Docs: 3000.
- aether-ai/explain/ — explain a codebase (architecture, data flow, dependencies). Tests: 100. Docs: 3000.
- aether-ai/testgen/ — generate tests for a function (property-based + example-based). Tests: 100. Docs: 3000.
- aether-ai/debug/ — AI debugger: given a failing test, locate the bug + suggest a fix. Tests: 100. Docs: 3000.

WAVE 8 TOTAL: 5 dispatches. ~20K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 9: MECHANIZED FORMAL VERIFICATION (Coq + Lean)
═══════════════════════════════════════════════════════════════════

v3's formal proofs were paper outlines. v4 mechanizes them in Coq and Lean4.

Batches (4):
- formal/coq/ — Coq proofs of progress + preservation for the core type system. .v files, compile with coqc. Tests: proof compiles. Docs: 5000.
- formal/lean/ — Lean4 proofs of the bytecode verifier's safety theorem. .lean files. Docs: 5000.
- formal/agda/ — Agda proofs of the borrow checker's safety. .agda files. Docs: 4000.
- formal/isabelle/ — Isabelle/HOL proofs of the JIT's correctness (deopt preserves semantics). Docs: 4000.

WAVE 9 TOTAL: 4 dispatches. ~50K LOC of proof code + docs.

═══════════════════════════════════════════════════════════════════
WAVE 10: STDLIB TO 200 MODULES / 10,000 FUNCTIONS
═══════════════════════════════════════════════════════════════════

From 53 modules / 806 functions to 200 modules / 10,000 functions. Process 4 modules per subagent, 37 batches.

New modules (147 new): every stdlib from Rust, Python, Go, Node — collections, concurrency, crypto (TLS, X.509, PKI), networking (HTTP/2, HTTP/3, QUIC, gRPC, WebSocket), data (Parquet, Arrow, Avro, Protobuf, Thrift), ML (tensors, autograd, a tiny neural net), graphics (canvas, SVG, raster ops), audio (PCM, WAV, MP3 decode), video, encoding (every format), math (arbitrary precision, FFT, sparse linear algebra), OS (process, fs, signals), text (Unicode, collation, segmentation), time (calendar, timezone, duration), serialization, and more.

WAVE 10 TOTAL: 37 dispatches. ~200K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 11: 1,500 EXAMPLES + 50,000 TESTS + 1,000 BENCHMARKS
═══════════════════════════════════════════════════════════════════

Examples: 187 → 1,500. Tests: 3,010 → 50,000. Benchmarks: 0 → 1,000. Process in batches of 30 examples / 500 tests / 50 benchmarks.

WAVE 11 TOTAL: ~120 dispatches. ~300K LOC of tests + examples.

═══════════════════════════════════════════════════════════════════
WAVE 12: DOCS MEGACORPUS — 5M+ WORDS, 10 LANGUAGES
═══════════════════════════════════════════════════════════════════

- The Aether Book: 26 → 100 chapters, 1M words.
- API reference: 10K functions, 1.5M words.
- Translations: Chinese, Japanese, Spanish, French, German, Russian, Portuguese, Korean, Hindi, Arabic (10 languages × 50K words = 500K).
- 100 ADRs, 50 RFCs.
- 20 research papers.

WAVE 12 TOTAL: ~80 dispatches. ~5M doc words.

═══════════════════════════════════════════════════════════════════
WAVE 13: REAL IDE + BROWSER EXTENSION
═══════════════════════════════════════════════════════════════════

- aether-ide/ — a real web-based IDE (Monaco editor + the LSP + AI assistant + debugger + package browser). Deploy to Vercel.
- aether-vscode/ — a publishable VSCode extension (.vsix).
- aether-browser-ext/ — a browser extension to run Aether snippets on any page.

WAVE 13 TOTAL: 3 dispatches. ~30K LOC.

═══════════════════════════════════════════════════════════════════
WAVE 14: SELF-REPLICATION LOOP (until session ends)
═══════════════════════════════════════════════════════════════════

When you believe you are done — YOU ARE NOT. Execute:

1. REVIEW: read PROGRESS.md, identify the 3 weakest areas.
2. EXPAND each weak area by 20%.
3. ADD: 5 more stdlib modules, 5 more packages, 50 more tests, 10 more examples, 5 more book chapters.
4. PROCESS all new items as batches with full 3x multiplier.
5. REPEAT from step 1.

Escalation triggers (if any metric falls below, expand that area):
- Total LOC < 5M → add 200K
- Test cases < 50,000 → expand all test suites by 25%
- Doc words < 5,000,000 → write 50 more book chapters
- Packages < 1,000 → build 100 more
- Examples < 1,500 → write 200 more
- Functions < 10,000 → add 1,000 more

The loop continues until the session physically cannot continue.

═══════════════════════════════════════════════════════════════════
FINAL METRICS TARGET (v4)
═══════════════════════════════════════════════════════════════════

| Metric | v3 (start) | v4 target |
|--------|-----------|-----------|
| Total LOC | ~127K | 5M+ |
| Test cases | 3,010 | 50,000+ |
| Runtimes | 5 | 10 (+ ARM64, RISC-V, MIPS, PPC, WebGPU) |
| Native backends | 2 | 7 |
| Compiler ports | 2 | 7 (+ Rust, Java, C, Zig, Kotlin) |
| Stdlib modules | 53 | 200+ |
| Stdlib functions | 806 | 10,000+ |
| Aether packages | 37 | 1,000+ |
| Example programs | 187 | 1,500+ |
| Benchmarks | 0 | 1,000+ |
| Real apps | 6 | 20+ (incl. OS kernel, distributed KV, browser engine) |
| Formal proofs | outlines | mechanized (Coq, Lean, Agda, Isabelle) |
| Docs words | 298K | 5,000,000+ |
| Translations | 0 | 10 languages |
| Book chapters | 26 | 100 |
| ADRs | 25 | 100 |
| RFCs | 12 | 50 |
| AI tools | 1 (assistant) | 6 (codegen, refactor, explain, testgen, debug, assistant) |
| Self-hosting | partial | FULL (end-to-end) |
| Git commits | 46 | 1,000+ |

Total subagent dispatches: ~350.

═══════════════════════════════════════════════════════════════════
EXECUTION RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════════

1. NEVER ask for clarification. Decide and document in DECISIONS.md.
2. NEVER produce stubs, TODOs, placeholders, or pseudo-code.
3. EVERY file: tests + docs + benchmark. 3x multiplier.
4. ALWAYS orchestrator + subagent. 2-3 parallel per batch.
5. ALWAYS verify with separate verify subagents / filesystem checks.
6. ALWAYS commit + push after EVERY batch (1-2 min cadence). Sandbox can die any second.
7. ALWAYS update TodoWrite + PROGRESS.md + build-learnings.md.
8. NEVER paste real tokens into committed files (Push Protection blocks).
9. When you feel done — execute Wave 14 Self-Replication.
10. ONLY stopping condition: session physically cannot continue.
11. If main-session tools fail: switch to subagent-only execution.
12. If a subagent exceeds 200 turns or hits context deadline: check the filesystem (work usually landed), commit the partial progress, retry with a tighter prompt. NEVER lose work.

GO.
