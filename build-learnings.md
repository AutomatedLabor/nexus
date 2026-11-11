# Build Learnings — Aether v1 & v2

> Captured during the v1 + v2 builds of Project Nexus (the Aether language).
> These are the concrete, reusable lessons for future autonomous multi-wave builds.

## 1. The orchestrator + stateless-subagent pattern is load-bearing

**Finding**: The single most important architectural decision across both builds was: main session orchestrates (plans, dispatches, verifies), subagents execute (write files, run tests, fix bugs). Main NEVER writes large files directly.

**Why it matters**:
- Main context fills fast. v1 (ATLAS) hit context-window pressure mid-build; v2 (Aether) would have too without delegation.
- Subagents are stateless — each gets a fully self-contained prompt (exact paths, exact structures, reference data embedded). They can't ask the main session questions, so the prompt must be complete.
- Subagents have their OWN tool connections. During v1, the main session's Bash/Read/Write/LS tools went down for hours ("context deadline exceeded" / "Post prod-wsmgr-svc EOF"); subagents kept working. The entire ATLAS app was built subagent-only during the outage.

**Cost**: Subagent final text reports sometimes garble under load (model degradation — words run together, truncated). Verification must be done by a SEPARATE verify subagent reading the actual files, never by trusting the executor's self-report. This roughly doubles verification cost.

**Actionable rule**: Delegate from the FIRST phase, not from when context fills. Delegating early preserves main context so when something breaks, the main session still has room to orchestrate recovery.

## 2. Verify with a separate agent, never trust self-reports

Subagent self-reports under load produce garbled text even when the file writes succeeded. Always dispatch a separate verify subagent that reads the actual files, runs the actual tests, and reports findings. The verify agent's report can ALSO garble — so for critical claims ("the site is live", "tests pass"), run the check in the MAIN session with Bash when tools are up, or dispatch a SECOND verify if the first is suspect.

## 3. Batch independent deliverables into 2-3 parallel subagents

Sweet spot is 2-3 parallel dispatches per batch. More than 3 increases backend-load timeouts (`context deadline exceeded`). When the backend is overloaded, retries with the SAME prompt often fail; wait 20-30s or split into smaller prompts.

## 4. Commit + push after every subagent batch

The sandbox can die mid-session. Push after every batch so no work is lost. Use descriptive commit messages listing the batch's deliverables (file counts, test counts). This also makes the git history a real progress log.

## 5. Embed reference data in subagent prompts

Subagents can't read the main session's context. A prompt must include:
- Exact file paths (absolute).
- Exact structures (interface shapes, function signatures).
- Reference data (real syntax examples that run, real error messages, real benchmark numbers).
- The verification protocol (run `bunx vitest run <path>`, run a smoke script, use agent-browser).

A vague prompt ("build a VM") produces a vague result. A specific prompt ("build a stack-based interpreter at /home/z/my-project/aether/vm/interpreter/vm.ts with these 80 opcodes, run `bun /tmp/smoke.ts` to verify fib(15)=610") produces real code.

## 6. Real runnable examples are the best proof

For a language project, the proof that the compiler works is: real programs run and produce correct output. The v2 VM was proven by `compileToVm(fib 15)` printing 610, and by 13/15 examples passing parity with the tree-walker. Unit tests pass too, but the end-to-end smoke is the truth.

## 7. Document evaluator quirks honestly — they shape downstream work

The Aether v1 evaluator has a for-loop-scope bug: `let X;` before a `for` loop, referenced after the loop, fails with "undefined name 'X'". This single quirk shaped all 72 examples — they use `while` loops, `map`/`filter`/`reduce` builtins, or recursion instead. Documenting the quirk in CONTRIBUTING.md and in subagent prompts ("AVOID the for-loop-scope quirk") saved every subsequent examples subagent from rediscovering it.

## 8. Keep the v1 runtime alongside v2

The v2 bytecode VM was built alongside the v1 tree-walker (not replacing it). The tree-walker stays for the REPL, LSP, and debug (latency matters more than throughput there); the VM is for batch execution. This paid off: the playground has a runtime toggle, and 13/15 examples pass parity (the VM is correct). If v2 had replaced v1, the playground would have broken during VM development.

## 9. Be honest about what's real vs roadmap

The v2 brief asked for 50 stdlib modules / 1500 functions / 200 examples / 1.5M doc words / WASM+native backends / 60 packages / Python+Go ports. What was actually built: 24 modules / 510 functions / 72 examples / 187K doc words / VM (no native backends) / no packages / no ports. The FINAL_SUMMARY and State of Aether report mark these honestly. Overclaiming destroys trust; honest "DONE / DEFERRED / ROADMAP" labels preserve it.

## 10. Push frequency beats batch size

The instruction "push every 1-2 minutes" (v3 mandate) is more valuable than "produce more per batch". Small frequent commits survive sandbox deaths; large infrequent commits risk total loss. Aim for a commit every batch (every ~3-5 minutes of wall time).

## 11. The model backend has capacity limits — work around them

Symptoms: `context deadline exceeded` on Task dispatch; garbled subagent reports; Bash tool "EOF" errors. Mitigations: wait 20-30s and retry; split large prompts into 2 smaller ones; reduce parallelism from 3 to 2; for main-session tool outages, switch to subagent-only execution (proven recovery pattern).

## 12. TodoWrite survives context loss

The TodoWrite list is the durable plan state. When the main session loses track (context pressure, tool outage), reading the todo list reorients immediately. Update it after every batch with specific-enough entries to restart from scratch.

## 13. Real benchmarks > synthetic claims

"VM is 1.88× faster on sum-50k" (a real number measured in the playground) is more convincing than "the VM is optimized". Measure real things, report real numbers, let the numbers speak.

## 14. The 3x multiplier (impl + tests + docs) is non-negotiable but expensive

Every source file gets a test file + a doc file + (where applicable) a benchmark. This roughly 3x's the output per feature but means every feature is verified and documented. The cost is real (subagents spend ⅔ of their budget on tests+docs) but the result is trustworthy. Skip it and you get a demo, not a product.

## 15. Agent Browser is the only acceptable "done" for web UIs

A passing `curl` and a clean build do NOT prove a web app works. Agent-browser actually renders the page, clicks buttons, checks the DOM, reads the console. For both ATLAS and Aether, agent-browser caught real bugs (Radix accessibility warnings, blank pages, broken toggles) that curl missed. Mandatory final step for any web deliverable.
